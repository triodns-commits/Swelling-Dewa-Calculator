// Merakit bagian-bagian asli (Meta + Google Sheet) dari environment variable Vercel.
import { createHandlers } from './handlers.js';
import { createSheetsStore } from './sheets.js';
import { sendText, sendTemplate, downloadMedia } from './whatsapp.js';
import { readReceipt, readReceiptGemini } from './receipt.js';

let cached;

export function getHandlers() {
  if (cached) return cached;
  const env = process.env;
  const cfg = { token: env.WHATSAPP_TOKEN, phoneId: env.PHONE_NUMBER_ID };
  cached = createHandlers({
    env,
    store: createSheetsStore({
      sheetId: env.SHEET_ID,
      credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT)
    }),
    // Gemini (gratis) diutamakan kalau kuncinya ada; kalau tidak, Anthropic; kalau keduanya kosong, fitur foto mati.
    readReceipt: (env.GEMINI_API_KEY || env.ANTHROPIC_API_KEY) ? async msg => {
      const media = await downloadMedia({ mediaId: msg.image.id, token: env.WHATSAPP_TOKEN });
      if (!media) return null;
      return env.GEMINI_API_KEY
        ? readReceiptGemini({ ...media, apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined })
        : readReceipt({ ...media, apiKey: env.ANTHROPIC_API_KEY, model: env.RECEIPT_MODEL || undefined });
    } : undefined,
    sendText: o => sendText({ ...cfg, ...o }),
    sendTemplate: o => sendTemplate({ ...cfg, ...o })
  });
  return cached;
}
