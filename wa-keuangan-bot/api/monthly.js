import { getHandlers } from '../lib/runtime.js';

export async function GET(request) {
  return getHandlers().monthly(request.headers.get('authorization'));
}
