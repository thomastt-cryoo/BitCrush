"""Prepare a CI-only exact V8 source build without modifying the project checkout.

Default is a plan. --execute permits large downloads only on GitHub Actions.
The supplied workspace must be absent. No source artifact is rewritten.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

RUSTY_TAG='v146.9.0'
RUSTY_SHA='81a3711cacee3272cdd3c37c1526dc1cf55cd7b7'
V8_TAG='14.6.202.33'
V8_SHA='f09a91282a26caa91d016c962d785d852cfdec36'
root=Path(__file__).resolve().parent

parser=argparse.ArgumentParser()
parser.add_argument('--probe',type=Path,required=True,help='Existing native-v8-probe source directory')
parser.add_argument('--core',type=Path,required=True,help='Existing core-probe directory containing assets')
parser.add_argument('--workspace',type=Path,required=True,help='Absent runner-local work directory')
parser.add_argument('--jobs',type=int,default=2)
parser.add_argument('--execute',action='store_true')
args=parser.parse_args()
if args.jobs<1 or args.jobs>8: parser.error('--jobs must be between1 and8')
probe=args.probe.resolve(strict=True)
core=args.core.resolve(strict=True)
workspace=args.workspace.resolve()
flags=[line.strip() for line in (root/'exact-v8-gn-args.txt').read_text().splitlines() if line.strip() and not line.lstrip().startswith('#')]
patches=[
    ('754570cd10b10c743fea734f95ddaf7f6176c9c5.patch','e9009b972500d26d30c6e9500eb20f1d0d430294a2283a2b6e254a98b5436bb1'),
    ('36c7885aff81050e371d2e3f68c5923f065c193e.patch','4ebe765756b04a25057fd354cd423e52ec219886dcb454601d3594a667de02f1'),
    ('electron-chore_allow_customizing_microtask_policy_per_context.patch','4f35bf04f1ea75363280bac260e8b0d612302dab8a5cb9b61c2867e1935050ed'),
    ('electron-build_warn_instead_of_abort_on_builtin_pgo_profile_mismatch.patch','66ae6be87828062e8fa0236cce26641c96d8210be72bd1d432f51d0dd282957e'),
    ('electron-cherry-pick-b54c7841e2cd.patch','5bcf4883679652793435f5ea4752ce3b728fa328ecab4d10bb7d8c9b745dc9dc'),
    ('electron-cherry-pick-ba0258ba9609.patch','f261136e96e33442c19546d210770011a881c9ee5ad24ea63b4560d991b125ca'),
]
for name,expected in patches:
    if hashlib.sha256((root/name).read_bytes()).hexdigest()!=expected:
        raise SystemExit(f'Patch identity mismatch: {name}')
plan={
    'workspace':str(workspace),'rustyV8':{'tag':RUSTY_TAG,'commit':RUSTY_SHA},
    'v8':{'tag':V8_TAG,'commit':V8_SHA},'patches':[name for name,_ in patches],
    'gnArgs':flags,'cargoFeature':'v8_enable_sandbox','jobs':args.jobs,
    'buildTimeoutSeconds':10800,'probeModes':['strict','flags'],
    'snapshotVersionOverrides':False,
    'status':'Unexecuted source-build experiment; exact engine acceptance and size are unknown.',
}
print(json.dumps(plan,indent=2),flush=True)
if not args.execute: raise SystemExit(0)
if os.environ.get('GITHUB_ACTIONS')!='true':
    raise SystemExit('--execute is restricted to GitHub Actions; do not download V8 into the local machine.')
if workspace.exists(): raise SystemExit('Workspace already exists; choose a new path. No files were removed.')
if shutil.disk_usage(workspace.parent).free < 20_000_000_000:
    raise SystemExit('Source build requires at least20GB free runner workspace; actual peak is unmeasured.')
workspace.mkdir(parents=True)
(workspace/'plan.json').write_text(json.dumps(plan,indent=2)+'\n')
log=workspace/'prepare.log'
def run(command,cwd=None,timeout=1200):
    print('+ '+subprocess.list2cmdline([str(v) for v in command]),flush=True)
    with log.open('a',encoding='utf-8') as stream:
        subprocess.run([str(v) for v in command],cwd=cwd,check=True,timeout=timeout,stdout=stream,stderr=subprocess.STDOUT)
rusty=workspace/'rusty_v8'
run(['git','clone','--depth','1','--branch',RUSTY_TAG,'https://github.com/denoland/rusty_v8.git',rusty])
actual=subprocess.check_output(['git','rev-parse','HEAD'],cwd=rusty,text=True).strip()
if actual!=RUSTY_SHA: raise SystemExit('RustyV8 tag moved; stopping')
paths=subprocess.check_output(['git','config','--file','.gitmodules','--get-regexp',r'^submodule\..*\.path$'],cwd=rusty,text=True)
paths=[line.split(None,1)[1] for line in paths.splitlines() if line.split(None,1)[1]!='v8']
run(['git','submodule','update','--init','--depth','1','--recursive','--jobs',str(args.jobs),'--',*paths],cwd=rusty,timeout=2400)
run(['git','clone','--depth','1','--branch',V8_TAG,'https://github.com/v8/v8.git',rusty/'v8'])
actual=subprocess.check_output(['git','rev-parse','HEAD'],cwd=rusty/'v8',text=True).strip()
if actual!=V8_SHA: raise SystemExit('V8 tag moved; stopping')
for name,_ in patches:
    run(['git','apply','--check',root/name],cwd=rusty/'v8')
    run(['git','apply',root/name],cwd=rusty/'v8')
destination=workspace/'verification/native-v8-probe'
destination.mkdir(parents=True)
shutil.copytree(probe/'src',destination/'src')
cargo=(probe/'Cargo.toml').read_text()
cargo=re.sub(r'^v8\s*=.*$', 'v8 = { version = "=146.9.0", features = ["v8_enable_sandbox"] }',cargo,flags=re.M)
cargo+='\n[patch.crates-io]\nv8 = { path = "../../rusty_v8" }\n'
(destination/'Cargo.toml').write_text(cargo)
shutil.copytree(core/'assets',workspace/'verification/core-probe/assets')
environment={
    'V8_FROM_SOURCE':'1','PRINT_GN_ARGS':'1','GN_ARGS':' '.join(flags),
    'CARGO_BUILD_JOBS':str(args.jobs),'NUM_JOBS':str(args.jobs),
    'CARGO_TARGET_DIR':str(destination/'target'),
}
(workspace/'build-environment.json').write_text(json.dumps(environment,indent=2)+'\n')
runner=workspace/'build-and-verify.py'
runner.write_text('''from pathlib import Path
import json, os, subprocess, sys, time, zipfile
root=Path(__file__).resolve().parent
env=os.environ.copy();env.update(json.loads((root/'build-environment.json').read_text()))
for key in ['RUSTY_V8_ARCHIVE','RUSTY_V8_MIRROR','RUSTY_V8_SRC_BINDING_PATH']:
    env.pop(key,None)
package=root/'verification/native-v8-probe'
started=time.time()
with (root/'build.log').open('w') as log:
    subprocess.run(['cargo','build','--release','--jobs',env['CARGO_BUILD_JOBS'],'--manifest-path',str(package/'Cargo.toml')],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=10800)
executable=package/'target/release'/('bitcrush-native-v8-probe.exe' if sys.platform=='win32' else 'bitcrush-native-v8-probe')
results=[]
for mode in ['strict','flags']:
    result=subprocess.run([str(executable),mode],cwd=root,env=env,capture_output=True,text=True,timeout=60)
    results.append({'mode':mode,'exitCode':result.returncode,'stdout':result.stdout[-8000:],'stderr':result.stderr[-8000:]})
archive=package/'target/exact-v8-host-size.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as zipped:
    zipped.write(executable,executable.name)
summary={'buildSeconds':round(time.time()-started),'passed':any(r['exitCode']==0 for r in results),'attempts':results,'hostBytes':executable.stat().st_size,'hostZipBytes':archive.stat().st_size,'scope':'Exact-version standalone host experiment only; no final application package or universal Mac size established.'}
(root/'summary.json').write_text(json.dumps(summary,indent=2)+'\\n')
print(json.dumps(summary,indent=2))
sys.exit(0 if summary['passed'] else 1)
''')
print(f'Prepared. Build and verify with: {sys.executable} {runner}',flush=True)
