# Petty Cash Management System

Sistem Informasi Manajemen Kas Kecil (Petty Cash) berbasis web yang dirancang untuk mendigitalisasi proses pengajuan, persetujuan, dan pencatatan mutasi dana kas kecil di perusahaan. Aplikasi ini telah disesuaikan dengan studi kasus **PT Sinergi Artha Mandiri**.

## 🚀 Fitur Utama
Aplikasi ini memiliki arsitektur multi-role dengan hak akses yang berbeda-beda:
- **Karyawan**: Dapat membuat pengajuan reimbursement/dana dengan mengunggah foto bukti nota (disimpan secara Base64 ke dalam database).
- **Finance**: Menyetujui atau menolak pengajuan, serta melakukan *Top-Up* dana kas kecil.
- **Manager**: Melihat laporan keseluruhan transaksi (Dashboard Analytics) dan memantau arus kas.
- **Auditor**: Memantau seluruh *Audit Trail*, melihat buku besar (Ledger), dan dapat mengekspor laporan mutasi kas menjadi dokumen **PDF**.
- **Admin**: Manajemen data pengguna (CRUD Users) dan akses ke sistem.

## 🛠️ Tech Stack
- **Backend:** Node.js, Express.js
- **Frontend:** EJS (Embedded JavaScript), Bootstrap 5, html2pdf.js
- **Database:** PostgreSQL (Di-host menggunakan Supabase)
- **Deployment:** Vercel (Serverless Functions)

## 📦 Panduan Instalasi Lokal

1. **Clone repository ini**
   ```bash
   git clone <url-repository-anda>
   cd petty-cash
   ```

2. **Install semua *dependencies***
   ```bash
   npm install
   ```

3. **Konfigurasi Environment**
   Buat file bernama `.env` di folder utama aplikasi, lalu isi dengan format berikut:
   ```env
   PORT=3000
   SESSION_SECRET=pettycash_rahasia_bebas
   # Gunakan link Connection Pooling (port 6543) jika menggunakan Supabase
   DATABASE_URL="postgresql://postgres:[password]@aws-0-...pooler.supabase.com:6543/postgres?pgbouncer=true"
   ```

4. **Inisialisasi Database (Seeding)**
   Jalankan perintah ini satu kali saja untuk membuat tabel dan akun demo di Supabase Anda:
   ```bash
   npm run seed
   ```

5. **Jalankan Aplikasi**
   ```bash
   npm start
   ```
   Aplikasi akan berjalan di `http://localhost:3000`

## 🔐 Akun Demo (Testing)
Gunakan kredensial berikut untuk menguji coba fitur aplikasi:

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | `admin@pettycash.test` | `admin@123!` |
| **Manager** | `eko.manager@pettycash.test` | `manager123` |
| **Auditor** | `vanesa.auditor@pettycash.test` | `auditor123` |
| **Finance** | `siti.finance@pettycash.test` | `finance123` |
| **Karyawan** | `budi@pettycash.test` | `karyawan123` |

## 🚀 Deployment ke Vercel
Aplikasi ini sudah dioptimasi untuk berjalan di Vercel secara gratis.
1. Hubungkan repository GitHub Anda ke Vercel.
2. Tambahkan `DATABASE_URL` dan `SESSION_SECRET` di menu **Environment Variables** pada dashboard Vercel.
3. Klik **Deploy**.
4. (Penting: Sesi login sudah dikonfigurasi menggunakan `connect-pg-simple` sehingga sesi tidak akan hilang di *serverless environment*).
