import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const assets = process.argv[2];
if (!assets) throw new Error('Usage: node scripts/import-reference.mjs <extracted-renderer-assets>');
const destination = resolve('src/data');
await mkdir(destination, { recursive: true });
const records = [];
const palettes = [];
let algorithms;
for (const name of await readdir(assets)) {
  if (!name.endsWith('.js')) continue;
  const bytes = await readFile(join(assets, name));
  const source = bytes.toString('utf8');
  const isMetadata = name.startsWith('metadata.prod-');
  const isPalette = source.length < 2000 && /export\{.* as colors/.test(source);
  if (!isMetadata && !isPalette) continue;
  // Only these already-inspected literal data modules are executed. Do not import application entry points.
  if (/\b(import|require|fetch|window|document|process)\b/.test(source)) throw new Error(`Unexpected executable dependency: ${name}`);
  const module = await import(pathToFileURL(join(assets, name)));
  if (isMetadata) algorithms = module.ditherMetadata;
  else palettes.push(module.default);
  records.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
if (algorithms?.length !== 73) throw new Error(`Expected the original 73 algorithm definitions, found ${algorithms?.length}`);
await writeFile(join(destination, 'algorithms.json'), JSON.stringify(algorithms, null, 2) + '\n');
await writeFile(join(destination, 'palettes.json'), JSON.stringify(palettes, null, 2) + '\n');
await writeFile(join(destination, 'provenance.json'), JSON.stringify({
  sourceApplication: 'Dither Boy 6.0.3',
  sourceArchiveSha256: 'ff648aef8e28f383cc523213838d07b07c293f79186e5d0b3048f7c7549adb6a',
  transformations: 'Original exported data serialized to JSON. No values, names, parameter ranges, or palette colors changed.',
  algorithms: algorithms.length, palettes: palettes.length, records,
}, null, 2) + '\n');
console.log(JSON.stringify({ algorithms: algorithms.length, palettes: palettes.length }));
