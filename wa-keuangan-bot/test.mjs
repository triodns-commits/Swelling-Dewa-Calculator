// Uji tanpa internet: Sheet & WhatsApp dipalsukan. Jalankan: npm test
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parseAmount, parseMonth, prevMonthKey } from './lib/logic.js';
import { createHandlers, parseUsers } from './lib/handlers.js';
import { verifySignature, OUTSIDE_WINDOW, downloadMedia } from './lib/whatsapp.js';
import { readReceipt as bacaStruk, readReceiptGemini } from './lib/receipt.js';

// --- parsing angka & bulan
for (const [i, o] of [['25rb', 25000], ['25k', 25000], ['1,5jt', 1500000], ['5jt', 5000000],
  ['25.000', 25000], ['25000', 25000], ['Rp25.000', 25000], ['1.5', null], ['abc', null], ['0', null], [undefined, null]]) {
  assert.equal(parseAmount(i), o, `parseAmount(${i})`);
}
const okt = new Date('2026-10-14T05:00:00Z');
assert.equal(parseMonth(undefined, okt), '2026-10');
assert.equal(parseMonth('lalu', okt), '2026-09');
assert.equal(parseMonth('9', okt), '2026-09');
assert.equal(parseMonth('13', okt), null);
assert.equal(prevMonthKey(new Date('2027-01-01T01:00:00Z')), '2026-12');
// 1 Nov 00:30 WIB = 31 Okt 17:30 UTC -> masih dihitung November di WIB
assert.equal(parseMonth(undefined, new Date('2026-10-31T17:30:00Z')), '2026-11');
assert.deepEqual(parseUsers('62811:Trio, 62822:Istri'), { 62811: { nomor: '62811', nama: 'Trio' }, 62822: { nomor: '62822', nama: 'Istri' } });

// --- perangkat palsu
const rows = [];
const store = {
  async listRows() { return rows.map((r, i) => ({ ...r, rowNum: i + 2 })); },
  async append(r) { rows.push({ ...r }); },
  async markVoid(n) { rows[n - 2].jenis = 'Batal'; },
  async setAmount(n, v) { rows[n - 2].jumlah = v; }
};
const sent = [];
let failText = null;
const sendText = async o => { if (failText) { const e = new Error('x'); e.code = failText; throw e; } sent.push(o); };
const sendTemplate = async o => { sent.push({ ...o, template: true }); };
const env = { ALLOWED: '62811:Trio,62822:Istri', APP_SECRET: 's3cret', VERIFY_TOKEN: 'v', CRON_SECRET: 'c', TEMPLATE_NAME: 'laporan_siap' };
let struk = { is_receipt: true, total: 87500, merchant: 'Indomaret', tanggal: '2026-10-12', kategori: 'Belanja', ringkasan: 'beras, telur' };
const readReceipt = async () => struk;
const h = createHandlers({ store, sendText, sendTemplate, readReceipt, env, now: () => okt });

const body = (from, text, id) => JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from, id, type: 'text', text: { body: text } }] } }] }] });
const sign = raw => 'sha256=' + crypto.createHmac('sha256', env.APP_SECRET).update(raw).digest('hex');
const kirim = async (from, text, id) => { const raw = body(from, text, id); return h.receive(raw, sign(raw)); };

// verifikasi webhook
assert.equal((await h.verify(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'v', 'hub.challenge': '123' }))).status, 200);
assert.equal((await h.verify(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'salah', 'hub.challenge': '1' }))).status, 403);

// tanda tangan
const raw = body('62811', 'saldo', 'x0');
assert.equal((await h.receive(raw, 'sha256=palsu')).status, 401);
assert.equal((await h.receive(raw, undefined)).status, 401);
assert.ok(verifySignature(raw, sign(raw), env.APP_SECRET));

// dua orang mencatat
await kirim('62811', 'masuk 5jt gaji', 'm1');
await kirim('62822', 'keluar 25rb makan siang', 'm2');
await kirim('62811', 'keluar 100rb bensin', 'm3');
assert.equal(rows.length, 3);
assert.equal(rows[1].nama, 'Istri'); assert.equal(rows[1].kategori, 'Makan & Minum');
assert.match(sent.at(-1).body, /Saldo bulan ini \(berdua\): Rp 4\.875\.000/);

// kiriman ulang dari Meta tidak tercatat dua kali (ID sama), baik di instance sama maupun baru
await kirim('62811', 'keluar 100rb bensin', 'm3');
const h2 = createHandlers({ store, sendText, sendTemplate, env, now: () => okt });
const raw2 = body('62811', 'keluar 100rb bensin', 'm3');
await h2.receive(raw2, sign(raw2));
assert.equal(rows.length, 3);

// nomor asing diabaikan
const n = sent.length;
await kirim('62899', 'masuk 1jt hack', 'z1');
assert.equal(rows.length, 3); assert.equal(sent.length, n);

// format salah
await kirim('62811', 'keluar kopi 25rb', 'e1');
assert.match(sent.at(-1).body, /Format belum pas/); assert.equal(rows.length, 3);

// laporan menampilkan total berdua + per orang
await kirim('62822', 'laporan', 'l1');
const lap = sent.at(-1).body;
console.log(lap);
assert.match(lap, /Pemasukan  : Rp 5\.000\.000/); assert.match(lap, /Pengeluaran: Rp 125\.000/);
assert.match(lap, /Trio: masuk Rp 5\.000\.000, keluar Rp 100\.000/); assert.match(lap, /Istri: masuk Rp 0, keluar Rp 25\.000/);

// hapus: hanya catatan terakhir milik sendiri
await kirim('62822', 'hapus', 'h1');
assert.equal(rows[1].jenis, 'Batal'); assert.equal(rows[2].jenis, 'Keluar');
await kirim('62822', 'hapus', 'h2');
assert.match(sent.at(-1).body, /Belum ada catatanmu/);
await kirim('62822', 'saldo', 's1');
assert.match(sent.at(-1).body, /Rp 4\.900\.000/);

// foto struk
const foto = (from, id, caption) => { const r = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from, id, type: 'image', image: { id: 'media-' + id, caption } }] } }] }] }); return h.receive(r, sign(r)); };
await foto('62811', 'img1', 'untuk dapur');
assert.equal(rows.at(-1).jumlah, 87500); assert.equal(rows.at(-1).waktu, '2026-10-12 12:00:00');
assert.equal(rows.at(-1).catatan, 'Struk - Indomaret - untuk dapur'); assert.equal(rows.at(-1).kategori, 'Belanja');
console.log(sent.at(-1).body);
assert.match(sent.at(-1).body, /Rp 87\.500/); assert.match(sent.at(-1).body, /koreksi/);
const jumlahBaris = rows.length;
await foto('62811', 'img1'); // kiriman ulang
assert.equal(rows.length, jumlahBaris);
// koreksi & hapus bekerja pada struk
await kirim('62811', 'koreksi 90rb', 'k1');
assert.equal(rows.at(-1).jumlah, 90000);
await kirim('62811', 'koreksi', 'k2'); assert.match(sent.at(-1).body, /Format: koreksi/);
await kirim('62811', 'hapus', 'h3'); assert.equal(rows.at(-1).jenis, 'Batal');
// tanggal tidak masuk akal (masa depan / terlalu lama) -> pakai hari ini
struk = { ...struk, tanggal: '2027-01-01' }; await foto('62811', 'img2');
assert.equal(rows.at(-1).waktu.slice(0, 10), '2026-10-14'); assert.match(sent.at(-1).body, /tidak dipakai/);
struk = { ...struk, tanggal: '2025-01-01' }; await foto('62811', 'img3');
assert.equal(rows.at(-1).waktu.slice(0, 10), '2026-10-14');
// tidak terbaca -> tidak dicatat, tidak menebak
const sebelum = rows.length;
for (const [i, bad] of [{ is_receipt: false }, { is_receipt: true }, { is_receipt: true, total: -5 }, { is_receipt: true, total: 12.5 }, null].entries()) {
  struk = bad; await foto('62811', 'bad' + i);
  assert.equal(rows.length, sebelum); assert.match(sent.at(-1).body, /belum terbaca jelas/);
}
// AI error -> diperlakukan tidak terbaca; tanpa kunci AI -> fitur mati
const hErr = createHandlers({ store, sendText, sendTemplate, readReceipt: async () => { throw new Error('boom'); }, env, now: () => okt });
const rE = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '62811', id: 'e9', type: 'image', image: { id: 'm' } }] } }] }] });
await hErr.receive(rE, sign(rE)); assert.match(sent.at(-1).body, /belum terbaca jelas/);
const hOff = createHandlers({ store, sendText, sendTemplate, env, now: () => okt });
await hOff.receive(rE.replace('e9', 'e10'), sign(rE.replace('e9', 'e10'))); assert.match(sent.at(-1).body, /belum diaktifkan/);
// stiker/suara
const rS = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '62811', id: 's9', type: 'audio' }] } }] }] });
await h.receive(rS, sign(rS)); assert.match(sent.at(-1).body, /teks dan foto/);
// defer (waitUntil): langsung 200, kerja tetap selesai
let tertunda; const n0 = rows.length; struk = { is_receipt: true, total: 1000, merchant: 'X', kategori: 'Lainnya' };
const rD = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '62811', id: 'd1', type: 'image', image: { id: 'm' } }] } }] }] });
assert.equal((await h.receive(rD, sign(rD), p => { tertunda = p; })).status, 200);
await tertunda; assert.equal(rows.length, n0 + 1);

// --- pembaca struk & unduh media (jaringan dipalsukan)
let req;
const out = await bacaStruk({ bytes: Buffer.from('abc'), mime: 'image/png', apiKey: 'k', fetchImpl: async (u, i) => { req = { u, ...i, b: JSON.parse(i.body) }; return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', input: { is_receipt: true, total: 5000 } }] }) }; } });
assert.deepEqual(out, { is_receipt: true, total: 5000 });
assert.equal(req.u, 'https://api.anthropic.com/v1/messages'); assert.equal(req.headers['x-api-key'], 'k');
assert.deepEqual(req.b.tool_choice, { type: 'tool', name: 'catat_struk' });
assert.equal(req.b.messages[0].content[0].source.media_type, 'image/png');
assert.equal(req.b.messages[0].content[0].source.data, Buffer.from('abc').toString('base64'));
await assert.rejects(bacaStruk({ bytes: Buffer.from('a'), apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'no' }) }), /401/);
// Gemini
let g;
const gOut = await readReceiptGemini({ bytes: Buffer.from('abc'), mime: 'image/jpeg', apiKey: 'gk', model: 'gemini-x', fetchImpl: async (u, i) => { g = { u, h: i.headers, b: JSON.parse(i.body) }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"is_receipt":true,"total":12000,"merchant":"Warung"}' }] } }] }) }; } });
assert.deepEqual(gOut, { is_receipt: true, total: 12000, merchant: 'Warung' });
assert.equal(g.u, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent'); assert.equal(g.h['x-goog-api-key'], 'gk');
assert.equal(g.b.generationConfig.responseMimeType, 'application/json');
assert.equal(g.b.contents[0].parts[0].inline_data.data, Buffer.from('abc').toString('base64'));
const gBad = t => readReceiptGemini({ bytes: Buffer.from('a'), apiKey: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: t }] } }] }) }) });
assert.equal(await gBad('bukan json'), null);
assert.equal(await readReceiptGemini({ bytes: Buffer.from('a'), apiKey: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [] }) }) }), null);
await assert.rejects(readReceiptGemini({ bytes: Buffer.from('a'), apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'quota' }) }), /429/);
const urls = [];
const media = await downloadMedia({ mediaId: 'M1', token: 't', fetchImpl: async (u, i) => { urls.push([u, i.headers.Authorization]); return u.includes('graph') ? { ok: true, json: async () => ({ url: 'https://cdn/x', mime_type: 'image/jpeg' }) } : { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; } });
assert.equal(media.mime, 'image/jpeg'); assert.equal(media.bytes.length, 3); assert.deepEqual(urls.map(x => x[1]), ['Bearer t', 'Bearer t']);
const besar = await downloadMedia({ mediaId: 'M', token: 't', fetchImpl: async u => u.includes('graph') ? { ok: true, json: async () => ({ url: 'u', mime_type: 'image/jpeg' }) } : { ok: true, arrayBuffer: async () => new ArrayBuffer(6 * 1024 * 1024) } });
assert.equal(besar, null);

// laporan bulanan
rows.push({ waktu: '2026-09-20 10:00:00', nama: 'Trio', nomor: '62811', jenis: 'Keluar', jumlah: 50000, kategori: 'Lainnya', catatan: '', msgId: 'old' });
assert.equal((await h.monthly('Bearer salah')).status, 403);
sent.length = 0;
await h.monthly('Bearer c');
assert.equal(sent.length, 2); assert.match(sent[0].body, /Laporan September 2026/); assert.match(sent[0].body, /Rp 50\.000/);
// di luar jendela 24 jam -> template
sent.length = 0; failText = OUTSIDE_WINDOW;
await h.monthly('Bearer c');
assert.equal(sent.length, 2); assert.ok(sent.every(s => s.template && s.name === 'laporan_siap'));

console.log('\nSEMUA TES LOLOS');
