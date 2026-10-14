/**
 * Bot WhatsApp pencatat uang masuk/keluar -> Google Sheet.
 *
 * Alur: kamu chat ke nomor bot -> Fonnte meneruskan ke doPost() di sini
 * -> dicatat ke sheet "Transaksi" -> bot membalas lewat Fonnte.
 *
 * Pengaturan rahasia disimpan di Project Settings > Script Properties:
 *   FONNTE_TOKEN : token perangkat dari Fonnte
 *   WEBHOOK_KEY  : kata sandi acak buatanmu (juga dipasang di URL webhook)
 *   ALLOWED      : (disarankan) nomor yang boleh pakai, pisah koma, format 628xxx
 */

var SHEET_NAME = 'Transaksi';
var HEADERS = ['Waktu', 'Pengirim', 'Jenis', 'Jumlah', 'Kategori', 'Catatan'];
var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
  'Agustus', 'September', 'Oktober', 'November', 'Desember'];

var KATEGORI_KELUAR = {
  'Makan & Minum': ['makan', 'minum', 'kopi', 'bakso', 'warung', 'jajan', 'sarapan', 'nasi', 'ayam', 'mie', 'resto', 'cafe'],
  'Transport': ['bensin', 'pertalite', 'pertamax', 'ojek', 'grab', 'gojek', 'parkir', 'tol', 'bus', 'kereta', 'servis'],
  'Tagihan': ['listrik', 'pulsa', 'wifi', 'internet', 'air', 'kos', 'kontrakan', 'cicilan', 'token'],
  'Belanja': ['belanja', 'beli', 'shopee', 'tokopedia', 'baju', 'sabun', 'sembako'],
  'Kesehatan': ['obat', 'dokter', 'apotek', 'klinik', 'vitamin']
};
var KATEGORI_MASUK = {
  'Gaji': ['gaji', 'salary', 'honor', 'upah'],
  'Bonus': ['bonus', 'thr', 'insentif'],
  'Usaha': ['jual', 'jualan', 'omzet', 'usaha', 'proyek']
};

// ---------------------------------------------------------------- webhook

function doGet() {
  return ContentService.createTextOutput('Bot keuangan aktif');
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    if (!e || !e.parameter || e.parameter.key !== prop_('WEBHOOK_KEY')) {
      return out_('forbidden');
    }
    var data = readBody_(e);
    var sender = String(data.sender || '').replace(/\D/g, '');
    var text = String(data.message || data.text || '').trim();
    if (!sender || !text || !allowed_(sender)) return out_('ok');

    lock.waitLock(20000);
    var reply = handle_(sender, text, new Date());
    lock.releaseLock();
    if (reply) sendWa_(sender, reply);
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
  }
  return out_('ok');
}

function readBody_(e) {
  var raw = e.postData && e.postData.contents;
  if (raw) {
    try { return JSON.parse(raw); } catch (_) { /* bukan JSON, pakai form */ }
  }
  return e.parameter || {};
}

function out_(s) {
  return ContentService.createTextOutput(s);
}

function allowed_(sender) {
  var list = prop_('ALLOWED');
  if (!list) return true;
  return list.split(',').map(function (x) { return x.replace(/\D/g, ''); })
    .indexOf(sender) !== -1;
}

function prop_(k) {
  return PropertiesService.getScriptProperties().getProperty(k);
}

function sendWa_(target, message) {
  UrlFetchApp.fetch('https://api.fonnte.com/send', {
    method: 'post',
    headers: { Authorization: prop_('FONNTE_TOKEN') },
    payload: { target: target, message: message },
    muteHttpExceptions: true
  });
}

// ------------------------------------------------------- logika perintah

/** Menerima pesan, mengembalikan teks balasan. now = Date. */
function handle_(sender, text, now) {
  var parts = text.trim().split(/\s+/);
  var cmd = parts[0].toLowerCase();

  if (cmd === 'masuk' || cmd === 'keluar') {
    var amount = parseAmount_(parts[1]);
    if (!amount) {
      return 'Format belum pas. Contoh:\n' +
        'keluar 25rb makan siang\nmasuk 5jt gaji';
    }
    var note = parts.slice(2).join(' ');
    var jenis = cmd === 'masuk' ? 'Masuk' : 'Keluar';
    var kat = detectCategory_(jenis, note);
    sheet_().appendRow([now, sender, jenis, amount, kat, note]);
    var mon = rows_(sender, monthKey_(now));
    var t = totals_(mon);
    return (jenis === 'Masuk' ? '✅ Pemasukan ' : '✅ Pengeluaran ') +
      rp_(amount) + ' dicatat (' + kat + ').\n' +
      'Saldo bulan ini: ' + rp_(t.masuk - t.keluar);
  }

  if (cmd === 'laporan') {
    var key = parseMonth_(parts[1], now);
    if (!key) return 'Bulan tidak dikenali. Contoh: laporan, laporan 9, laporan 2026-09';
    return report_(sender, key);
  }

  if (cmd === 'saldo') {
    var tt = totals_(rows_(sender, monthKey_(now)));
    return 'Saldo bulan ini: ' + rp_(tt.masuk - tt.keluar) +
      '\n(masuk ' + rp_(tt.masuk) + ', keluar ' + rp_(tt.keluar) + ')';
  }

  if (cmd === 'hapus') {
    var s = sheet_();
    var vals = s.getDataRange().getValues();
    for (var i = vals.length - 1; i >= 1; i--) {
      if (String(vals[i][1]) === sender) {
        s.deleteRow(i + 1);
        return '🗑️ Dihapus: ' + vals[i][2] + ' ' + rp_(vals[i][3]) +
          (vals[i][5] ? ' (' + vals[i][5] + ')' : '');
      }
    }
    return 'Belum ada catatan untuk dihapus.';
  }

  return 'Perintah:\n' +
    '• keluar 25rb makan siang\n' +
    '• masuk 5jt gaji\n' +
    '• saldo\n' +
    '• laporan  (atau: laporan 9)\n' +
    '• hapus  (membatalkan catatan terakhir)';
}

// ----------------------------------------------------------------- parsing

/** "25rb" "25k" "1,5jt" "25.000" "25000" -> angka rupiah, atau null. */
function parseAmount_(s) {
  if (!s) return null;
  s = String(s).toLowerCase().replace(/^rp\.?/, '');
  var m = s.match(/^(\d+(?:[.,]\d+)?)(rb|ribu|k|jt|juta)$/);
  if (m) {
    var mult = (m[2] === 'jt' || m[2] === 'juta') ? 1000000 : 1000;
    var n = Math.round(parseFloat(m[1].replace(',', '.')) * mult);
    return n > 0 ? n : null;
  }
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return parseInt(s.replace(/[.,]/g, ''), 10) || null;
  if (/^\d+$/.test(s)) return parseInt(s, 10) || null;
  return null;
}

function detectCategory_(jenis, note) {
  var map = jenis === 'Masuk' ? KATEGORI_MASUK : KATEGORI_KELUAR;
  var words = String(note).toLowerCase().split(/[^a-z0-9]+/);
  for (var kat in map) {
    for (var i = 0; i < map[kat].length; i++) {
      if (words.indexOf(map[kat][i]) !== -1) return kat;
    }
  }
  return 'Lainnya';
}

function tz_() {
  return Session.getScriptTimeZone();
}

function monthKey_(d) {
  return Utilities.formatDate(d, tz_(), 'yyyy-MM');
}

/** undefined -> bulan ini; "9" / "09" -> bulan itu tahun ini; "2026-09". */
function parseMonth_(arg, now) {
  var year = parseInt(Utilities.formatDate(now, tz_(), 'yyyy'), 10);
  if (!arg) return monthKey_(now);
  var m = String(arg).match(/^(\d{4})-(\d{1,2})$/);
  if (m) { year = parseInt(m[1], 10); arg = m[2]; }
  var mo = parseInt(arg, 10);
  if (!/^\d{1,2}$/.test(String(arg)) || mo < 1 || mo > 12) return null;
  return year + '-' + (mo < 10 ? '0' + mo : mo);
}

// ------------------------------------------------------------------ laporan

function sheet_() {
  var ss = SpreadsheetApp.getActive();
  var s = ss.getSheetByName(SHEET_NAME);
  if (!s) {
    s = ss.insertSheet(SHEET_NAME);
    s.appendRow(HEADERS);
    s.setFrozenRows(1);
  }
  return s;
}

/** Baris milik sender pada bulan key ("yyyy-MM"). */
function rows_(sender, key) {
  var vals = sheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (String(r[1]) === sender && monthKey_(new Date(r[0])) === key) out.push(r);
  }
  return out;
}

function totals_(rows) {
  var t = { masuk: 0, keluar: 0 };
  rows.forEach(function (r) {
    if (r[2] === 'Masuk') t.masuk += Number(r[3]);
    else t.keluar += Number(r[3]);
  });
  return t;
}

function report_(sender, key) {
  var rows = rows_(sender, key);
  var parts = key.split('-');
  var title = BULAN[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
  if (!rows.length) return '📊 Laporan ' + title + '\nBelum ada transaksi.';

  var t = totals_(rows);
  var perKat = {};
  rows.forEach(function (r) {
    if (r[2] === 'Keluar') perKat[r[4]] = (perKat[r[4]] || 0) + Number(r[3]);
  });
  var kats = Object.keys(perKat).sort(function (a, b) { return perKat[b] - perKat[a]; });

  var msg = '📊 Laporan ' + title + '\n' +
    'Pemasukan : ' + rp_(t.masuk) + '\n' +
    'Pengeluaran: ' + rp_(t.keluar) + '\n' +
    'Selisih   : ' + rp_(t.masuk - t.keluar) + '\n' +
    'Jumlah transaksi: ' + rows.length;
  if (kats.length) {
    msg += '\n\nPengeluaran per kategori:';
    kats.forEach(function (k) {
      var pct = t.keluar ? Math.round(perKat[k] / t.keluar * 100) : 0;
      msg += '\n• ' + k + ': ' + rp_(perKat[k]) + ' (' + pct + '%)';
    });
  }
  return msg;
}

function rp_(n) {
  var neg = n < 0;
  var s = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + 'Rp ' + s;
}

// ------------------------------------------------------- laporan otomatis

/** Dipanggil trigger tiap tanggal 1: kirim laporan bulan lalu ke semua pengguna. */
function kirimLaporanBulanan() {
  var now = new Date();
  var prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  var key = monthKey_(prev);
  var vals = sheet_().getDataRange().getValues();
  var seen = {};
  for (var i = 1; i < vals.length; i++) {
    var sender = String(vals[i][1]);
    if (seen[sender]) continue;
    seen[sender] = true;
    if (allowed_(sender)) sendWa_(sender, report_(sender, key));
  }
}

/** Jalankan SEKALI dari editor: menyiapkan sheet + jadwal laporan tanggal 1 jam 08.00. */
function setup() {
  sheet_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'kirimLaporanBulanan') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('kirimLaporanBulanan').timeBased().onMonthDay(1).atHour(8).create();
}
