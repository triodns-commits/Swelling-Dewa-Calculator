// Buku kas di Google Sheet (lewat akun layanan / "robot" milik Google).
import { GoogleAuth } from 'google-auth-library';

const HEADER = ['Waktu', 'Nama', 'Nomor', 'Jenis', 'Jumlah', 'Kategori', 'Catatan', 'ID Pesan'];

export function createSheetsStore({ sheetId, credentials, tab = 'Transaksi' }) {
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  async function call(path, init = {}) {
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    if (!r.ok) throw new Error(`Sheets API ${r.status}: ${await r.text()}`);
    return r.json();
  }

  const range = r => encodeURIComponent(`${tab}!${r}`);

  return {
    async listRows() {
      const data = await call(`/values/${range('A:H')}?valueRenderOption=UNFORMATTED_VALUE`);
      const values = data.values || [];
      if (!values.length) {
        await call(`/values/${range('A1')}?valueInputOption=RAW`, {
          method: 'PUT', body: JSON.stringify({ values: [HEADER] })
        });
        return [];
      }
      return values.slice(1).map((v, i) => ({
        rowNum: i + 2,
        waktu: String(v[0] ?? ''), nama: String(v[1] ?? ''), nomor: String(v[2] ?? ''),
        jenis: String(v[3] ?? ''), jumlah: Number(v[4] ?? 0), kategori: String(v[5] ?? ''),
        catatan: String(v[6] ?? ''), msgId: String(v[7] ?? '')
      }));
    },

    async append(r) {
      await call(`/values/${range('A:H')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        body: JSON.stringify({ values: [[r.waktu, r.nama, r.nomor, r.jenis, r.jumlah, r.kategori, r.catatan, r.msgId]] })
      });
    },

    /** Tidak menghapus baris; hanya mengganti Jenis jadi "Batal" supaya ada jejak. */
    async markVoid(rowNum) {
      await call(`/values/${range('D' + rowNum)}?valueInputOption=RAW`, {
        method: 'PUT', body: JSON.stringify({ values: [['Batal']] })
      });
    }
  };
}
