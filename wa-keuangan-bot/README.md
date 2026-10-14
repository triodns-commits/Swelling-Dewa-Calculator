# Bot WhatsApp Catat Uang Masuk & Keluar (untuk berdua)

Kamu dan istri chat ke satu nomor bot. Bot mencatat ke **satu** Google Sheet bersama, lalu bisa membuat laporan bulanan.

## Cara kerjanya (analogi warung)

| Bagian | Peran di warung |
|---|---|
| **WhatsApp + Meta Cloud API** | Pintu warung resmi yang diakui pemerintah, tidak lewat jalur tikus |
| **Nomor tes Meta** | Nomor telepon warung. Dipinjamkan gratis oleh Meta, jadi nomor pribadimu tidak dipakai |
| **Vercel (folder `api/`)** | Penjaga warung. Membaca pesan, mencatat, membalas |
| **Google Sheet** | Buku kas bersama. Kolom "Nama" menunjukkan siapa yang mencatat |
| **Akun layanan Google** | Kunci khusus yang hanya boleh dipegang penjaga untuk membuka buku kas |

Karena tersambung ke Meta, **nomor pribadimu dan istri tidak diblokir dan tetap dipakai biasa**. Kalian hanya mengirim pesan ke nomor bot.

## Perintah

```
keluar 25rb makan siang     -> catat pengeluaran Rp 25.000
masuk 5jt gaji              -> catat pemasukan Rp 5.000.000
saldo                       -> saldo bulan ini (berdua)
laporan                     -> laporan bulan ini
laporan lalu                -> laporan bulan lalu
laporan 9                   -> laporan September tahun ini
koreksi 90rb                -> ubah jumlah catatan TERAKHIR MILIKMU
hapus                       -> batalkan catatan TERAKHIR MILIKMU (milik pasangan tidak tersentuh)
(kirim FOTO struk)          -> dibaca otomatis, lihat bagian di bawah
```

Angka yang dikenali: `25rb`, `25k`, `25.000`, `25000`, `1,5jt`, `Rp25.000`.
**Angka harus tepat setelah `masuk`/`keluar`.** Kalau tidak, bot minta diulang, supaya `keluar kopi 2 gelas 30rb` tidak dicatat jadi Rp 2.
Kategori ditebak dari catatan ("bensin" menjadi Transport, dst). Daftar kata kuncinya ada di atas `lib/logic.js`.
Catatan yang dibatalkan tidak dihapus dari Sheet. Kolom Jenis diganti "Batal", jadi masih ada jejaknya.

## Cara memasang (sekali saja, sekitar 45 menit)

### A. Google Sheet + akun layanan
1. Buat Google Sheet baru. **Ubah nama tab "Sheet1" menjadi `Transaksi`** (persis begitu). Salin **ID Sheet** dari URL: `docs.google.com/spreadsheets/d/`**`ID_INI`**`/edit`.
2. Buka console.cloud.google.com, buat project baru, lalu aktifkan **Google Sheets API**.
3. **IAM & Admin > Service Accounts > Create**. Setelah jadi, buka tab **Keys > Add key > JSON**. File JSON terunduh. **Jaga file ini seperti kunci brankas.**
4. Di Google Sheet klik **Share**, masukkan alamat email akun layanan (`...@...iam.gserviceaccount.com`, ada di file JSON), beri akses **Editor**.

### B. Meta (WhatsApp Cloud API)
5. Buka developers.facebook.com, buat app bertipe **Business**, lalu tambahkan produk **WhatsApp**.
6. Di **WhatsApp > API Setup** Meta langsung memberi **nomor tes** dan **Phone number ID**. Catat Phone number ID itu.
7. Di kotak **To**, tambahkan nomor kamu dan nomor istri sebagai penerima (maksimal 5), lalu masukkan kode verifikasi yang dikirim ke WhatsApp masing-masing.
8. Buat **token permanen**. Token di halaman API Setup mati dalam 24 jam, jadi jangan dipakai.
   Buka business.facebook.com > Settings > **System users** > buat user (Admin) > **Add assets** (pilih app, beri Full control) > **Generate token** dengan izin `whatsapp_business_messaging` dan `whatsapp_business_management`. Pilih masa berlaku *Never*.
9. Di **App settings > Basic**, salin **App Secret**.

### C. Vercel
10. Di vercel.com, impor repo GitHub ini. Di **Root Directory** pilih `wa-keuangan-bot`.
11. Di **Settings > Environment Variables**, isi:

| Nama | Isi |
|---|---|
| `WHATSAPP_TOKEN` | token permanen (langkah 8) |
| `PHONE_NUMBER_ID` | langkah 6 |
| `APP_SECRET` | langkah 9 |
| `VERIFY_TOKEN` | kata acak buatanmu, misalnya `kopi-susu-8842` |
| `ALLOWED` | `628123456789:Trio,628987654321:Istri` (nomor tanpa `+`, lalu `:Nama`) |
| `SHEET_ID` | langkah 1 |
| `GOOGLE_SERVICE_ACCOUNT` | **seluruh isi** file JSON langkah 3 |
| `CRON_SECRET` | kata acak lain, panjang |
| `TEMPLATE_NAME` | (opsional) lihat bagian "Laporan otomatis" |
| `ANTHROPIC_API_KEY` | (opsional) untuk baca foto struk, langkah 15 |
| `RECEIPT_MODEL` | (opsional) ganti model pembaca struk. Bawaan: `claude-haiku-5-5` |

12. Klik **Deploy**. Alamat webhook kamu: `https://NAMA-PROJECT.vercel.app/api/webhook`.

15. (Untuk fitur foto struk) Buat akun di console.anthropic.com, isi kredit secukupnya, lalu buat **API key**. Pasang batas pengeluaran bulanan di pengaturannya. Isi `ANTHROPIC_API_KEY` di Vercel, lalu **Redeploy**.

### D. Sambungkan Meta ke Vercel
13. Di Meta: **WhatsApp > Configuration > Webhook > Edit**. Isi *Callback URL* dengan alamat di langkah 12, dan *Verify token* sama dengan `VERIFY_TOKEN`. Klik Verify. Lalu **Manage** dan centang `messages`.
14. Dari WhatsApp kamu, kirim pesan ke nomor tes Meta (nomornya tampil di API Setup). Ketik `bantuan`. Kalau dibalas, sudah jalan.

## Foto struk

Foto struk belanja, kirim ke nomor bot (boleh pakai keterangan/caption, misalnya "untuk dapur"). Bot membalas:

```
🧾 Struk terbaca dan dicatat oleh Trio
Toko    : Indomaret
Total   : Rp 87.500
Tanggal : 2026-10-12
Kategori: Belanja
```

- **Bot hanya mencatat kalau total terbaca jelas.** Kalau foto buram, bukan struk, atau totalnya meragukan, bot tidak mencatat dan minta foto ulang atau ketik manual. Bot tidak menebak.
- **Selalu lirik balasannya.** Pembacaan AI bisa salah (struk kusut, tulisan pudar, atau diskon yang membingungkan). Kalau angkanya meleset, balas `koreksi 90rb` atau `hapus`.
- Tanggal di struk dipakai hanya kalau masuk akal (hari ini sampai 45 hari lalu). Selain itu bot memakai tanggal hari ini dan memberi tahu.
- Foto dibaca oleh AI Anthropic (Claude), jadi fotonya dikirim ke sana. Jangan foto struk yang memuat data yang tidak mau kamu bagikan, misalnya kartu atau KTP.
- Butuh **kunci API Anthropic** (langkah 15 di bawah). Pakai kredit bayar-per-pemakaian dan biaya per struk kecil. [Guessing] Perkiraanku di bawah Rp 100 per struk dengan model hemat bawaan, tapi cek harga resmi dan **pasang batas pengeluaran bulanan** di console Anthropic supaya tidak ada kejutan.
- Fitur ini mati sendiri kalau `ANTHROPIC_API_KEY` tidak diisi. Perintah teks tetap jalan.

## Laporan otomatis

Vercel mengirim laporan bulan lalu tiap tanggal 1 jam 08.00 WIB. Masalahnya, aturan Meta melarang bot yang menulis duluan lewat jalur biasa kalau kalian belum chat dalam 24 jam terakhir. Jadi ada dua kemungkinan:
- Kalau kalian chat bot dalam 24 jam terakhir, laporan terkirim utuh.
- Kalau tidak, pesan ditolak. Untuk itu buat satu **template** di Meta (WhatsApp > Message Templates), kategori *Utility*, bahasa Indonesia, nama misalnya `laporan_siap`, isi: *"Laporan bulan lalu sudah siap. Balas kata laporan lalu untuk melihatnya."* Setelah disetujui Meta, isi `TEMPLATE_NAME=laporan_siap`. Template ini bisa dikenai biaya kecil per pesan.

Cara paling murah dan pasti: ketik `laporan lalu` sendiri tiap awal bulan. Balasan dalam 24 jam setelah kamu menulis tidak dikenai biaya.

## Hal yang perlu diwaspadai

- **Nomor tes Meta itu untuk pengembangan.** Batasnya 5 penerima, cukup untuk berdua. Meta pernah mengubah aturannya, jadi bukan jaminan seumur hidup. Kalau suatu hari hilang atau dibatasi, jalan keluarnya mendaftarkan nomor sendiri. Nomor itu lalu tidak bisa dipakai di aplikasi WhatsApp biasa, kecuali lewat fitur *coexistence* di aplikasi WhatsApp Business.
- Pesan dari nomor selain yang ada di `ALLOWED` diam-diam diabaikan.
- Buku kas bersama berarti pasangan bisa melihat semua pengeluaran kamu. Pastikan kalian memang sepakat soal itu.
- Bot ini belum diuji ke Meta, Vercel, Google, dan Anthropic sungguhan. Yang diuji sebatas logika, tanda tangan keamanan, penolakan pesan dobel, pembacaan struk, dan jalur laporan dengan perangkat palsu (`npm test`). Kualitas pembacaan struk asli (foto miring, tulisan pudar) belum pernah dicoba. Kalau bot diam, lihat **Logs** di dashboard Vercel.

## Belum ada

Mencatat transaksi hari kemarin lewat teks, anggaran per kategori, dan grafik. Rincian barang per baris struk juga belum disimpan (hanya total).
