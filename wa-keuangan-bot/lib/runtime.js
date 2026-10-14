// Merakit bagian-bagian asli (Meta + Google Sheet) dari environment variable Vercel.
import { createHandlers } from './handlers.js';
import { createSheetsStore } from './sheets.js';
import { sendText, sendTemplate } from './whatsapp.js';

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
    sendText: o => sendText({ ...cfg, ...o }),
    sendTemplate: o => sendTemplate({ ...cfg, ...o })
  });
  return cached;
}
