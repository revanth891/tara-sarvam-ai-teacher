import { ApiError, streamChat, transcribeAudio, VOICE_LANGUAGES } from './pipeline.mjs';

const MAX_BODY = 4 * 1024 * 1024;
const requests = new Map();
export function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function allowRequest(req, res) {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(x => x.trim());
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return false; }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0];
  const now = Date.now();
  if (requests.size > 2000) for (const [key, entry] of requests) if (entry.until < now) requests.delete(key);
  const entry = requests.get(ip);
  if (!entry || entry.until < now) requests.set(ip, { until: now + 60000, count: 1 });
  else if (++entry.count > 30) { jsonResponse(res, 429, { error: 'Please wait a moment before sending more requests.' }); return false; }
  return true;
}

async function readInput(req) {
  if (req.body && !Buffer.isBuffer(req.body) && typeof req.body === 'object') return req.body;
  let raw;
  if (req.body) raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
  else {
    const chunks = []; let size = 0;
    for await (const part of req) {
      size += part.length;
      if (size > MAX_BODY) throw new ApiError('Request is too large. Record a shorter clip.', 413);
      chunks.push(part);
    }
    raw = Buffer.concat(chunks);
  }
  if (raw.length > MAX_BODY) throw new ApiError('Request is too large. Record a shorter clip.', 413);
  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('multipart/form-data')) {
    const form = await new Response(raw, { headers: { 'Content-Type': contentType } }).formData();
    const file = form.get('audio') || form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') throw new ApiError('No recorded audio was provided.', 400);
    return { audio: Buffer.from(await file.arrayBuffer()).toString('base64'), mimeType: file.type || 'audio/webm', language: form.get('language') || 'auto' };
  }
  try { return JSON.parse(raw.toString('utf8') || '{}'); }
  catch { throw new ApiError('Request must contain valid JSON.', 400); }
}

function lifecycle(res) {
  const controller = new AbortController();
  const onClose = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', onClose);
  return { signal: controller.signal, clean: () => res.off('close', onClose) };
}

export async function chatHandler(req, res) {
  if (!allowRequest(req, res)) return;
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Use POST.' });
  const { signal, clean } = lifecycle(res);
  let streaming = false;
  try {
    const input = await readInput(req);
    await streamChat(input, event => {
      if (signal.aborted || res.writableEnded) return;
      if (!streaming) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
        streaming = true;
      }
      res.write(`${JSON.stringify(event)}\n`);
    }, signal);
    res.end();
  } catch (error) {
    if (signal.aborted || res.destroyed) return;
    const message = ['TimeoutError', 'AbortError'].includes(error.name) ? 'The response took too long. Please try again.' : error instanceof ApiError ? error.message : 'Could not reach Sarvam. Please try again.';
    if (streaming) { res.write(`${JSON.stringify({ type: 'error', message, code: error.code || 'request_failed' })}\n`); res.end(); }
    else jsonResponse(res, error.status || 502, { error: message, code: error.code || 'request_failed' });
  } finally { clean(); }
}

export async function transcribeHandler(req, res) {
  if (!allowRequest(req, res)) return;
  if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Use POST.' });
  const { signal, clean } = lifecycle(res);
  try { jsonResponse(res, 200, await transcribeAudio(await readInput(req), signal)); }
  catch (error) {
    if (!signal.aborted && !res.destroyed) jsonResponse(res, error.status || 502, { error: error instanceof ApiError ? error.message : 'Could not transcribe the recording. Please try again.', code: error.code || 'request_failed' });
  } finally { clean(); }
}

export function healthHandler(req, res) {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  jsonResponse(res, 200, { ok: true, provider: 'sarvam', configured: Boolean(process.env.SARVAM_API_KEY), mode: 'teacher', voiceLanguages: VOICE_LANGUAGES, models: { chat: process.env.SARVAM_CHAT_MODEL || 'sarvam-105b-conversations', tts: process.env.SARVAM_TTS_MODEL || 'bulbul:v4-flash', stt: process.env.SARVAM_STT_MODEL || 'saaras:v4' } });
}
