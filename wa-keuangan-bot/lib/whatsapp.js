// Bicara dengan WhatsApp Cloud API milik Meta.
import crypto from 'node:crypto';

const GRAPH = 'https://graph.facebook.com/v21.0';

/** Cek tanda tangan di header X-Hub-Signature-256 (bukti pesan benar-benar dari Meta). */
export function verifySignature(rawBody, header, appSecret) {
  if (!header || !appSecret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function post({ token, phoneId, payload, fetchImpl = fetch }) {
  const r = await fetchImpl(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload })
  });
  if (!r.ok) {
    let err = {};
    try { err = (await r.json()).error || {}; } catch { /* abaikan */ }
    const e = new Error(`WhatsApp API ${r.status}: ${err.message || ''}`);
    e.code = err.code;
    throw e;
  }
}

export const sendText = ({ to, body, ...cfg }) =>
  post({ ...cfg, payload: { to, type: 'text', text: { body } } });

export const sendTemplate = ({ to, name, lang = 'id', ...cfg }) =>
  post({ ...cfg, payload: { to, type: 'template', template: { name, language: { code: lang } } } });

/** Kode error Meta: kamu menulis duluan di luar jendela 24 jam, wajib pakai template. */
export const OUTSIDE_WINDOW = 131047;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // batas gambar Claude

/** Unduh foto kiriman pengguna. Mengembalikan { bytes, mime } atau null kalau terlalu besar. */
export async function downloadMedia({ mediaId, token, fetchImpl = fetch }) {
  const auth = { Authorization: `Bearer ${token}` };
  const meta = await fetchImpl(`${GRAPH}/${mediaId}`, { headers: auth });
  if (!meta.ok) throw new Error(`Media meta ${meta.status}`);
  const { url, mime_type: mime } = await meta.json();
  const file = await fetchImpl(url, { headers: auth });
  if (!file.ok) throw new Error(`Media download ${file.status}`);
  const bytes = Buffer.from(await file.arrayBuffer());
  return bytes.length > MAX_IMAGE_BYTES ? null : { bytes, mime };
}
