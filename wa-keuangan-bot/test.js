// Uji logika bot dengan Google Sheet palsu (jalankan: node test.js)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const rows = [['Waktu','Pengirim','Jenis','Jumlah','Kategori','Catatan']];
const sheet = {
  appendRow: r => rows.push(r), setFrozenRows() {},
  getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
  deleteRow: n => rows.splice(n - 1, 1)
};
const pad = n => String(n).padStart(2, '0');
const ctx = {
  console, Math, Date, JSON, Object, String, Number, parseInt, parseFloat,
  SpreadsheetApp: { getActive: () => ({ getSheetByName: () => sheet }) },
  Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
  Utilities: { formatDate: (d, tz, f) => f === 'yyyy' ? String(d.getFullYear()) : d.getFullYear() + '-' + pad(d.getMonth() + 1) }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('Code.gs', 'utf8'), ctx);
const h = (t, d) => ctx.handle_('628111', t, d || new Date(2026, 9, 14));

// parseAmount
const A = ctx.parseAmount_;
assert.strictEqual(A('25rb'), 25000); assert.strictEqual(A('25k'), 25000);
assert.strictEqual(A('1,5jt'), 1500000); assert.strictEqual(A('5jt'), 5000000);
assert.strictEqual(A('25.000'), 25000); assert.strictEqual(A('25000'), 25000);
assert.strictEqual(A('Rp25.000'), 25000); assert.strictEqual(A('1.5'), null);
assert.strictEqual(A('abc'), null); assert.strictEqual(A('0'), null); assert.strictEqual(A(undefined), null);

// catat + kategori
console.log(h('masuk 5jt gaji'));
console.log(h('keluar 25rb makan siang'));
console.log(h('keluar 100rb bensin'));
console.log(h('keluar 40.000 sesuatu'));
assert.strictEqual(rows[2][4], 'Makan & Minum'); assert.strictEqual(rows[3][4], 'Transport');
assert.strictEqual(rows[4][4], 'Lainnya');
// bulan lalu & orang lain tidak ikut
h('keluar 999rb lama', new Date(2026, 8, 5));
ctx.handle_('628222', 'keluar 1jt orang lain', new Date(2026, 9, 14));
console.log(h('laporan'));
console.log(h('laporan 9'));
console.log(h('laporan 2026-10'));
assert.ok(h('laporan 13').includes('tidak dikenali'));
assert.ok(h('keluar').includes('Format belum pas'));
assert.ok(h('keluar kopi 25rb').includes('Format belum pas'));
assert.ok(h('halo').includes('Perintah'));
console.log(h('saldo'));
// hapus hanya milik sendiri
const before = rows.length;
console.log(h('hapus')); assert.strictEqual(rows.length, before - 1);
assert.ok(rows.some(r => r[1] === '628222'));
console.log('\nSEMUA TES LOLOS');
