// Membaca foto struk dengan Claude (vision) dan mengembalikan data terstruktur.
import { KATEGORI_LIST } from './logic.js';

const TOOL = {
  name: 'catat_struk',
  description: 'Catat hasil pembacaan struk belanja.',
  input_schema: {
    type: 'object',
    properties: {
      is_receipt: { type: 'boolean', description: 'false jika gambar bukan struk/nota atau total tidak terbaca jelas' },
      total: { type: 'integer', description: 'TOTAL AKHIR yang dibayar, rupiah bulat. Bukan subtotal, bukan uang tunai, bukan kembalian.' },
      merchant: { type: 'string', description: 'Nama toko/restoran' },
      tanggal: { type: 'string', description: 'Tanggal struk format YYYY-MM-DD; kosongkan jika tidak terbaca' },
      kategori: { type: 'string', enum: KATEGORI_LIST },
      ringkasan: { type: 'string', description: 'Maksimal 6 kata, contoh: "beras, minyak, telur"' }
    },
    required: ['is_receipt']
  }
};

const PROMPT = 'Ini foto struk belanja di Indonesia. Ambil TOTAL AKHIR yang harus dibayar ' +
  '(setelah diskon dan pajak; bukan subtotal, bukan tunai, bukan kembalian). ' +
  'Angka Indonesia memakai titik sebagai pemisah ribuan ("87.500" = 87500). ' +
  'Jika gambar bukan struk atau totalnya tidak terbaca jelas, isi is_receipt=false dan JANGAN menebak.';

/** bytes: Buffer, mime: "image/jpeg" dst. Mengembalikan objek struk atau null kalau gagal. */
export async function readReceipt({ bytes, mime, apiKey, model = 'claude-haiku-5-5', fetchImpl = fetch }) {
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: Buffer.from(bytes).toString('base64') } },
          { type: 'text', text: PROMPT }
        ]
      }]
    })
  });
  if (!r.ok) throw new Error(`Anthropic API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const call = (data.content || []).find(c => c.type === 'tool_use');
  return call ? call.input : null;
}

// Alternatif gratis: Google Gemini (paket gratis Google AI Studio). Nama model bisa diganti lewat GEMINI_MODEL.
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_receipt: { type: 'BOOLEAN' },
    total: { type: 'INTEGER', description: TOOL.input_schema.properties.total.description },
    merchant: { type: 'STRING' },
    tanggal: { type: 'STRING', description: TOOL.input_schema.properties.tanggal.description },
    kategori: { type: 'STRING', enum: KATEGORI_LIST },
    ringkasan: { type: 'STRING', description: TOOL.input_schema.properties.ringkasan.description }
  },
  required: ['is_receipt']
};

export async function readReceiptGemini({ bytes, mime, apiKey, model = 'gemini-flash-latest', fetchImpl = fetch }) {
  const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mime || 'image/jpeg', data: Buffer.from(bytes).toString('base64') } },
          { text: PROMPT }
        ]
      }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, temperature: 0 }
    })
  });
  if (!r.ok) throw new Error(`Gemini API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}
