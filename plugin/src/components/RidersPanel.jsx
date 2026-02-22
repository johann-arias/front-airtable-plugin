import { useEffect, useState } from 'react';
import { useFrontContext } from '../providers/frontContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function uploadAttachment(recordId, fieldName, file, onSuccess) {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('field', fieldName);
  const res = await fetch(`${API_BASE}/api/riders/${recordId}/attachments`, { method: 'POST', body: form });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || res.statusText || 'Upload failed');
  }
  onSuccess?.();
}

const DOCUMENT_FIELDS = [
  { key: 'Visa', label: 'Visa' },
  { key: 'Passport', label: 'Passport' },
  { key: 'Driving license', label: 'Driving license' },
  { key: 'International driving license', label: 'International driving license' },
];

function getAttachmentLinkUrl(url) {
  if (!url) return '#';
  const base = API_BASE.replace(/\/$/, '');
  if (url.startsWith(base)) return url;
  return `${base}/api/attachments/proxy?url=${encodeURIComponent(url)}`;
}

function getConversationEmail(context) {
  const conv = context?.conversation;
  if (!conv) return null;
  const r = conv.recipient;
  if (r?.handle) return r.handle;
  if (r?.email) return r.email;
  return null;
}

async function getEmailFromRecipients(context) {
  if (typeof context?.listRecipients !== 'function') return null;
  try {
    const res = await context.listRecipients();
    const list = res?.results ?? res ?? [];
    const first = list[0];
    return first?.handle ?? first?.email ?? null;
  } catch {
    return null;
  }
}

async function fetchRidersByEmail(email) {
  const url = `${API_BASE}/api/riders?email=${encodeURIComponent(email)}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        'Backend not found (404). Check that VITE_API_URL points to your Railway URL and that the backend is deployed.'
      );
    }
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (j && j.error) msg = j.error;
    } catch {
      /* use text as-is */
    }
    throw new Error(msg || `Search failed (${res.status})`);
  }
  return text ? JSON.parse(text) : [];
}

function formatFieldValue(value) {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'object' && v?.name != null ? v.name : String(v))).join(', ') || '—';
  }
  if (typeof value === 'object' && value?.name != null) return value.name;
  return String(value);
}

// Airtable lookup fields return arrays (e.g. ["2026-03-07"]). Unwrap to scalar.
function unwrap(value) {
  if (Array.isArray(value) && value.length > 0) return value[0];
  return value;
}

// Airtable returns ISO dates (YYYY-MM-DD). Format as D/M/YYYY to match Airtable UI.
function formatDate(value) {
  const v = unwrap(value);
  if (v == null || v === '') return '—';
  const str = typeof v === 'string' ? v : String(v);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${parseInt(d, 10)}/${parseInt(m, 10)}/${y}`;
  }
  return str;
}

// Sort key for start tour date (ISO YYYY-MM-DD or ''). Used for ordering newest first.
function getStartTourSortKey(record) {
  const fields = record.fields || {};
  const key = ['Start tour (from Associated tour)', 'Start tour (from associated tour)'];
  const keyContains = ['Start tour', 'Associated'];
  let val;
  for (const k of key) {
    if (fields[k] != null && (Array.isArray(fields[k]) ? fields[k].length > 0 : fields[k] !== '')) {
      val = fields[k];
      break;
    }
  }
  if (!val) {
    const k = Object.keys(fields || {}).find((x) => keyContains.every((p) => x.toLowerCase().includes(p.toLowerCase())));
    val = k ? fields[k] : undefined;
  }
  const str = unwrap(val);
  if (str == null || str === '') return '';
  const match = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : '';
}

function sortRidersByStartTourNewestFirst(records) {
  return [...(records || [])].sort((a, b) => {
    const da = getStartTourSortKey(a);
    const db = getStartTourSortKey(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db.localeCompare(da);
  });
}

function RidersPanel() {
  const context = useFrontContext();
  const [email, setEmail] = useState(null);
  const [riders, setRiders] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!context?.conversation) return;
    const primary = getConversationEmail(context);
    if (primary) {
      setEmail(primary);
      setError(null);
      setRiders(null);
    } else {
      getEmailFromRecipients(context).then((fallback) => {
        if (fallback) {
          setEmail(fallback);
          setError(null);
          setRiders(null);
        } else {
          setEmail(null);
          setError('No email found for this conversation.');
        }
      });
    }
  }, [context?.conversation?.id, context?.conversation?.recipient]);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRidersByEmail(email)
      .then((records) => {
        if (!cancelled) setRiders(Array.isArray(records) ? records : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || 'Failed to search Airtable Riders');
          setRiders([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [email, context?.conversation?.id]);

  if (error && !email) {
    return <p className="error">{error}</p>;
  }

  return (
    <>
      <h2>Airtable Riders</h2>
      {email && (
        <p className="riders-email">
          Conversation email: <strong>{email}</strong>
        </p>
      )}
      {loading && <p className="loading">Searching Riders table…</p>}
      {error && !loading && <p className="error">{error}</p>}
      {riders !== null && !loading && (
        <>
          {riders.length === 0 ? (
            <p className="empty-riders">No Riders found for this email.</p>
          ) : (
            <ul className="riders-list">
              {sortRidersByStartTourNewestFirst(riders).map((record) => (
                <RiderCard
                  key={record.id}
                  record={record}
                  onVisaUpload={() =>
                    fetchRidersByEmail(email).then((recs) => setRiders(Array.isArray(recs) ? recs : []))
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

// Only read lookup fields from Associated tour; no fallbacks (avoids showing wrong date from another field)
// Airtable uses "End tour (from associated tour)" with lowercase 'a'.
function getFieldByKey(fields, exactKeys, keyContains) {
  for (const exactKey of exactKeys) {
    const val = fields[exactKey];
    if (val !== undefined && val !== null && (Array.isArray(val) ? val.length > 0 : val !== '')) {
      return val;
    }
  }
  const key = Object.keys(fields || {}).find((k) => keyContains.every((part) => k.toLowerCase().includes(part.toLowerCase())));
  return key ? fields[key] : undefined;
}

function AttachmentSection({ label, fieldKey, attachments, uploading, isDragging, onDragStart, onDragEnd, onDrop, onFileSelect }) {
  return (
    <div className="rider-field rider-doc">
      <span className="rider-label">{label}</span>
      {attachments.length > 0 && (
        <div className="visa-attachments">
          {attachments.map((att, i) => (
            <a key={i} href={getAttachmentLinkUrl(att.url)} target="_blank" rel="noopener noreferrer" className="visa-link">
              {att.filename || 'Attachment'}
            </a>
          ))}
        </div>
      )}
      <div
        className={`visa-dropzone ${isDragging ? 'visa-dropzone--active' : ''} ${uploading ? 'visa-dropzone--uploading' : ''}`}
        onDragOver={(e) => { e.preventDefault(); onDragStart?.(); }}
        onDragLeave={onDragEnd}
        onDrop={(e) => onDrop(e, fieldKey)}
      >
        <input
          type="file"
          className="visa-input"
          accept="image/*,.pdf,.doc,.docx"
          onChange={(e) => onFileSelect(e, fieldKey)}
          disabled={uploading}
        />
        {uploading ? 'Uploading…' : 'Drop document here or click to browse'}
      </div>
    </div>
  );
}

function RiderCard({ record, onVisaUpload }) {
  const [draggingField, setDraggingField] = useState(null);
  const [uploadingField, setUploadingField] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const fields = record.fields || {};
  const idRider = fields.ID_RIDER ?? fields.id_rider ?? '—';
  const tourId = fields['Tour id'] ?? fields.Tour_id ?? fields.tour_id;
  const startTour = getFieldByKey(
    fields,
    ['Start tour (from Associated tour)', 'Start tour (from associated tour)'],
    ['Start tour', 'Associated']
  );
  const endTour = getFieldByKey(
    fields,
    ['End tour (from Associated tour)', 'End tour (from associated tour)'],
    ['End tour', 'Associated']
  );
  const vintageRiderType = fields['Vintage rider type'] ?? fields['Vintage_rider_type'] ?? fields.vintage_rider_type;
  const typeOfRider = fields['Type of rider'] ?? fields['Type_of_rider'] ?? fields.type_of_rider;
  const roomType = fields['Zoho Room type'] ?? fields['Zoho_Room_type'] ?? fields['Room type'] ?? fields.room_type;
  const firstHotelText = fields['First hotel text'] ?? fields['First_hotel_text'] ?? fields.first_hotel_text;

  const handleDrop = (e, fieldKey) => {
    e.preventDefault();
    setDraggingField(null);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadingField(fieldKey);
    uploadAttachment(record.id, fieldKey, file, onVisaUpload)
      .then(() => setUploadingField(null))
      .catch((err) => {
        setUploadingField(null);
        setUploadError(err.message);
      });
  };

  const handleFileInput = (e, fieldKey) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadError(null);
    setUploadingField(fieldKey);
    uploadAttachment(record.id, fieldKey, file, onVisaUpload)
      .then(() => setUploadingField(null))
      .catch((err) => {
        setUploadingField(null);
        setUploadError(err.message);
      });
  };

  return (
    <li className="rider-card">
      <div className="rider-id">ID_RIDER: {String(idRider)}</div>
      <div className="rider-field">Tour id: {formatFieldValue(tourId)}</div>
      <div className="rider-field">Start tour: {formatDate(startTour)}</div>
      <div className="rider-field">End tour: {formatDate(endTour)}</div>
      <div className="rider-field">Vintage rider type: {formatFieldValue(vintageRiderType)}</div>
      <div className="rider-field">Type of rider: {formatFieldValue(typeOfRider)}</div>
      <div className="rider-field">Room type: {formatFieldValue(roomType)}</div>
      <div className="rider-field">First hotel text: {formatFieldValue(firstHotelText)}</div>
      {DOCUMENT_FIELDS.map(({ key, label }) => {
        const value = fields[key];
        const attachments = Array.isArray(value) ? value : value ? [value] : [];
        return (
          <AttachmentSection
            key={key}
            label={label}
            fieldKey={key}
            attachments={attachments}
            uploading={uploadingField === key}
            isDragging={draggingField === key}
            onDragStart={() => setDraggingField(key)}
            onDragEnd={() => setDraggingField(null)}
            onDrop={handleDrop}
            onFileSelect={handleFileInput}
          />
        );
      })}
      {uploadError && <p className="visa-error">{uploadError}</p>}
    </li>
  );
}

export default RidersPanel;
