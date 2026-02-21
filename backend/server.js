import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const {
  AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID,
  AIRTABLE_RIDERS_TABLE = 'Riders',
  AIRTABLE_EMAIL_FIELD = 'Mail',
  PORT = 4000,
} = process.env;

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
