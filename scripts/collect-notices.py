"""Retain dependency license files beside distributable applications."""
from pathlib import Path
import json
import re
import shutil
import tomllib

root = Path(__file__).resolve().parents[1]
destination = root / 'notices'
destination.mkdir(exist_ok=True)
index = []
pattern = re.compile(r'^(licen[cs]e|copying|notice|ofl)([.\-_].*)?$', re.I)

def collect(directory, name, version, license_name=None):
    files = [p for p in directory.iterdir() if p.is_file() and pattern.match(p.name)]
    target = destination / f'{name.replace("/", "-").replace("@", "")}-{version}'
    if files:
        target.mkdir(exist_ok=True)
        for file in files:
            shutil.copyfile(file, target / file.name)
    index.append({'name': name, 'version': version, 'license': license_name, 'files': [p.name for p in files]})

for package in (root / 'node_modules').glob('**/package.json'):
    if package.parent.name == 'node_modules':
        continue
    try:
        data = json.loads(package.read_text(encoding='utf-8'))
        if data.get('name') and data.get('version'):
            collect(package.parent, data['name'], data['version'], data.get('license'))
    except (OSError, ValueError):
        continue

lock = tomllib.loads((root / 'src-tauri/Cargo.lock').read_text(encoding='utf-8'))
cargo_root = Path.home() / '.cargo/registry/src'
registries = list(cargo_root.iterdir()) if cargo_root.exists() else []
for package in lock['package']:
    for registry in registries:
        directory = registry / f'{package["name"]}-{package["version"]}'
        if directory.exists():
            collect(directory, package['name'], package['version'])
            break
(destination / 'dependencies.json').write_text(json.dumps(index, indent=2) + '\n', encoding='utf-8')
print(f'Collected dependency license records: {len(index)}')
