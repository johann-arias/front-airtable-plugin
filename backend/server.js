import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const ALLOWED_ATTACHMENT_FIELDS = ['Visa', 'Passport', 'Driving license', 'International driving license'];

const {
  AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID,
  AIRTABLE_RIDERS_TABLE = 'Riders',
  AIRTABLE_EMAIL_FIELD = 'Mail',
  AIRTABLE_VISA_FIELD = 'Visa',
  PUBLIC_URL,
  PORT = 4000,
} = process.env;

const uploadsMeta = new Map();

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function getBaseUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL.replace(/\/$/, '');
  const host = req?.get?.('host') || req?.headers?.host;
  const proto = req?.get?.('x-forwarded-proto') || req?.protocol || 'http';
  return host ? `${proto}://${host}` : `http://localhost:${PORT}`;
}

async function fetchRidersByEmail(email) {
  const baseId = (AIRTABLE_BASE_ID || '').trim();
  const tableNameOrId = (AIRTABLE_RIDERS_TABLE || 'Riders').trim();
  const tableId = encodeURIComponent(tableNameOrId);
  const fieldName = AIRTABLE_EMAIL_FIELD;
  // Airtable formula: exact match on email; escape single quotes in email
  const safeEmail = String(email).replace(/'/g, "\\'");
  const formula = `{${fieldName}}='${safeEmail}'`;
  const url = `https://api.airtable.com/v0/${baseId}/${tableId}?filterByFormula=${encodeURIComponent(formula)}`;

  console.log('[Airtable] Request:', { baseId, table: tableNameOrId, email });
  if (!baseId) {
    throw new Error('AIRTABLE_BASE_ID is not set in .env');
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404) {
      console.error('[Airtable] 404 – Check: base ID (from base URL appXXX), table name/ID (exact as in Airtable), token scope.');
      console.error('[Airtable] URL used: https://api.airtable.com/v0/' + baseId + '/' + tableNameOrId + '?filterByFormula=...');
    }
    throw new Error(`Airtable error: ${res.status} ${text}`);
  }

  const json = await res.json();
  const records = json.records || [];

  // Log raw Airtable response for date debugging
  records.forEach((rec, i) => {
    const fields = rec.fields || {};
    const fieldKeys = Object.keys(fields);
    const dateLikeKeys = fieldKeys.filter((k) => /tour|start|end|date|Date/i.test(k));
    console.log('[Airtable] Record', i + 1, 'id:', rec.id);
    console.log('[Airtable] All field keys:', fieldKeys);
    dateLikeKeys.forEach((k) => {
      console.log('[Airtable]   ', k, '=>', JSON.stringify(fields[k]));
    });
  });

  return records;
}

async function getRecord(recordId) {
  const baseId = (AIRTABLE_BASE_ID || '').trim();
  const tableId = encodeURIComponent((AIRTABLE_RIDERS_TABLE || 'Riders').trim());
  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${tableId}/${encodeURIComponent(recordId)}`,
    { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
  );
  if (!res.ok) throw new Error(`Airtable GET: ${res.status} ${await res.text()}`);
  return res.json();
}

async function patchRecord(recordId, fields) {
  const baseId = (AIRTABLE_BASE_ID || '').trim();
  const tableId = encodeURIComponent((AIRTABLE_RIDERS_TABLE || 'Riders').trim());
  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${tableId}/${encodeURIComponent(recordId)}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) throw new Error(`Airtable PATCH: ${res.status} ${await res.text()}`);
  return res.json();
}

app.get('/api/uploads/:id', (req, res) => {
  const id = req.params.id;
  const meta = uploadsMeta.get(id);
  const filePath = meta?.filePath || path.join(UPLOADS_DIR, id);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.setHeader('Content-Type', meta?.mimetype || 'application/octet-stream');
  res.sendFile(path.resolve(filePath));
});

function isAllowedProxyUrl(url, req) {
  const host = url.hostname.toLowerCase();
  if (host.endsWith('airtableusercontent.com') || host === 'dl.airtable.com') return true;
  try {
    const base = new URL(getBaseUrl(req));
    if (url.hostname === base.hostname && url.protocol === base.protocol) return true;
  } catch {}
  return false;
}

app.get('/api/attachments/proxy', async (req, res) => {
  const rawUrl = req.query?.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'Missing query parameter: url' });
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }
  if (!isAllowedProxyUrl(url, req)) {
    return res.status(403).json({ error: 'Proxy only allows Airtable and same-origin URLs' });
  }
  try {
    const proxyRes = await fetch(url.toString(), { redirect: 'follow' });
    if (!proxyRes.ok) {
      return res.status(proxyRes.status).send(await proxyRes.text());
    }
    const contentType = proxyRes.headers.get('content-type') || 'application/octet-stream';
    const contentDisposition = proxyRes.headers.get('content-disposition');
    res.setHeader('Content-Type', contentType);
    if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);
    Readable.fromWeb(proxyRes.body).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
});

async function handleAttachmentUpload(req, res, fieldName) {
  const { recordId } = req.params;
  if (!req.file?.buffer) {
    return res.status(400).json({ error: 'No file. Send multipart/form-data with field "file".' });
  }
  if (!ALLOWED_ATTACHMENT_FIELDS.includes(fieldName)) {
    return res.status(400).json({ error: `Invalid field. Allowed: ${ALLOWED_ATTACHMENT_FIELDS.join(', ')}` });
  }
  try {
    ensureUploadsDir();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const ext = path.extname(req.file.originalname || '') || '';
    const filePath = path.join(UPLOADS_DIR, `${id}${ext}`);
    fs.writeFileSync(filePath, req.file.buffer);
    const baseUrl = getBaseUrl(req);
    const fileUrl = `${baseUrl}/api/uploads/${id}${ext}`;
    uploadsMeta.set(`${id}${ext}`, { filePath, mimetype: req.file.mimetype || 'application/octet-stream' });

    const existing = await getRecord(recordId);
    const current = existing.fields?.[fieldName] || [];
    const attachments = Array.isArray(current) ? current : [];
    await patchRecord(recordId, { [fieldName]: [...attachments, { url: fileUrl }] });

    res.json({ ok: true, url: fileUrl, record: await getRecord(recordId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

app.post('/api/riders/:recordId/visa', upload.single('file'), (req, res) => handleAttachmentUpload(req, res, AIRTABLE_VISA_FIELD || 'Visa'));

app.post('/api/riders/:recordId/attachments', upload.single('file'), async (req, res) => {
  const fieldName = (req.body?.field || req.query?.field || '').trim();
  if (!fieldName) return res.status(400).json({ error: 'Missing "field" (e.g. Visa, Passport, Driving license, International driving license).' });
  return handleAttachmentUpload(req, res, fieldName);
});

app.get('/api/riders', async (req, res) => {
  const email = req.query.email?.trim();
  if (!email) {
    return res.status(400).json({ error: 'Query parameter "email" is required' });
  }
  try {
    const records = await fetchRidersByEmail(email);
    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Debug: see what base/table we're using (no secrets)
app.get('/api/debug', (req, res) => {
  const baseId = (AIRTABLE_BASE_ID || '').trim();
  const table = (AIRTABLE_RIDERS_TABLE || 'Riders').trim();
  res.json({
    baseId: baseId ? `${baseId.slice(0, 6)}...${baseId.slice(-4)}` : '(not set)',
    baseIdLength: baseId.length,
    table,
    tableLength: table.length,
    hint: '404 = wrong base ID or table. Base ID is in the base URL (appXXXXXXXX). Use exact table name or table ID (tblXXXXXXXX).',
  });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn('Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID in .env for /api/riders to work.');
  }
});
