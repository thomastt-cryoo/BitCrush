import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const source = process.argv[2];
if (!source) throw new Error('Pass the supplied BitCrush JPEG artwork.');
const root = resolve(import.meta.dirname, '..');
const bytes = await readFile(source);
const directory = join(root, 'branding');
await mkdir(directory, { recursive: true });
await copyFile(source, join(directory, 'bitcrush-original.jpg'));
// Package the exact supplied bitmap inside a rounded vector tile. No repainting, recoloring, or generated replacement artwork.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><clipPath id="tile"><rect x="64" y="64" width="896" height="896" rx="180"/></clipPath></defs>
  <g clip-path="url(#tile)">
    <rect x="64" y="64" width="896" height="896" fill="#000"/>
    <svg x="93" y="70" width="838" height="884" viewBox="200 40 755 795" preserveAspectRatio="xMidYMid meet">
      <image width="1134" height="936" href="data:image/jpeg;base64,${bytes.toString('base64')}"/>
    </svg>
  </g>
</svg>\n`;
await writeFile(join(root, 'icon.svg'), svg);
await writeFile(join(directory, 'provenance.json'), JSON.stringify({
  artwork: 'User-supplied BitCrush logo', sourceFile: 'Make_logo_variations_2K_20261020214041.jpg',
  sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  treatment: 'Original JPEG bytes embedded unchanged in an SVG presentation frame. Black outer margins are framed with a viewBox; an inset rounded rectangle provides transparent outer corners. Native ICO/ICNS/PNG sizes are produced by the Tauri icon tool.',
  headerSizeCssPixels: 36, startupSizeCssPixels: 76,
}, null, 2) + '\n');
console.log('Prepared original logo, rounded master icon, and provenance.');
