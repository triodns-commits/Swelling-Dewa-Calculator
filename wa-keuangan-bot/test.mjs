// Uji tanpa internet: Sheet & WhatsApp dipalsukan. Jalankan: npm test
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parseAmount, parseMonth, prevMonthKey } from './lib/logic.js';
import { createHandlers, parseUsers } from './lib/handlers.js';
import { verifySignature, OUTSIDE_WINDOW } from './lib/whatsapp.js';

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
  async markVoid(n) { rows[n - 2].jenis = 'Batal'; }
};
const sent = [];
let failText = null;
const sendText = async o => { if (failText) { const e = new Error('x'); e.code = failText; throw e; } sent.push(o); };
const sendTemplate = async o => { sent.push({ ...o, template: true }); };
const env = { ALLOWED: '62811:Trio,62822:Istri', APP_SECRET: 's3cret', VERIFY_TOKEN: 'v', CRON_SECRET: 'c', TEMPLATE_NAME: 'laporan_siap' };
const h = createHandlers({ store, sendText, sendTemplate, env, now: () => okt });

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

// pesan non-teks
const rawImg = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '62811', id: 'img1', type: 'image' }] } }] }] });
await h.receive(rawImg, sign(rawImg));
assert.match(sent.at(-1).body, /pesan teks/);

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
