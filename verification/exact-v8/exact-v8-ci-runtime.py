"""CI build runner with toolchain preflight and recoverable archive checkpoints.

Never changes engine source/flags or normalizes snapshot/version identities.
"""
from pathlib import Path
import argparse, ctypes, hashlib, json, os, re, shutil, subprocess, sys, time, zipfile

def sha(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def plan_identity(root):
    plan=json.loads((root/'plan.json').read_text())
    return {key:plan[key] for key in ['rustyV8','v8','patches','patchDigests','gnArgs','cargoFeature']}

def archive_integrity(archive):
    with archive.open('rb') as stream:magic=stream.read(8)
    if magic==b'!<thin>\n':raise RuntimeError('Thin archive cannot be checkpointed: referenced object members would be absent. Build a complete normal archive.')
    if magic!=b'!<arch>\n':raise RuntimeError('Expected a normal self-contained ar archive')
    subprocess.run(['ar','t',archive],stdout=subprocess.DEVNULL,check=True,timeout=60)

def path_identity(root):
    # GN project.json can carry absolute paths. Do not silently rebase it.
    return {'workspace':str(root.resolve()),'sourceRoot':str((root/'rusty_v8').resolve()),
      'gnOut':str((root/'verification/native-v8-probe/target/release/gn_out').resolve())}

def preflight(root,env):
    location=Path(env.get('LIBCLANG_PATH','')).resolve()
    libraries=sorted(location.glob('libclang.so*'))
    compiler=location.parent/'bin/clang'
    if not libraries or not compiler.is_file():raise RuntimeError('Install both clang21 and libclang21-dev; LIBCLANG_PATH must contain libclang and ../bin/clang.')
    class CXString(ctypes.Structure):_fields_=[('data',ctypes.c_void_p),('private_flags',ctypes.c_uint)]
    library=ctypes.CDLL(str(libraries[0]));library.clang_getClangVersion.restype=CXString
    library.clang_getCString.argtypes=[CXString];library.clang_getCString.restype=ctypes.c_char_p
    library.clang_disposeString.argtypes=[CXString]
    value=library.clang_getClangVersion()
    version=library.clang_getCString(value).decode();library.clang_disposeString(value)
    match=re.search(r'(?:clang version|version)\s+(\d+)',version)
    if not match or int(match[1])<20:raise RuntimeError('Bundled libc++ requires libclang20+: '+version)
    binary_version=subprocess.check_output([compiler,'--version'],text=True,timeout=10)
    binary_major=re.search(r'clang version\s+(\d+)',binary_version)
    if not binary_major or binary_major[1]!=match[1]:raise RuntimeError('libclang/compiler major mismatch')
    resource=Path(subprocess.check_output([compiler,'-print-resource-dir'],text=True,timeout=10).strip())
    if not (resource/'include/stdint.h').is_file() or not (resource/'include/stddef.h').is_file():raise RuntimeError('Missing Clang builtin resource headers')
    source=root/'rusty_v8'
    # Chromium build 8fbb331a68c597851e2e91de6e08a06baa3d719b,
    # config/compiler/BUILD.gn supplies this through GN defines, not __config_site.
    # This standalone header sample has no GN project yet. This flag affects
    # only the sample; actual bindgen still reads the generated GN defines.
    flags=['-x','c++','-std=c++20','-fsyntax-only','-nostdinc++','-resource-dir='+str(resource),
      '-D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_EXTENSIVE',
      '-isystembuildtools/third_party/libc++','-isystemthird_party/libc++/src/include','-isystemthird_party/libc++abi/src/include']
    code='#include <cstdint>\n#include <memory>\nstatic_assert(sizeof(std::uintptr_t)==sizeof(void*));\nstatic_assert(sizeof(std::uint64_t)==8);\nstatic_assert(SIZE_MAX>0);\n'
    result=subprocess.run([compiler,*flags,'-'],input=code,text=True,capture_output=True,cwd=source,timeout=30)
    # Exercise the same libclang C parser bindgen uses, not only clang executable.
    library.clang_createIndex.argtypes=[ctypes.c_int,ctypes.c_int];library.clang_createIndex.restype=ctypes.c_void_p
    library.clang_parseTranslationUnit.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.POINTER(ctypes.c_char_p),ctypes.c_int,ctypes.c_void_p,ctypes.c_uint,ctypes.c_uint]
    library.clang_parseTranslationUnit.restype=ctypes.c_void_p
    library.clang_getNumDiagnostics.argtypes=[ctypes.c_void_p];library.clang_getNumDiagnostics.restype=ctypes.c_uint
    library.clang_getDiagnostic.argtypes=[ctypes.c_void_p,ctypes.c_uint];library.clang_getDiagnostic.restype=ctypes.c_void_p
    library.clang_getDiagnosticSeverity.argtypes=[ctypes.c_void_p];library.clang_getDiagnosticSeverity.restype=ctypes.c_int
    library.clang_formatDiagnostic.argtypes=[ctypes.c_void_p,ctypes.c_uint];library.clang_formatDiagnostic.restype=CXString
    library.clang_disposeDiagnostic.argtypes=[ctypes.c_void_p]
    library.clang_disposeTranslationUnit.argtypes=[ctypes.c_void_p];library.clang_disposeIndex.argtypes=[ctypes.c_void_p]
    sample=root/'bindgen-preflight.cc';sample.write_text(code)
    absolute_flags=[('-isystem'+str(source/arg[len('-isystem'):])) if arg.startswith('-isystem') else arg for arg in flags if arg!='-fsyntax-only']
    argv=(ctypes.c_char_p*len(absolute_flags))(*(arg.encode() for arg in absolute_flags))
    index=library.clang_createIndex(0,0)
    unit=library.clang_parseTranslationUnit(index,str(sample).encode(),argv,len(absolute_flags),None,0,0)
    errors=[]
    if unit:
        for i in range(library.clang_getNumDiagnostics(unit)):
            diagnostic=library.clang_getDiagnostic(unit,i)
            if library.clang_getDiagnosticSeverity(diagnostic)>=3:
                formatted=library.clang_formatDiagnostic(diagnostic,0)
                errors.append({'index':i,'message':library.clang_getCString(formatted).decode()})
                library.clang_disposeString(formatted)
            library.clang_disposeDiagnostic(diagnostic)
        library.clang_disposeTranslationUnit(unit)
    library.clang_disposeIndex(index)
    report={'libclang':version,'compiler':binary_version,'resourceDirectory':str(resource),'clangSyntaxExitCode':result.returncode,
      'clangSyntaxStderr':result.stderr,'clangArguments':flags,'libclangParseCreatedTranslationUnit':bool(unit),'libclangErrorDiagnostics':errors}
    (root/'bindgen-preflight.json').write_text(json.dumps(report,indent=2)+'\n')
    if result.returncode or not unit or errors:raise RuntimeError('Bundled-libc++/stdint preflight failed; see bindgen-preflight.json before spending time on V8.')

def checkpoint(root):
    profile=root/'verification/native-v8-probe/target/release';gn=profile/'gn_out'
    archive=gn/'obj/librusty_v8.a'
    if not archive.is_file() or not (gn/'project.json').is_file():return None
    archive_integrity(archive)
    destination=root/'checkpoint';destination.mkdir(exist_ok=True)
    targets=[archive,gn/'project.json',gn/'args.gn']
    if (gn/'src_binding.rs').is_file():targets.append(gn/'src_binding.rs')
    if (gn/'gen').is_dir():targets.extend(p for p in (gn/'gen').rglob('*') if p.is_file() and not p.is_symlink())
    manifest={'identity':plan_identity(root),'paths':path_identity(root),'createdAtUnix':int(time.time()),'files':[],
      'scope':'Own exact-source compiled archive and generated metadata, not an upstream prebuilt; can resume binding generation without rerunning Ninja.'}
    for path in targets:
        if not path.is_file():continue
        relative=path.relative_to(gn);saved=destination/relative;saved.parent.mkdir(parents=True,exist_ok=True)
        digest=sha(path)
        if not saved.exists():
            try:os.link(path,saved)
            except OSError:shutil.copy2(path,saved)
        elif sha(saved)!=digest:raise RuntimeError('Checkpoint destination differs; refusing overwrite')
        manifest['files'].append({'path':relative.as_posix(),'bytes':path.stat().st_size,'sha256':digest})
    (destination/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return {'directory':str(destination),'archiveBytes':archive.stat().st_size,'archiveSha256':sha(archive),'files':len(targets)}

def restore(root,directory):
    data=json.loads((directory/'manifest.json').read_text())
    if data['identity']!=plan_identity(root):raise RuntimeError('Checkpoint engine/source/flags identity mismatch')
    if data.get('paths')!=path_identity(root):raise RuntimeError('Checkpoint absolute build paths differ; GN metadata is not silently rebased. Use the identical prepared workspace path.')
    archive_integrity(directory/'obj/librusty_v8.a')
    destination=root/'verification/native-v8-probe/target/release/gn_out'
    for item in data['files']:
        source=(directory/item['path']).resolve();target=(destination/item['path']).resolve()
        if not source.is_relative_to(directory.resolve()) or not target.is_relative_to(destination.resolve()):raise RuntimeError('Unsafe checkpoint path')
        if not source.is_file() or source.stat().st_size!=item['bytes'] or sha(source)!=item['sha256']:raise RuntimeError('Checkpoint file hash/size mismatch')
        target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists():
            if sha(target)!=item['sha256']:raise RuntimeError('Existing GN file differs; choose clean prepared workspace')
        else:shutil.copy2(source,target)
    archive_integrity(destination/'obj/librusty_v8.a')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--workspace',type=Path,default=Path(__file__).resolve().parent)
    parser.add_argument('--restore-checkpoint',type=Path);parser.add_argument('--preflight-only',action='store_true')
    args=parser.parse_args();root=args.workspace.resolve()
    if os.environ.get('GITHUB_ACTIONS')!='true':raise SystemExit('This build runner is CI-only.')
    env=os.environ.copy();env.update(json.loads((root/'build-environment.json').read_text()))
    for key in ['RUSTY_V8_ARCHIVE','RUSTY_V8_MIRROR','RUSTY_V8_SRC_BINDING_PATH','BITCRUSH_V8_BINDGEN_ONLY','CLANG_BASE_PATH']:env.pop(key,None)
    summary={'passed':False,'attempts':[],'buildCompleted':False,'enginePreservation':'Not yet established'}
    started=time.time()
    try:
        preflight(root,env)
        summary['preflightPassed']=True
        if args.preflight_only:return
        if args.restore_checkpoint:
            restore(root,args.restore_checkpoint.resolve());env['BITCRUSH_V8_BINDGEN_ONLY']='1'
        package=root/'verification/native-v8-probe'
        with (root/'build.log').open('w') as log:
            subprocess.run(['cargo','build','--release','--jobs',env['CARGO_BUILD_JOBS'],'--manifest-path',package/'Cargo.toml'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=10800)
        summary['buildCompleted']=True
        executable=package/'target/release/bitcrush-native-v8-probe'
        for mode in ['strict','flags']:
            result=subprocess.run([executable,mode],cwd=root,env=env,capture_output=True,text=True,timeout=60)
            summary['attempts'].append({'mode':mode,'exitCode':result.returncode,'stdout':result.stdout[-8000:],'stderr':result.stderr[-8000:]})
        summary['passed']=any(item['exitCode']==0 for item in summary['attempts'])
        archive=package/'target/exact-v8-host-size.zip'
        with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as zipped:zipped.write(executable,executable.name)
        summary.update({'hostBytes':executable.stat().st_size,'hostZipBytes':archive.stat().st_size})
    except Exception as error:summary['error']=str(error)
    finally:
        try:summary['checkpoint']=checkpoint(root)
        except Exception as error:summary['checkpointError']=str(error)
        summary['elapsedSeconds']=round(time.time()-started)
        (root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
    if not summary['passed']:raise SystemExit(1)

if __name__=='__main__':main()
