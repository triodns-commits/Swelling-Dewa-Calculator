# Bot WhatsApp Catat Uang Masuk & Keluar

Kamu chat ke satu nomor WhatsApp, bot mencatat ke Google Sheet dan bisa membuat laporan bulanan.

## Cara kerjanya (analogi warung)

| Bagian | Peran di warung |
|---|---|
| **WhatsApp** | Pelanggan yang datang |
| **Fonnte** | Kurir yang mengantar pesan pelanggan ke warung dan membawa balasannya |
| **Apps Script (`Code.gs`)** | Penjaga warung yang membaca pesan, mencatat, dan membalas |
| **Google Sheet** | Buku kas |

## Perintah yang bisa dipakai

```
keluar 25rb makan siang     -> catat pengeluaran Rp 25.000
masuk 5jt gaji              -> catat pemasukan Rp 5.000.000
saldo                       -> saldo bulan ini
laporan                     -> laporan bulan ini
laporan 9                   -> laporan September tahun ini
laporan 2026-09             -> laporan bulan tertentu
hapus                       -> batalkan catatan terakhir
```

Penulisan angka yang dikenali: `25rb`, `25k`, `25.000`, `25000`, `1,5jt`, `Rp25.000`.
**Angka harus ditulis tepat setelah kata `masuk`/`keluar`.** Kalau tidak, bot minta diulang. Ini disengaja supaya
`keluar kopi 2 gelas 30rb` tidak salah dicatat jadi Rp 2.

Kategori dibaca otomatis dari catatan (misalnya "bensin" menjadi Transport). Kalau tidak cocok, masuk ke "Lainnya".
Daftar kata kunci ada di bagian atas `Code.gs`, boleh kamu ubah.

## Cara memasang (sekali saja, sekitar 20 menit)

1. **Buat Google Sheet kosong** (sheets.new). Beri nama bebas, misalnya "Keuangan".
2. Di Sheet: **Extensions > Apps Script**. Hapus isi file bawaan, tempel seluruh isi `Code.gs`.
3. Buka **Project Settings** (ikon roda gigi). Centang **Show "appsscript.json" manifest file**, lalu tempel isi `appsscript.json` di file itu.
4. Di halaman yang sama, bagian **Script Properties**, tambahkan tiga data:
   - `FONNTE_TOKEN` = token dari Fonnte (langkah 6)
   - `WEBHOOK_KEY` = kata sandi acak buatanmu, misalnya `kopi-susu-8842`
   - `ALLOWED` = nomor kamu, format `628123456789`. Beberapa nomor dipisah koma. **Jangan dikosongkan**, lihat peringatan di bawah.
5. Pilih fungsi `setup` di editor, klik **Run**, lalu izinkan akses. Ini membuat sheet "Transaksi" dan jadwal laporan otomatis tiap tanggal 1 jam 08.00.
6. Daftar di **fonnte.com**, sambungkan nomor WhatsApp yang akan jadi bot (scan QR), lalu salin tokennya ke langkah 4.
7. Di Apps Script klik **Deploy > New deployment > Web app**. Isi *Execute as: Me* dan *Who has access: Anyone*. Salin URL `.../exec`.
8. Di Fonnte, buka pengaturan perangkat > **Webhook**, isi: `URL-exec-tadi?key=kopi-susu-8842` (samakan `key` dengan `WEBHOOK_KEY`). Aktifkan *autoread* jika ada.
9. Kirim `bantuan` dari nomor kamu ke nomor bot. Kalau dibalas, berarti sudah jalan.

Setiap kali kamu mengubah `Code.gs`, **Deploy > Manage deployments > edit > New version**. Kalau tidak, versi lama yang tetap jalan.

## Peringatan jujur

- **Fonnte tidak resmi dari WhatsApp.** Seperti memakai jalur tikus: gampang dan murah, tapi nomor bisa diblokir WhatsApp. Pakai **nomor cadangan**, bukan nomor utama. Kalau mau yang resmi, ganti ke WhatsApp Cloud API milik Meta. Pengaturannya jauh lebih ribet, dan yang perlu diganti hanya `doPost` dan `sendWa_`.
- **URL webhook ini bisa dibuka siapa saja yang tahu alamatnya.** Pengamannya `WEBHOOK_KEY` dan `ALLOWED`. Kalau `ALLOWED` kosong, siapa pun yang chat ke nomor bot bisa mencatat ke sheet kamu.
- Paket gratis Fonnte punya batas jumlah pesan. Cek di situsnya sebelum berharap bisa dipakai tiap hari.
- Bot ini belum diuji dengan WhatsApp dan Fonnte sungguhan. Yang sudah diuji hanya logika baca angka, hitung, dan laporan (`node test.js`). Format data kiriman Fonnte (`sender`, `message`) berdasarkan dokumentasi mereka. Kalau bot diam padahal pesan masuk, buka **Executions** di Apps Script untuk melihat pesan errornya.

## Belum ada (bisa ditambah nanti)

Mencatat transaksi hari kemarin, anggaran per kategori dengan peringatan, grafik, dan foto struk.
