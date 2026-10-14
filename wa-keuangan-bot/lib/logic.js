// Otak bot: membaca perintah, mencatat, dan membuat laporan.
// Tidak tahu apa-apa soal WhatsApp atau Google; semua lewat `store` yang disuntikkan.

export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
  'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const KATEGORI_KELUAR = {
  'Makan & Minum': ['makan', 'minum', 'kopi', 'bakso', 'warung', 'jajan', 'sarapan', 'nasi', 'ayam', 'mie', 'resto', 'cafe'],
  'Transport': ['bensin', 'pertalite', 'pertamax', 'ojek', 'grab', 'gojek', 'parkir', 'tol', 'bus', 'kereta', 'servis'],
  'Tagihan': ['listrik', 'pulsa', 'wifi', 'internet', 'air', 'kos', 'kontrakan', 'cicilan', 'token'],
  'Belanja': ['belanja', 'beli', 'shopee', 'tokopedia', 'baju', 'sabun', 'sembako'],
  'Kesehatan': ['obat', 'dokter', 'apotek', 'klinik', 'vitamin']
};
const KATEGORI_MASUK = {
  'Gaji': ['gaji', 'salary', 'honor', 'upah'],
  'Bonus': ['bonus', 'thr', 'insentif'],
  'Usaha': ['jual', 'jualan', 'omzet', 'usaha', 'proyek']
};

export const KATEGORI_LIST = [...Object.keys(KATEGORI_KELUAR), 'Lainnya'];

export const BANTUAN = 'Perintah:\n' +
  '• keluar 25rb makan siang\n' +
  '• masuk 5jt gaji\n' +
  '• kirim FOTO struk -> dibaca otomatis\n' +
  '• koreksi 90rb  (ubah jumlah catatan terakhirmu)\n' +
  '• saldo\n' +
  '• laporan  (atau: laporan 9, laporan lalu)\n' +
  '• hapus  (membatalkan catatan terakhirmu)';

/** "25rb" "25k" "1,5jt" "25.000" "25000" "Rp25.000" -> angka rupiah, atau null. */
export function parseAmount(s) {
  if (!s) return null;
  s = String(s).toLowerCase().replace(/^rp\.?/, '');
  const m = s.match(/^(\d+(?:[.,]\d+)?)(rb|ribu|k|jt|juta)$/);
  if (m) {
    const mult = (m[2] === 'jt' || m[2] === 'juta') ? 1000000 : 1000;
    const n = Math.round(parseFloat(m[1].replace(',', '.')) * mult);
    return n > 0 ? n : null;
  }
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return parseInt(s.replace(/[.,]/g, ''), 10) || null;
  if (/^\d+$/.test(s)) return parseInt(s, 10) || null;
  return null;
}

export function detectCategory(jenis, note) {
  const map = jenis === 'Masuk' ? KATEGORI_MASUK : KATEGORI_KELUAR;
  const words = String(note).toLowerCase().split(/[^a-z0-9]+/);
  for (const [kat, keys] of Object.entries(map)) {
    if (keys.some(k => words.includes(k))) return kat;
  }
  return 'Lainnya';
}

export function rp(n) {
  const s = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + 'Rp ' + s;
}

/** Waktu dalam WIB, bentuk "2026-10-14 08:05:03". */
export function wib(d) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(d);
}

export const monthKey = d => wib(d).slice(0, 7);

export function prevMonthKey(now) {
  let [y, m] = monthKey(now).split('-').map(Number);
  m -= 1;
  if (m === 0) { m = 12; y -= 1; }
  return y + '-' + String(m).padStart(2, '0');
}

/** undefined -> bulan ini; "lalu"; "9"; "2026-09". Null kalau tidak dikenali. */
export function parseMonth(arg, now) {
  if (!arg) return monthKey(now);
  arg = String(arg).toLowerCase();
  if (arg === 'lalu') return prevMonthKey(now);
  let year = Number(monthKey(now).slice(0, 4));
  const m = arg.match(/^(\d{4})-(\d{1,2})$/);
  if (m) { year = Number(m[1]); arg = m[2]; }
  if (!/^\d{1,2}$/.test(arg)) return null;
  const mo = Number(arg);
  if (mo < 1 || mo > 12) return null;
  return year + '-' + String(mo).padStart(2, '0');
}

const aktif = rows => rows.filter(r => r.jenis === 'Masuk' || r.jenis === 'Keluar');
const inMonth = (rows, key) => aktif(rows).filter(r => String(r.waktu).slice(0, 7) === key);

function totals(rows) {
  const t = { masuk: 0, keluar: 0 };
  rows.forEach(r => { t[r.jenis === 'Masuk' ? 'masuk' : 'keluar'] += Number(r.jumlah); });
  return t;
}

export function report(allRows, key) {
  const rows = inMonth(allRows, key);
  const [y, mo] = key.split('-');
  const title = BULAN[Number(mo) - 1] + ' ' + y;
  if (!rows.length) return `📊 Laporan ${title}\nBelum ada transaksi.`;

  const t = totals(rows);
  let msg = `📊 Laporan ${title}\n` +
    `Pemasukan  : ${rp(t.masuk)}\n` +
    `Pengeluaran: ${rp(t.keluar)}\n` +
    `Selisih    : ${rp(t.masuk - t.keluar)}\n` +
    `Jumlah transaksi: ${rows.length}`;

  const perKat = {};
  rows.filter(r => r.jenis === 'Keluar').forEach(r => {
    perKat[r.kategori] = (perKat[r.kategori] || 0) + Number(r.jumlah);
  });
  const kats = Object.keys(perKat).sort((a, b) => perKat[b] - perKat[a]);
  if (kats.length) {
    msg += '\n\nPengeluaran per kategori:';
    for (const k of kats) {
      msg += `\n• ${k}: ${rp(perKat[k])} (${Math.round(perKat[k] / t.keluar * 100)}%)`;
    }
  }

  const names = [...new Set(rows.map(r => r.nama))];
  if (names.length > 1) {
    msg += '\n\nPer orang:';
    for (const n of names) {
      const tn = totals(rows.filter(r => r.nama === n));
      msg += `\n• ${n}: masuk ${rp(tn.masuk)}, keluar ${rp(tn.keluar)}`;
    }
  }
  return msg;
}

const lastOf = (rows, user) => {
  const mine = aktif(rows).filter(r => r.nomor === user.nomor);
  return mine[mine.length - 1];
};

const SEHARI = 86400000;

/**
 * Foto struk. `receipt` = hasil pembacaan AI: { is_receipt, total, merchant, tanggal, kategori, ringkasan }.
 * Hanya dicatat kalau total terbaca jelas; kalau ragu, minta input manual (tidak menebak).
 */
export async function handleReceipt({ store, user, receipt, caption, now, msgId }) {
  const r = receipt;
  if (!r || !r.is_receipt || !Number.isInteger(r.total) || r.total <= 0) {
    return 'Struk belum terbaca jelas, jadi belum kucatat. Foto ulang lebih dekat dan terang, atau ketik manual:\nkeluar 87500 belanja';
  }
  const rows = await store.listRows();
  if (msgId && rows.some(x => x.msgId === msgId)) return null;

  // Tanggal struk dipakai hanya jika masuk akal (hari ini s/d 45 hari lalu); kalau tidak, pakai waktu sekarang.
  const today = wib(now).slice(0, 10);
  let waktu = wib(now);
  let tglInfo = 'hari ini';
  if (/^\d{4}-\d{2}-\d{2}$/.test(r.tanggal || '') && r.tanggal !== today) {
    const diff = (Date.parse(today + 'T00:00:00Z') - Date.parse(r.tanggal + 'T00:00:00Z')) / SEHARI;
    if (diff > 0 && diff <= 45) { waktu = r.tanggal + ' 12:00:00'; tglInfo = r.tanggal; }
    else tglInfo = `hari ini (tanggal di struk "${r.tanggal}" tidak dipakai)`;
  }

  const kategori = KATEGORI_LIST.includes(r.kategori) ? r.kategori : 'Lainnya';
  const catatan = ['Struk', r.merchant, caption].filter(Boolean).join(' - ');
  const row = { waktu, nama: user.nama, nomor: user.nomor, jenis: 'Keluar', jumlah: r.total, kategori, catatan, msgId: msgId || '' };
  await store.append(row);
  const t = totals(inMonth([...rows, row], monthKey(now)));
  return `🧾 Struk terbaca dan dicatat oleh ${user.nama}\n` +
    `Toko    : ${r.merchant || '(tidak terbaca)'}\n` +
    `Total   : ${rp(r.total)}\n` +
    `Tanggal : ${tglInfo}\n` +
    `Kategori: ${kategori}\n` +
    (r.ringkasan ? `Barang  : ${r.ringkasan}\n` : '') +
    `Saldo bulan ini (berdua): ${rp(t.masuk - t.keluar)}\n\n` +
    'Salah baca? Balas *koreksi 90rb* untuk ubah jumlah, atau *hapus* untuk membatalkan.';
}

/**
 * Proses satu pesan. Mengembalikan teks balasan (atau null kalau tidak perlu membalas).
 * user = { nomor, nama }; store = { listRows, append, markVoid }.
 */
export async function handle({ store, user, text, now, msgId }) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === 'masuk' || cmd === 'keluar') {
    const amount = parseAmount(parts[1]);
    if (!amount) {
      return 'Format belum pas. Contoh:\nkeluar 25rb makan siang\nmasuk 5jt gaji';
    }
    const rows = await store.listRows();
    if (msgId && rows.some(r => r.msgId === msgId)) return null; // kiriman ulang dari Meta
    const jenis = cmd === 'masuk' ? 'Masuk' : 'Keluar';
    const note = parts.slice(2).join(' ');
    const kat = detectCategory(jenis, note);
    const row = { waktu: wib(now), nama: user.nama, nomor: user.nomor, jenis, jumlah: amount, kategori: kat, catatan: note, msgId: msgId || '' };
    await store.append(row);
    const t = totals(inMonth([...rows, row], monthKey(now)));
    return `✅ ${jenis === 'Masuk' ? 'Pemasukan' : 'Pengeluaran'} ${rp(amount)} dicatat oleh ${user.nama} (${kat}).\n` +
      `Saldo bulan ini (berdua): ${rp(t.masuk - t.keluar)}`;
  }

  if (cmd === 'laporan') {
    const key = parseMonth(parts[1], now);
    if (!key) return 'Bulan tidak dikenali. Contoh: laporan, laporan 9, laporan lalu, laporan 2026-09';
    return report(await store.listRows(), key);
  }

  if (cmd === 'saldo') {
    const t = totals(inMonth(await store.listRows(), monthKey(now)));
    return `Saldo bulan ini (berdua): ${rp(t.masuk - t.keluar)}\n(masuk ${rp(t.masuk)}, keluar ${rp(t.keluar)})`;
  }

  if (cmd === 'koreksi') {
    const amount = parseAmount(parts[1]);
    if (!amount) return 'Format: koreksi 90rb';
    const last = lastOf(await store.listRows(), user);
    if (!last) return 'Belum ada catatanmu yang bisa dikoreksi.';
    await store.setAmount(last.rowNum, amount);
    return `✏️ Diubah: ${last.jenis} ${rp(last.jumlah)} -> ${rp(amount)}${last.catatan ? ' (' + last.catatan + ')' : ''}`;
  }

  if (cmd === 'hapus') {
    const last = lastOf(await store.listRows(), user);
    if (!last) return 'Belum ada catatanmu yang bisa dibatalkan.';
    await store.markVoid(last.rowNum);
    return `🗑️ Dibatalkan: ${last.jenis} ${rp(last.jumlah)}${last.catatan ? ' (' + last.catatan + ')' : ''}`;
  }

  return BANTUAN;
}
