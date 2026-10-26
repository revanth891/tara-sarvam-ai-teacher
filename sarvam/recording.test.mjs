import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeMonoWav } from '../src/audio/recording.js';

test('microphone upload is a genuine 16 kHz mono PCM WAV with clipped samples', () => {
  const buffer = encodeMonoWav(new Float32Array([-2, -1, 0, 1, 2, NaN]));
  const view = new DataView(buffer);
  assert.equal(Buffer.from(buffer).toString('ascii', 0, 4), 'RIFF');
  assert.equal(Buffer.from(buffer).toString('ascii', 8, 12), 'WAVE');
  assert.equal(view.getUint32(4, true), buffer.byteLength - 8);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 12);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true)), [-32768, -32768, 0, 32767, 32767, 0]);
});

test('45-second microphone limit remains within the API payload limit', () => {
  const wav = encodeMonoWav(new Float32Array(45 * 16000));
  assert.equal(wav.byteLength, 1440044);
  assert.ok(Buffer.from(wav).toString('base64').length < 4 * 1024 * 1024);
});
