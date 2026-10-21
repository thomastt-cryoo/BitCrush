import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import AdmZip from 'adm-zip';
import {electronExecutable} from './electron-runtime.mjs';
const executable=electronExecutable(),platform=process.platform,arch=process.arch;
const platformName=platform==='win32'?'Windows':platform==='darwin'?(arch==='arm64'?'Mac-Apple-Silicon':'Mac-Intel'):platform;
const stamp=`BitCrush-${platformName}-Electron`,stage=path.resolve('artifacts',stamp);
// Fail instead of overwriting a package the user may have changed or launched.
const suffix=process.env.BITCRUSH_PACKAGE_SUFFIX||'';
if(!/^[a-zA-Z0-9._-]*$/.test(suffix))throw new Error('Package suffix must contain only letters, numbers, periods, underscores or hyphens.');
const destination=stage+suffix;
if(fs.existsSync(destination))throw new Error('Package destination already exists: '+destination);
let appRoot;
if(platform==='darwin'){
 const originalBundle=path.resolve(executable,'../../..');
 fs.mkdirSync(destination,{recursive:true});
 const bundle=path.join(destination,'BitCrush.app');fs.cpSync(originalBundle,bundle,{recursive:true,dereference:false,verbatimSymlinks:true});
 const plist=path.join(bundle,'Contents/Info.plist');
 for(const [key,value]of Object.entries({CFBundleDisplayName:'BitCrush',CFBundleName:'BitCrush',CFBundleIdentifier:'com.bitcrush.studio',CFBundleShortVersionString:'0.2.0',CFBundleVersion:'0.2.0'}))execFileSync('/usr/libexec/PlistBuddy',['-c',`Set :${key} ${value}`,plist]);
 fs.copyFileSync('branding/icon.icns',path.join(bundle,'Contents/Resources/electron.icns'));
 appRoot=path.join(bundle,'Contents/Resources/app');
}else{
 fs.cpSync(path.dirname(executable),destination,{recursive:true});
 if(platform==='win32'){
  const target=path.join(destination,'BitCrush.exe');fs.renameSync(path.join(destination,path.basename(executable)),target);
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/set-windows-icon.ps1','-Executable',target,'-Icon',path.resolve('branding/icon.ico')],{stdio:'inherit'});
 }
 appRoot=path.join(destination,'resources/app');
}
fs.cpSync('dist/electron',appRoot,{recursive:true});
fs.copyFileSync('THIRD-PARTY-NOTICES.txt',path.join(destination,'THIRD-PARTY-NOTICES.txt'));
fs.writeFileSync(path.join(destination,'README.txt'),'BitCrush Studio — Electron preview\n\nOpen BitCrush.exe (Windows) or BitCrush.app (macOS). Keep the entire folder together.\nMedia and presets stay on this computer. Application data uses a separate BitCrush folder.\nThe original 73 dither algorithms, halftone, browser effects and media workflows are retained.\nSee the supplied validation report for the workflows actually checked on this platform.\n');
for(const [report,name] of [['electron-smoke.json','VALIDATION.json'],['electron-colors.json','COLOR-VALIDATION.json'],['electron-design.json','DESIGN-VALIDATION.json'],['electron-video.json','VIDEO-VALIDATION.json']]){const source=path.join('test-results',report);if(fs.existsSync(source))fs.copyFileSync(source,path.join(destination,name));}
if(platform==='darwin')execFileSync('codesign',['--force','--deep','--sign','-',path.join(destination,'BitCrush.app')],{stdio:'inherit'});
const zipPath=destination+'.zip';
if(platform==='darwin')execFileSync('ditto',['-c','-k','--sequesterRsrc','--keepParent',destination,zipPath]);
else{const zip=new AdmZip();zip.addLocalFolder(destination,path.basename(destination));zip.writeZip(zipPath);}
const bytes=fs.readFileSync(zipPath),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
const manifest={platform,arch,electron:'41.2.1',version:'0.2.0',directory:destination,zip:zipPath,bytes:bytes.length,sha256};
fs.writeFileSync(destination+'.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
