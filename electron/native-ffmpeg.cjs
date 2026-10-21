'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const {pipeline} = require('node:stream/promises');
const {spawn, execFile} = require('node:child_process');
const {Worker} = require('node:worker_threads');

function extractBinary(archive,candidate,binaryName,timeout=120000) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(path.join(__dirname,'ffmpeg-extract-worker.cjs'),{workerData:{archive,candidate,binaryName}});
    let settled=false;
    const finish=async error=>{if(settled)return;settled=true;clearTimeout(timer);await worker.terminate();error?reject(error):resolve();};
    const timer=setTimeout(()=>finish(new Error('FFmpeg extraction timed out. Please retry.')),timeout);
    worker.on('message',result=>finish(result.success?null:new Error(result.error)));
    worker.on('error',finish);
    worker.on('exit',code=>{if(!settled)finish(new Error(`FFmpeg extractor exited before completing (${code})`));});
  });
}

function downloadURL(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
  if (platform === 'darwin' && arch === 'arm64') return 'https://www.osxexperts.net/ffmpeg9arm.zip';
  if (platform === 'darwin' && arch === 'x64') return 'https://www.osxexperts.net/ffmpeg80intel.zip';
  throw new Error(`No native FFmpeg download for ${platform}/${arch}`);
}
const runFile = (file, args) => new Promise((resolve, reject) => execFile(file, args, {timeout:15000, windowsHide:true}, (error, stdout, stderr) => error ? reject(error) : resolve(stdout + stderr)));
async function version(file) {
  try { return (await runFile(file, ['-version'])).match(/ffmpeg version (\S+)/)?.[1] || null; } catch { return null; }
}
async function download(url, destination, progress, redirects = 0, signal) {
  if (redirects > 8) throw new Error('Too many download redirects');
  if (new URL(url).protocol !== 'https:') throw new Error('FFmpeg downloads require HTTPS');
  const response = await new Promise((resolve, reject) => {
    const request = https.get(url, {signal, headers:{'User-Agent':'BitCrush-Studio'}}, resolve);
    request.setTimeout(30000, () => request.destroy(new Error('FFmpeg download stopped responding. Please retry.')));
    request.on('error', reject);
  });
  if ([301,302,303,307,308].includes(response.statusCode)) {
    response.resume();
    if (!response.headers.location) throw new Error('Download redirect has no destination');
    return download(new URL(response.headers.location, url).href, destination, progress, redirects + 1, signal);
  }
  if (response.statusCode !== 200) { response.resume(); throw new Error(`FFmpeg download failed: HTTP ${response.statusCode}`); }
  const total = Number(response.headers['content-length']) || 0;
  let bytes = 0, lastProgress=0;
  let inactivity;
  const touch = () => { clearTimeout(inactivity); inactivity = setTimeout(() => response.destroy(new Error('FFmpeg download stopped responding. Please retry.')),30000); };
  touch();
  response.on('data', chunk => { touch(); bytes += chunk.length; const now=Date.now();if(now-lastProgress>=100||bytes===total){lastProgress=now;progress({phase:'downloading', percent:total ? Math.min(85,Math.round(bytes/total*85)) : 0, message:`Downloading… ${Math.round(bytes/1024/1024)} MB`});} });
  try { await pipeline(response, fs.createWriteStream(destination), {signal}); } finally { clearTimeout(inactivity); }
  if (!bytes || (total && bytes !== total)) throw new Error('FFmpeg download was incomplete. Please retry.');
}
function register({app, ipcMain}) {
  const directory = () => path.join(app.getPath('userData'),'ffmpeg');
  const binary = () => path.join(directory(), process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const executions = new Map();
  let installing;
  ipcMain.handle('ffmpeg:getStatus', async () => {
    const file = binary(), installedVersion = await version(file);
    return {installed:!!installedVersion, path:installedVersion ? file : null, version:installedVersion};
  });
  ipcMain.handle('ffmpeg:download', async event => {
    if (installing) return {success:false,error:'An FFmpeg installation is already running.'};
    installing = true;
    const progress = update => { if (!event.sender.isDestroyed()) event.sender.send('ffmpeg:download-progress',update); };
    const stage = fs.mkdtempSync(path.join(os.tmpdir(),'bitcrush-ffmpeg-'));
    const archive = path.join(stage,'download.zip');
    const candidate = path.join(directory(),`.install-${Date.now()}`);
    try {
      const url = downloadURL();
      progress({phase:'downloading',percent:0,message:'Connecting…'});
      for (let attempt=0; ; attempt++) {
        try { await download(url,archive,progress,0,AbortSignal.timeout(180000)); break; }
        catch (error) { if(attempt>=1) throw error; progress({phase:'downloading',percent:0,message:'Connection interrupted. Retrying…'}); }
      }
      progress({phase:'extracting',percent:87,message:'Extracting…'});
      const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
      await extractBinary(archive,candidate,name);
      if (process.platform === 'darwin') {
        const header=Buffer.alloc(8), file=await fs.promises.open(candidate,'r');
        try{await file.read(header,0,8,0);}finally{await file.close();}
        const cpu = process.arch === 'arm64' ? 0x0100000c : 0x01000007;
        if (header.readUInt32LE(0) !== 0xfeedfacf || header.readUInt32LE(4) !== cpu) throw new Error('Downloaded FFmpeg has the wrong Mac architecture');
        await runFile('/usr/bin/codesign',['--force','--sign','-',candidate]);
      }
      progress({phase:'verifying',percent:97,message:'Verifying…'});
      const installedVersion = await version(candidate);
      if (!installedVersion) throw new Error('Downloaded FFmpeg could not run. The existing installation was kept.');
      // Candidate is on the same volume. Never remove a working installation before verification.
      await fs.promises.rename(candidate,binary());
      progress({phase:'done',percent:100,message:`Installed FFmpeg ${installedVersion}`});
      return {success:true,version:installedVersion};
    } catch (error) {
      const message = ['AbortError','TimeoutError'].includes(error.name) || error.message === 'aborted'
        ? 'The FFmpeg download was interrupted or timed out. Please retry; your existing installation was kept.'
        : error.message || String(error);
      progress({phase:'error',percent:0,message}); return {success:false,error:message};
    } finally {
      try{await fs.promises.rm(candidate,{force:true});await fs.promises.rm(stage,{recursive:true,force:true});}finally{installing=false;}
    }
  });
  ipcMain.handle('ffmpeg:uninstall', () => {
    if (installing || executions.size) return {success:false,error:'FFmpeg is busy. Wait for the current operation to finish.'};
    try { fs.rmSync(directory(),{recursive:true,force:true}); return {success:true}; } catch (error) { return {success:false,error:error.message}; }
  });
  ipcMain.handle('ffmpeg:cancelNative', (event, id) => executions.get(`${event.sender.id}:${id}`)?.kill());
  ipcMain.handle('ffmpeg:execNative', (event, args, options = {}) => new Promise(resolve => {
    if (!Array.isArray(args) || !args.every(x => typeof x === 'string')) return resolve({exitCode:1,logs:['Invalid FFmpeg arguments']});
    const key = `${event.sender.id}:${options.id || Date.now()}`;
    const logs = []; let length = 0, finished = false;
    const child = spawn(binary(),['-nostdin',...args],{stdio:['ignore','pipe','pipe'],windowsHide:true});
    executions.set(key,child);
    const timer = setTimeout(() => { logs.push('FFmpeg timed out. Retry with a shorter clip.'); child.kill(); },Math.min(Math.max(options.timeout || 300000,1000),1800000));
    const end = code => { if (finished) return; finished = true; clearTimeout(timer); executions.delete(key); resolve({exitCode:code ?? 1,logs}); };
    const data = chunk => {
      const text = chunk.toString(); logs.push(text); length += text.length;
      while (length > 128*1024 && logs.length > 1) length -= logs.shift().length;
      const frame = text.match(/frame=\s*(\d+)/), fps = text.match(/fps=\s*([\d.]+)/), time = text.match(/time=(\d+:\d+:\d+\.\d+)/);
      if ((frame || time) && !event.sender.isDestroyed()) event.sender.send('ffmpeg:exec-progress',{frame:frame ? +frame[1] : null,fps:fps ? +fps[1] : null,time:time?.[1] || null});
    };
    child.stdout.on('data',data); child.stderr.on('data',data);
    child.on('error',error => { logs.push(error.message); end(1); }); child.on('close',end);
  }));
  app.on('before-quit',() => { for (const child of executions.values()) child.kill(); });
}
module.exports = {register, downloadURL, extractBinary};
