import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[2]
package = Path(__file__).resolve().parent
executable = package / 'target/release' / ('bitcrush-native-v8-probe.exe' if sys.platform == 'win32' else 'bitcrush-native-v8-probe')
directory = root / 'artifacts/native-v8'
directory.mkdir(parents=True, exist_ok=True)
attempts = []
for mode in ['strict', 'flags', 'host', 'magic']:
    try:
        result = subprocess.run([str(executable), mode], cwd=root, text=True, capture_output=True, timeout=60)
        report_files = sorted(directory.glob(f'{mode}-*.json'))
        report = json.loads(report_files[-1].read_text()) if report_files else None
        attempts.append({'mode': mode, 'exitCode': result.returncode, 'passed': bool(report and report.get('passed')), 'stdout': result.stdout[-4000:], 'stderr': result.stderr[-4000:]})
    except subprocess.TimeoutExpired:
        attempts.append({'mode': mode, 'passed': False, 'timeout': True})
    except Exception as error:
        attempts.append({'mode': mode, 'passed': False, 'error': str(error)})
archive_path = package / 'target' / 'standalone-engine-size.zip'
with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    archive.write(executable, executable.name)
report = {'experimental': True, 'passed': any(item['passed'] for item in attempts), 'attempts': attempts, 'executableBytes': executable.stat().st_size, 'zipBytes': archive_path.stat().st_size, 'sha256': hashlib.sha256(executable.read_bytes()).hexdigest(), 'scope': 'Original engine default fixture checks in an isolated standalone V8 host; not an integrated Tauri engine or final complete app.'}
(directory / 'summary.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
sys.exit(0 if report['passed'] else 1)
