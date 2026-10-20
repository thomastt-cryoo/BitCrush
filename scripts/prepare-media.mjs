import { readFile, copyFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = [
  ['ffmpeg-core.wasm', '9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7', 'src-tauri/resources/media/ffmpeg-core.wasm'],
  ['ffmpeg-core.js', '67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3', 'public/media/ffmpeg-core-CI9Irx9p.js'],
];
for (const [name, expected, destination] of files) {
  const source = resolve(root, 'node_modules/@ffmpeg/core/dist/esm', name);
  const bytes = await readFile(source);
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw Error(`Original media runtime identity changed: ${name}`);
  const target = resolve(root, destination);
  await mkdir(resolve(target, '..'), { recursive: true });
  await copyFile(source, target);
}
const licenses = resolve(root, 'verification/codec-source/licenses');
const notices = resolve(root, 'notices/media');
await mkdir(notices, { recursive: true });
for (const name of await readdir(licenses)) await copyFile(resolve(licenses, name), resolve(notices, name));
console.log('Prepared exact original FFmpeg runtime; large Wasm remains a single external desktop resource.');
