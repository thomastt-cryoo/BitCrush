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
    'patchDigests':dict(patches),
    'gnArgs':flags,'cargoFeature':'v8_enable_sandbox','jobs':args.jobs,
    'buildTimeoutSeconds':10800,'probeModes':['strict','flags'],
    'snapshotVersionOverrides':False,
    'status':'Exact-source C++ archive compiled in run39482894060; binding retry and exact engine acceptance/size remain unknown.',
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

# CI recovery guard changes only whether the already built archive is rebuilt.
# The wrapper enables it only after checking our own checkpoint's exact hashes,
# source/patch/GN identity and archive integrity. Binding generation still runs.
build_script=rusty/'build.rs'
build_text=build_script.read_text()
build_anchor='    build_v8(is_asan);\n    build_binding();'
if build_text.count(build_anchor)!=1:
    raise SystemExit('Pinned Rusty build.rs anchor changed; refusing recovery-guard patch')
build_text=build_text.replace(build_anchor,'''    if env_bool("BITCRUSH_V8_BINDGEN_ONLY") {
      assert!(static_lib_path().is_file(), "Verified archive missing");
      assert!(build_dir().join("gn_out/project.json").is_file(), "GN binding metadata missing");
      println!("cargo:rustc-link-search=native={}", static_lib_dir().display());
    } else {
      build_v8(is_asan);
    }
    build_binding();''')
build_text=build_text.replace('    "V8_FROM_SOURCE",','    "V8_FROM_SOURCE",\n    "BITCRUSH_V8_BINDGEN_ONLY",')
# Bindgen otherwise discovers include paths with a separately selected clang
# executable. Keep the successful libclang preflight's resource lookup and let
# libclang find platform C headers without injecting another compiler's paths.
resource_anchor='clang_args.push(format!("-isystem{}/include", resource_dir.trim()));'
builder_anchor='  let bindings = bindgen::Builder::default()\n    .header("src/binding.hpp")'
if build_text.count(resource_anchor)!=1 or build_text.count(builder_anchor)!=1:
    raise SystemExit('Pinned bindgen resource/builder anchors changed')
build_text=build_text.replace(resource_anchor,'clang_args.push(format!("-resource-dir={}", resource_dir.trim()));')
build_text=build_text.replace(builder_anchor,'''  eprintln!("BitCrush bindgen explicit arguments: {:?} {:?}", clang_args, filtered_args);
  let bindings = bindgen::Builder::default()
    .detect_include_paths(false)
    .header("src/binding.hpp")''')
build_script.write_text(build_text)
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
shutil.copy2(root/'exact-v8-ci-runtime.py',runner)
print(f'Prepared. Build and verify with: {sys.executable} {runner}',flush=True)
