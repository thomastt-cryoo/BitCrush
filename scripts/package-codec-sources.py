"""Acquire pinned official codec sources, verify their identities, and publish separately."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request
import zipfile

root = Path(__file__).resolve().parents[1]
manifest = root / 'verification/codec-source'
stage = root / 'artifacts/codec-source'
stage.mkdir(parents=True, exist_ok=True)
records = []
for item in json.loads((manifest / 'dependency-source-manifest.json').read_text())['records']:
    records.append((item['archiveUrl'], item['archive'].replace('\\', '/'), item['sha256']))
for item in json.loads((manifest / 'extra-source-manifest.json').read_text())['records']:
    records.append((item['url'], item['file'], item['sha256']))
release = json.loads((manifest / 'release-source-identity.json').read_text())
records.append((f"https://codeload.github.com/ffmpegwasm/ffmpeg.wasm/tar.gz/{release['commit']}", release['archive'], release['sha256']))

def acquire(record):
    url, relative, expected = record
    destination = stage / relative
    if not destination.resolve().is_relative_to(stage.resolve()):
        raise RuntimeError('Unsafe source archive path')
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'BitCrush-source-preservation'})
        with urllib.request.urlopen(request, timeout=120) as response, destination.open('wb') as output:
            shutil.copyfileobj(response, output)
    if hashlib.sha256(destination.read_bytes()).hexdigest() != expected:
        raise RuntimeError(f'Source identity mismatch: {relative}')
    return relative

with ThreadPoolExecutor(max_workers=4) as executor:
    acquired = list(executor.map(acquire, records))
target = root / 'artifacts/ffmpeg-core-0.12.10-sources.zip'
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for relative in sorted(acquired):
        archive.write(stage / relative, relative, compress_type=zipfile.ZIP_STORED)
    for file in sorted(manifest.rglob('*')):
        if file.is_file():
            archive.write(file, file.relative_to(manifest).as_posix())
report = {'file': target.name, 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'archivesVerified': len(acquired), 'scope': 'Separate official codec release/dependency source corpus; see PACKAGE-README for reproducibility limits.'}
target.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
