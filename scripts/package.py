"""Create a portable preview ZIP, retain executable modes, and enforce the requested size."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("name")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
source = args.source.resolve(strict=True)
destination = root / "artifacts" / args.name
destination.parent.mkdir(exist_ok=True)
subprocess.run([os.sys.executable, str(root / 'scripts/collect-notices.py')], check=True)
with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    if source.is_dir():
        for path in sorted(source.rglob("*")):
            name = str(Path(source.name) / path.relative_to(source)).replace("\\", "/")
            if path.is_symlink():
                item = zipfile.ZipInfo(name)
                item.create_system = 3
                item.external_attr = (stat.S_IFLNK | 0o777) << 16
                archive.writestr(item, os.readlink(path))
            elif path.is_file():
                archive.write(path, name)
    else:
        archive.write(source, source.name)
        # Windows portable executable resolves this external resource beside itself.
        archive.write(root / 'src-tauri/resources/media/ffmpeg-core.wasm', 'media/ffmpeg-core.wasm')
    for name in ["PREVIEW-STATUS.md", "THIRD-PARTY-NOTICES.txt"]:
        archive.write(root / name, name)
    run_id = os.environ.get('GITHUB_RUN_ID')
    source_location = f'https://github.com/thomastt-cryoo/BitCrush/actions/runs/{run_id}' if run_id else 'The accompanying ffmpeg-core-0.12.10-sources.zip source archive'
    archive.writestr('CODEC-SOURCES.txt', f'The bundled FFmpeg core 0.12.10 is GPL-2.0-or-later. Full licenses are retained in notices/media.\nMatching official release and dependency sources are provided separately alongside this binary at:\n{source_location}\nDownload the ffmpeg-core-0.12.10-sources artifact. Source details and reproducibility limits: verification/codec-source/PACKAGE-README.md in the application repository.\n')
    for file in sorted((root / 'notices').rglob('*')):
        if file.is_file():
            archive.write(file, str(file.relative_to(root)).replace('\\', '/'))
size = destination.stat().st_size
report = {"file": destination.name, "bytes": size, "limitBytes": 20_000_000, "underLimit": size < 20_000_000, "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(), "kind": "development preview, not the completed engine migration"}
destination.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
if not report["underLimit"]:
    raise SystemExit("The ZIP exceeds the requested 20 MB limit.")
