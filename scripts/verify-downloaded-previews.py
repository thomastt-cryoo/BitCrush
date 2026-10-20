"""Verify and extract only named release previews from Actions artifact wrappers."""
import hashlib
import json
from pathlib import Path
import zipfile

base = Path(__file__).resolve().parents[1] / 'artifacts/github'
for platform, stem in [('windows', 'BitCrush-Windows-preview'), ('mac-universal', 'BitCrush-macOS-Universal-preview')]:
    source = base / f'{platform}-artifact.zip'
    output = base / platform
    output.mkdir(exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        expected = [f'{stem}.json', f'{stem}.zip', 'desktop-smoke.json']
        if sorted(archive.namelist()) != sorted(expected):
            raise RuntimeError(f'Unexpected artifact entries: {source.name}')
        for name in expected:
            (output / name).write_bytes(archive.read(name))
    package = output / f'{stem}.zip'
    metadata = json.loads((output / f'{stem}.json').read_text())
    smoke = json.loads((output / 'desktop-smoke.json').read_text())
    size = package.stat().st_size
    digest = hashlib.sha256(package.read_bytes()).hexdigest()
    print(json.dumps({'platform': platform, 'bytes': size, 'sha256': digest, 'metadata': metadata, 'smoke': smoke}, indent=2))
    assert size < 20_000_000
    assert metadata['bytes'] == size
    assert metadata['sha256'] == digest
    assert smoke['webview']['passed'] is True
