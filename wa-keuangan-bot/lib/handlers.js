// Menyambung semua bagian: webhook Meta, balasan, dan laporan bulanan.
import { handle, handleReceipt, report, prevMonthKey } from './logic.js';
import { verifySignature, OUTSIDE_WINDOW } from './whatsapp.js';

/** "628111:Trio,628222:Istri" -> { '628111': {nomor, nama}, ... } */
export function parseUsers(s) {
  const users = {};
  for (const item of String(s || '').split(',')) {
    const [num, nama] = item.split(':').map(x => x.trim());
    const nomor = (num || '').replace(/\D/g, '');
    if (nomor) users[nomor] = { nomor, nama: nama || nomor };
  }
  return users;
}

// readReceipt(msg) -> data struk | null; opsional (tanpa itu, fitur foto mati).
export function createHandlers({ store, sendText, sendTemplate, readReceipt, env, now = () => new Date() }) {
  const users = parseUsers(env.ALLOWED);
  const seen = new Set(); // cadangan anti-dobel untuk perintah yang tidak menyimpan ID pesan

  async function balas(msg, user) {
    const ctx = { store, user, now: now(), msgId: msg.id };
    if (msg.type === 'text') return handle({ ...ctx, text: msg.text.body });
    if (msg.type === 'image') {
      if (!readReceipt) return 'Fitur baca foto struk belum diaktifkan.';
      let receipt = null;
      try { receipt = await readReceipt(msg); } catch (err) { console.error(err); }
      return handleReceipt({ ...ctx, receipt, caption: msg.image.caption });
    }
    return 'Aku baru bisa membaca pesan teks dan foto struk.';
  }

  return {
    /** Meta memanggil ini sekali saat kamu menyimpan webhook (GET). */
    verify(params) {
      if (params.get('hub.mode') === 'subscribe' && params.get('hub.verify_token') === env.VERIFY_TOKEN) {
        return new Response(params.get('hub.challenge'), { status: 200 });
      }
      return new Response('forbidden', { status: 403 });
    },

    /**
     * Pesan masuk (POST). Kalau `defer` (waitUntil Vercel) diberikan, Meta langsung dijawab 200
     * dan pekerjaan lanjut di belakang layar, supaya Meta tidak mengirim ulang saat baca foto lama.
     */
    async receive(rawBody, signature, defer) {
      if (!verifySignature(rawBody, signature, env.APP_SECRET)) {
        return new Response('bad signature', { status: 401 });
      }
      let payload;
      try { payload = JSON.parse(rawBody); } catch { return new Response('ok'); }

      const messages = (payload.entry || [])
        .flatMap(e => e.changes || [])
        .flatMap(c => (c.value && c.value.messages) || []);

      const work = (async () => {
        for (const msg of messages) {
          const user = users[msg.from];
          if (!user || seen.has(msg.id)) continue;
          seen.add(msg.id);
          try {
            const reply = await balas(msg, user);
            if (reply) await sendText({ to: msg.from, body: reply });
          } catch (err) {
            console.error(err);
            try { await sendText({ to: msg.from, body: 'Maaf, ada gangguan. Coba kirim ulang sebentar lagi.' }); } catch { /* abaikan */ }
          }
        }
      })();
      if (defer) defer(work); else await work;
      return new Response('ok'); // selalu 200 supaya Meta tidak mengirim ulang
    },

    /** Dipanggil jadwal bulanan Vercel. */
    async monthly(authHeader) {
      if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return new Response('forbidden', { status: 403 });
      }
      const body = report(await store.listRows(), prevMonthKey(now()));
      const hasil = [];
      for (const u of Object.values(users)) {
        try {
          await sendText({ to: u.nomor, body });
          hasil.push(`${u.nama}: terkirim`);
        } catch (err) {
          if (err.code === OUTSIDE_WINDOW && env.TEMPLATE_NAME) {
            try {
              await sendTemplate({ to: u.nomor, name: env.TEMPLATE_NAME });
              hasil.push(`${u.nama}: template terkirim`);
              continue;
            } catch (e2) { err = e2; }
          }
          console.error(err);
          hasil.push(`${u.nama}: gagal (${err.message})`);
        }
      }
      return new Response(hasil.join('\n'));
    }
  };
}
