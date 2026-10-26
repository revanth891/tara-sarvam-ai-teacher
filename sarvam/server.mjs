import { createServer } from 'node:http';
import { chatHandler, healthHandler, transcribeHandler, jsonResponse } from './handlers.mjs';

try { process.loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const port = Number(process.env.PORT) || 3001;
const server = createServer((req, res) => {
  const path = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  const handler = ['/api/chat', '/chat'].includes(path) ? chatHandler
    : ['/api/transcribe', '/transcribe'].includes(path) ? transcribeHandler
    : ['/', '/health', '/api/health'].includes(path) ? healthHandler : null;
  if (handler) Promise.resolve(handler(req, res)).catch(() => { if (!res.headersSent) jsonResponse(res, 500, { error: 'Unexpected server error.' }); else res.end(); });
  else jsonResponse(res, 404, { error: 'Not found.' });
});
server.requestTimeout = 90000;
server.listen(port, '127.0.0.1', () => console.log(`Aesir Sarvam API ready at http://localhost:${port}`));
