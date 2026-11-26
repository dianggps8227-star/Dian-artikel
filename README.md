# Ruang Artikel

Website CMS artikel interaktif sederhana menggunakan HTML, CSS, JavaScript, dan Node.js tanpa library tambahan.

## Fitur

- Membuat, mengedit, menghapus, menyimpan draf, dan menerbitkan artikel.
- Halaman pembaca dengan pencarian, filter kategori, dan pengurutan.
- Sampul artikel melalui URL gambar HTTPS.
- Editor teks dengan format tebal, miring, garis bawah, heading, kutipan, daftar, dan tautan.
- Suka, jumlah dibaca, serta komentar.
- Tema terang/gelap.
- Data artikel tersimpan di `data/db.json` melalui backend Node.js.
- Tampilan responsif untuk ponsel dan desktop.

## Menjalankan di Android (Termux)

1. Pasang Node.js di Termux:

   ```bash
   pkg update
   pkg install nodejs -y
   ```

2. Ekstrak folder `artikel-interaktif` ke penyimpanan yang dapat diakses Termux. Berikan izin penyimpanan jika diperlukan:

   ```bash
   termux-setup-storage
   ```

3. Masuk ke folder proyek. Contoh jika berada di Download:

   ```bash
   cd ~/storage/downloads/artikel-interaktif
   ```

4. Jalankan server:

   ```bash
   node server.js
   ```

5. Buka browser di perangkat yang sama, lalu kunjungi:

   `http://127.0.0.1:3000`

Untuk menghentikan server, tekan `CTRL + C` di Termux.

## Mengedit dengan Acode

Buka folder proyek menggunakan Acode. File tampilan berada di folder `public`:

- `public/index.html` — struktur halaman.
- `public/style.css` — desain dan responsif.
- `public/app.js` — interaksi dan komunikasi API.

Backend berada di `server.js`. Data artikel tersimpan otomatis di `data/db.json`.

## Catatan penting

Versi ini berjalan sebagai aplikasi lokal dan belum memiliki sistem akun/login. Jangan langsung mengekspos server ke internet atau menggunakannya sebagai CMS publik untuk banyak pengguna sebelum menambahkan autentikasi, otorisasi admin, validasi/sanitasi server yang lebih ketat, pembatasan percobaan, dan HTTPS. Komentar dan tombol suka pada versi ini dapat digunakan oleh siapa pun yang memiliki akses ke server lokal.
