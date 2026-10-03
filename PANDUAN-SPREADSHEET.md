# Panduan: Menghubungkan Google Sheets ke Daily Breakdown Unit

Ikuti sekali. Setelah itu, admin site cukup mengisi spreadsheet seperti biasa —
website menampilkan data terbaru setiap dibuka (atau tiap 15 menit otomatis).

---

## Bagian A — Siapkan spreadsheet

### 1. Susun kolom

Buat satu Google Sheets. Header (baris 1) bebas urutannya — website mencari
kolom berdasarkan **nama**, bukan posisi. Kolom yang dikenali:

| Nama kolom | Wajib | Contoh isi |
|---|---|---|
| `Kode Unit` | **ya** | `EX-2001` |
| `Status` | **ya** | `Breakdown` |
| `Site` / `Lokasi` / `Pit` | disarankan | `Pit Utara` |
| `Tanggal` | disarankan | `03/10/2026` |
| `Tipe` / `Jenis` | opsional | `Excavator PC2000` |
| `Penyebab` | opsional | `Hose hidrolik boom pecah` |
| `Downtime (jam)` | opsional | `5,25` |
| `HM` | opsional | `15.120` |
| `Operator` | opsional | `Sugiyanto` |
| `Keterangan` | opsional | `Tunggu part` |

**Satu baris = satu unit.** Baris tanpa `Kode Unit` dilewati. Baris yang
dimulai kata `Total` / `Jumlah` juga dilewati, jadi boleh menyisipkan
subtotal per site di tengah tabel.

### 2. Status yang dikenali

Tidak perlu menulis persis — dicocokkan dengan kata kunci:

| Status di website | Boleh ditulis sebagai |
|---|---|
| **Running** | operasi · operation · running · beroperasi · jalan · normal · ok |
| **Standby** | standby · stand by · siap · idle · menunggu · ready |
| **Maintenance** | maintenance · perawatan · service · servis · perbaikan · repair · pm |
| **Breakdown** | breakdown · bd · rusak · down · mati · trouble · gagal |

Sel kosong dianggap **Standby**.

### 3. Format angka

| Ditulis | Terbaca |
|---|---|
| `1.500` | 1500 |
| `15.120` | 15120 |
| `5,25` | 5.25 |
| `1.234,5` | 1234.5 |

### 4. Multi-site

Isi kolom `Site` / `Lokasi` untuk setiap baris. Filter **Site** di website
terbentuk otomatis dari isi kolom itu — tidak perlu daftar site terpisah.

---

## Bagian B — Publish ke web (langkah yang paling sering terlewat)

1. Di spreadsheet, buka **File → Share → Publish to web**
2. Pilih tab/sheet yang berisi data unit (bukan "Entire Document")
3. Pilih format **Comma-separated values (.csv)**
4. Klik **Publish**, lalu **OK** bila diminta konfirmasi
5. Salin URL yang diberikan

URL-nya berbentuk seperti ini:

```
https://docs.google.com/spreadsheets/d/e/2PACX-1vAbCdEfGhIjKlMnOpQrStUvWxYz/pub?gid=0&single=true&output=csv
```

> **Catatan:** "Publish to web" berbeda dengan tombol **Share**. Publish
> membuat sheet bisa dibaca tanpa login, dan Google mengizinkannya diakses
> langsung dari browser (CORS) — karena itu cara ini yang dipakai.

**Tes:** tempel URL itu di address bar browser. Kalau muncul unduhan/teks CSV
berisi data unit, berarti benar.

---

## Bagian C — Pasang URL ke website

Buka `assets/js/app.js`, bagian paling atas:

```js
const CONFIG = {
  SHEET_CSV_URL: '',
```

Tempel URL CSV di antara tanda kutip:

```js
  SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=0&single=true&output=csv',
```

Simpan, lalu deploy ke Netlify. Selesai.

### Opsi lain di CONFIG

```js
  REFRESH_MINUTES: 15,   // auto refresh tiap N menit; 0 = mati
  STALE_HOURS: 8,        // tampilkan peringatan "data usang" lewat N jam
  DOWNTIME_COL: true,    // false = sembunyikan kolom downtime
  HM_COL: true,          // false = sembunyikan kolom HM
```

---

## Bagian D — Deploy ke Netlify

### Cara cepat (drag & drop)

1. Buka [app.netlify.com/drop](https://app.netlify.com/drop)
2. Seret folder **`daily-breakdown`** (foldernya, bukan isinya) ke area tersebut
3. Selesai — Netlify memberi URL seperti `https://random-name.netlify.app`

Cara ini cukup untuk mulai. Kelemahannya: setiap kali mengubah file, kamu harus
seret ulang.

### Cara yang disarankan (GitHub)

1. Buat repository GitHub, upload isi folder `daily-breakdown`
2. Di Netlify: **Add new site → Import an existing project → GitHub**
3. Pilih repository itu. Build command dikosongkan, publish directory `.`
4. Setiap `git push`, website otomatis ter-deploy ulang

### Ganti nama situs

**Site settings → Change site name** → misal `daily-breakdown-unit`, jadi
`https://daily-breakdown-unit.netlify.app`.

---

## Yang sering salah

| Gejala | Penyebab & solusi |
|---|---|
| Tetap menampilkan "Data contoh" | `SHEET_CSV_URL` masih kosong, atau URL salah. |
| Banner merah "Gagal memuat spreadsheet" | Sheet belum di-**Publish to web** (Bagian B). Tombol **Share** saja tidak cukup. |
| Muncul "HTTP 404" | Salah pilih tab saat publish, atau `gid` di URL tidak sesuai. Ulangi Bagian B. |
| Semua unit jadi Standby | Nama status tidak dikenali. Lihat tabel kata kunci di A.2. |
| Kolom HM terbaca aneh (`1,5` padahal `1.500`) | Pastikan pakai versi terbaru `app.js`; parser angka sudah menangani format Indonesia. |
| Data tidak berubah padahal sheet sudah diedit | Google meng-cache CSV ±5 menit. Tunggu sebentar atau klik **Muat ulang**. |
| Filter Site cuma satu pilihan | Kolom `Site` / `Lokasi` belum diisi, atau semua baris nilainya sama. |

Untuk pesan error lengkap: buka **F12 → tab Console**.

---

## Catatan akses data

URL "Publish to web" bisa dibaca siapa pun yang memilikinya — cocok untuk
laporan operasional internal. Bila data unit bersifat rahasia, jangan pakai
cara ini; minta dibuatkan Google Apps Script sebagai perantara supaya
aksesnya bisa dikontrol.
