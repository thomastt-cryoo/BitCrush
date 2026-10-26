"""Verify a downloaded Actions wrapper and its current Electron preview without launching it."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('wrapper', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('platform', choices=['Windows', 'Mac-Intel', 'Mac-Apple-Silicon'])
parser.add_argument('sha256')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
digest = lambda data: hashlib.sha256(data).hexdigest()
def file_digest(file):
    with file.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()
def require(condition, message):
    if not condition:
        raise RuntimeError(message)
def normalize(data):
    return data.replace(b'\r\n', b'\n')
stem = f'BitCrush-{args.platform}-Electron'
require(file_digest(args.wrapper) == args.sha256.removeprefix('sha256:'), 'Wrapper digest mismatch')
require(not args.output.exists(), 'Preserve existing extraction: choose a new output directory')
args.output.mkdir(parents=True)
with zipfile.ZipFile(args.wrapper) as outer:
    require(outer.testzip() is None, 'Corrupt artifact wrapper')
    metadata = json.loads(outer.read(f'artifacts/{stem}.json'))
    package = args.output / f'{stem}.zip'
    with outer.open(f'artifacts/{stem}.zip') as source, package.open('wb') as destination:
        shutil.copyfileobj(source, destination)
    (args.output / f'{stem}.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    for info in outer.infolist():
        if info.filename.startswith('test-results/') and info.filename.endswith(('.json', '.png')):
            relative = Path(info.filename).relative_to('test-results')
            require('..' not in relative.parts, 'Invalid artifact result path')
            target = args.output / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            require(not target.exists(), 'Duplicate artifact result filename')
            target.write_bytes(outer.read(info))
require(package.stat().st_size == metadata['bytes'], 'Package byte count mismatch')
require(file_digest(package) == metadata['sha256'], 'Package digest mismatch')
expected_arch = 'arm64' if args.platform == 'Mac-Apple-Silicon' else 'x64'
require(metadata['arch'] == expected_arch, 'Manifest CPU mismatch')
require(metadata['electron'] == '41.2.1', 'Unexpected engine host version')
reports = {}
with zipfile.ZipFile(package) as inner:
    require(inner.testzip() is None, 'Corrupt package ZIP')
    app_root = f'{stem}/resources/app/' if args.platform == 'Windows' else f'{stem}/BitCrush.app/Contents/Resources/app/'
    manifest = json.loads((root / 'verification/core-probe/assets/manifest.json').read_text())
    for item in manifest['files']:
        if item['name'].endswith('.jsc'):
            data = inner.read(app_root + 'engine/' + item['name'])
            require(len(data) == item['bytes'] and digest(data) == item['sha256'], 'Original engine changed: ' + item['name'])
    wasm = [name for name in inner.namelist() if name.endswith('.wasm')]
    require(len(wasm) == 1, 'Expected exactly one bundled WebAssembly codec')
    codec = inner.read(wasm[0])
    require(len(codec) == 32232419, 'Unexpected codec size')
    require(digest(codec) == file_digest(root / 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm'), 'Codec changed')
    checked_files = ['main.cjs', 'native-ffmpeg.cjs', 'ffmpeg-extract-worker.cjs', 'video-import.mjs', 'engine-worker.cjs', 'engine-renderer.cjs', 'engine-renderer.html', 'studio-shell.mjs', 'studio-components.mjs', 'studio-media.mjs', 'studio.css', 'mp4.mjs']
    for name in checked_files:
        require(normalize(inner.read(app_root + name)) == normalize((root / 'electron' / name).read_bytes()), 'Stale runtime/view: ' + name)
    renderer = inner.read(app_root + 'renderer/assets/index-Cc7ZI13O.js').decode()
    for marker in ['importNativeVideo(s,o,a', 'setBitcrushImportError', 'at=Math.min(dt,zt,fn.WORKER_POOL_SIZE)', 'videoFrameTask(sp(Qe)', 'processedFrameUrl:N?te:null', 'v="+faststart"', 'StudioViews.AnimationEditor', 'StudioViews.ModeConfirmation', 'StudioViews.AnimationSetup']:
        require(marker in renderer, 'Missing video correction: ' + marker)
    executable = f'{stem}/BitCrush.exe' if args.platform == 'Windows' else f'{stem}/BitCrush.app/Contents/MacOS/Electron'
    with inner.open(executable) as handle:
        header = handle.read(4096)
    if args.platform == 'Windows':
        offset = struct.unpack_from('<I', header, 0x3c)[0]
        require(header[offset:offset+4] == b'PE\0\0' and struct.unpack_from('<H', header, offset+4)[0] == 0x8664, 'Wrong Windows executable CPU')
    else:
        magic, cpu = struct.unpack_from('<II', header)
        require(magic == 0xfeedfacf and cpu == (0x0100000c if expected_arch == 'arm64' else 0x01000007), 'Wrong Mac executable CPU')
    for name in ['VALIDATION.json', 'COLOR-VALIDATION.json', 'DESIGN-VALIDATION.json', 'VIDEO-VALIDATION.json', 'MEDIA-UI-VALIDATION.json']:
        report = json.loads(inner.read(f'{stem}/{name}'))
        require(report.get('passed') is True, 'Failed included source report: ' + name)
        reports[name] = {'passed': True, 'checks': len(report.get('checks', []))}
for name in ['electron-smoke.json', 'electron-colors.json', 'electron-design.json', 'electron-video-source.json', 'electron-video-packaged.json']:
    report = json.loads((args.output / name).read_text())
    require(report.get('passed') is True, 'Failed final report: ' + name)
    reports[name] = {'passed': True, 'checks': len(report.get('checks', []))}
for mode in ['source', 'packaged']:
    name = f'media-ui/validation-{mode}.json'
    report = json.loads((args.output / name).read_text())
    require(report.get('passed') is True and len(report.get('checks', [])) == 6, 'Missing media interaction verification: ' + name)
    require(report.get('packaged') == (mode == 'packaged'), 'Wrong media interaction runtime: ' + name)
    reports[name] = {'passed': True, 'checks': len(report['checks'])}
copied_video = json.loads((args.output / 'electron-video-packaged.json').read_text())
require(copied_video.get('packaged') is True and copied_video.get('installation') == 'reused-verified-binary', 'Copied-app check did not reuse the verified binary')
for name in ['electron-video-source.json', 'electron-video-packaged.json']:
    native = json.loads((args.output / name).read_text())
    pixels = next((check['coloredPixels'] for check in native['checks'] if 'coloredPixels' in check), {})
    require(all(pixels.get(key, 0) > 1000 for key in ['preview', 'exported', 'exportedMiddle']), 'Missing presented/seeked video pixel verification: ' + name)
verification = {'passed': True, 'platform': args.platform, 'arch': expected_arch, 'wrapperSha256': file_digest(args.wrapper), 'packageSha256': metadata['sha256'], 'bytes': metadata['bytes'], 'exactEngines': True, 'codecCount': 1, 'currentRuntimeAndViews': checked_files, 'reports': reports}
(args.output / 'package-verification.json').write_text(json.dumps(verification, indent=2), encoding='utf-8')
print(json.dumps(verification, indent=2))
