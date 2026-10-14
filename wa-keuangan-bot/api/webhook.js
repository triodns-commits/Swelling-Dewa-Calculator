import { getHandlers } from '../lib/runtime.js';

export async function GET(request) {
  return getHandlers().verify(new URL(request.url).searchParams);
}

export async function POST(request) {
  const raw = await request.text(); // mentah, dibutuhkan untuk cek tanda tangan
  return getHandlers().receive(raw, request.headers.get('x-hub-signature-256'));
}
