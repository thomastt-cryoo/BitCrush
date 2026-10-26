import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {electronExecutable} from './electron-runtime.mjs';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
const require=createRequire(import.meta.url), {downloadURL}=require('../electron/native-ffmpeg.cjs');
const root=path.resolve(import.meta.dirname,'..');
const env={...process.env,BITCRUSH_USER_DATA:fs.mkdtempSync(path.join(os.tmpdir(),'bitcrush-video-check-'))};delete env.ELECTRON_RUN_AS_NODE;
const binaryName=process.platform==='win32'?'ffmpeg.exe':'ffmpeg';
const cacheFile=process.env.BITCRUSH_TEST_FFMPEG_CACHE?path.resolve(process.env.BITCRUSH_TEST_FFMPEG_CACHE,binaryName):null;
const existingBinary=process.env.BITCRUSH_TEST_FFMPEG||(cacheFile&&fs.existsSync(cacheFile)?cacheFile:null);
if(!existingBinary&&process.env.BITCRUSH_TEST_INSTALL_FFMPEG!=='1')throw new Error('Native video checks require BITCRUSH_TEST_FFMPEG or a verified cache. A single fresh install requires explicit BITCRUSH_TEST_INSTALL_FFMPEG=1.');
if(existingBinary){const directory=path.join(env.BITCRUSH_USER_DATA,'ffmpeg');fs.mkdirSync(directory);fs.copyFileSync(existingBinary,path.join(directory,binaryName));fs.chmodSync(path.join(directory,binaryName),0o755);}
const app=await electron.launch({executablePath:process.env.BITCRUSH_PACKAGED_EXECUTABLE||electronExecutable(),args:process.env.BITCRUSH_PACKAGED_EXECUTABLE?[]:[path.resolve(process.env.BITCRUSH_TEST_APP_ROOT||path.join(root,'dist/electron'))],env});
const report={platform:process.platform,arch:process.arch,packaged:!!process.env.BITCRUSH_PACKAGED_EXECUTABLE,installation:existingBinary?'reused-verified-binary':'single-fresh-install',checks:[],errors:[]};
const check=(name,details={})=>{report.checks.push({name,passed:true,...details});console.log('PASS '+name);};
let page;
try{
  page=await app.firstWindow();page.on('pageerror',error=>report.errors.push(error.stack));
  await page.evaluate(()=>Object.defineProperty(navigator,'hardwareConcurrency',{configurable:true,get:()=>64}));
  page.on('console',message=>{if(message.type()==='error')console.log('Renderer: '+message.text());});
  await page.evaluate(()=>{window.alert=message=>console.error('Alert: '+message);});
  page.on('dialog',async dialog=>{console.log('Dialog: '+dialog.message());report.dialogs??=[];report.dialogs.push(dialog.message());await dialog.dismiss();});
  await expect(page.locator('.studio-style')).toHaveCount(73);
  await expect(page.locator('.studio-style .studio-pattern,.studio-style img')).toHaveCount(0);
  if(!downloadURL('darwin','arm64').includes('arm')||downloadURL('darwin','arm64')===downloadURL('darwin','x64'))throw new Error('Mac architecture download mismatch');
  check('All 73 styles use text only; Mac download architecture is explicit');
  if(!existingBinary){
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'Install',exact:true}).click();
    await expect(page.locator('.ffmpeg-modal-title')).toHaveText('Video Engine');
    await expect(page.locator('.ffmpeg-modal-title svg,.ffmpeg-modal-title img')).toHaveCount(0);
    await expect.poll(()=>page.locator('.ffmpeg-modal-result').innerText().catch(()=>''),{timeout:390000}).toMatch(/FFmpeg installed successfully[.]|Installation failed/);
    await expect(page.locator('.ffmpeg-modal-result')).toContainText('FFmpeg installed successfully.');
    await page.getByRole('button',{name:'Done',exact:true}).click();
    await page.getByRole('button',{name:'Close settings (ESC)',exact:true}).click();
  }
  const status=await page.evaluate(()=>window.electron.ffmpeg.getStatus());
  if(!status.installed)throw new Error('Downloaded binary is not runnable');
  const binarySha=crypto.createHash('sha256').update(fs.readFileSync(status.path)).digest('hex');
  if(cacheFile&&!existingBinary){fs.mkdirSync(path.dirname(cacheFile),{recursive:true});fs.copyFileSync(status.path,cacheFile);fs.chmodSync(cacheFile,0o755);}
  check(existingBinary?'Reused verified native FFmpeg without downloading':'Single native FFmpeg download, extraction and runtime verification',{version:status.version,sha256:binarySha});
  await app.evaluate(({ipcMain},results)=>{
    const fs=process.mainModule.require('node:fs'),path=process.mainModule.require('node:path');
    let capturedImport=false;const read=ipcMain._invokeHandlers.get('ffmpeg:readFramesDir'),write=ipcMain._invokeHandlers.get('write-file-binary');
    ipcMain.removeHandler('ffmpeg:readFramesDir');ipcMain.handle('ffmpeg:readFramesDir',async(event,...args)=>{const value=await read(event,...args);if(value.paths?.length&&!capturedImport){fs.copyFileSync(value.paths[0],path.join(results,'native-import-first.png'));capturedImport=true;}return value;});
    ipcMain.removeHandler('write-file-binary');ipcMain.handle('write-file-binary',async(event,file,data)=>{if(/[\\/]frame_000000\.png$/.test(file)){const bytes=ArrayBuffer.isView(data)?Buffer.from(data.buffer,data.byteOffset,data.byteLength):Buffer.from(data);fs.writeFileSync(path.join(results,'native-rendered-first.png'),bytes);}return write(event,file,data);});
  },path.join(root,'test-results'));
  const importFile=page.locator('input[aria-label="Import image or video file"]');
  await importFile.setInputFiles(path.join(root,'tests/fixtures/one-second.mp4'));
  const palettePrompt=page.getByRole('button',{name:'No',exact:true});
  await palettePrompt.click();
  await expect(page.getByRole('button',{name:'Next frame',exact:true})).toBeVisible({timeout:150000});
  await expect(page.getByText('Importing Video',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Next frame',exact:true}).click();
  const frames=await page.evaluate(async()=>{const result=await window.electron.ffmpeg.execNative(['-hide_banner','-f','lavfi','-i','testsrc=size=64x48:rate=12','-t','0.25','-fps_mode','passthrough','-f','null','-']);return result;});
  if(frames.exitCode!==0)throw new Error(frames.logs.join(''));
  check('Native video import and scrubbing with current FFmpeg; replacement frame-sync option runs');
  const exportDir=path.join(env.BITCRUSH_USER_DATA,'exports');fs.mkdirSync(exportDir);
  await app.evaluate(({ipcMain},directory)=>{ipcMain.removeHandler('show-save-dialog');ipcMain.handle('show-save-dialog',()=>({canceled:false,filePath:directory+'/native.mp4'}));},exportDir);
  await expect(page.getByRole('button',{name:'Export',exact:true})).toBeEnabled();
  const mediaWindow=await app.browserWindow(page);await mediaWindow.evaluate(win=>win.hide());
  // Exercise the real button callback without depending on OS input focus after a long download.
  await page.getByRole('button',{name:'Export',exact:true}).dispatchEvent('click');
  await expect.poll(()=>fs.existsSync(path.join(exportDir,'native.mp4'))?fs.statSync(path.join(exportDir,'native.mp4')).size:0,{timeout:150000}).toBeGreaterThan(1000);
  await expect(page.getByRole('button',{name:'Export',exact:true})).toBeEnabled({timeout:150000});
  await mediaWindow.evaluate(win=>win.show());
  const probe=await page.evaluate(async file=>window.electron.ffmpeg.execNative(['-hide_banner','-i',file]),path.join(exportDir,'native.mp4'));
  fs.copyFileSync(path.join(exportDir,'native.mp4'),path.join(root,'test-results/native-export.mp4'));
  if(!/Video: h264/.test(probe.logs.join(' '))||!/Audio: aac/.test(probe.logs.join(' ')))throw new Error('Native export lacks video or audio');
  const visibleVideo=page.locator('.studio-canvas video');
  await expect(visibleVideo).toHaveCSS('opacity','1');
  const coloredPixels=await page.evaluate(async file=>{
    const count=video=>{const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;if(!canvas.width||!canvas.height)return 0;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(video,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let colors=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]&&Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>20)colors++;return colors;};
    const preview=document.querySelector('.studio-canvas video');
    const read=await window.electron.readFile(file);if(!read.success)throw new Error(read.error);
    const url=URL.createObjectURL(new Blob([read.data],{type:'video/mp4'})),video=document.createElement('video');video.muted=true;
    // loadeddata alone can precede Chromium presenting the decoded frame.
    // Use a real rendered video and wait for presentation before reading pixels.
    video.style.cssText='position:fixed;bottom:0;right:0;width:160px;height:96px;z-index:99999';document.body.append(video);
    let presentationTimer;
    try{
      const presented=new Promise((resolve,reject)=>{presentationTimer=setTimeout(()=>reject(new Error('Exported video did not present a frame')),15000);video.requestVideoFrameCallback((_,frame)=>{clearTimeout(presentationTimer);resolve(frame.mediaTime);});});
      video.src=url;await video.play();const firstFrameTime=await presented;video.pause();
      const result={preview:count(preview),exported:count(video),firstFrameTime,duration:video.duration};
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Exported video seek timed out')),15000);video.onseeked=()=>{clearTimeout(timer);resolve();};video.currentTime=video.duration/2;});
      result.exportedMiddle=count(video);return result;
    }finally{clearTimeout(presentationTimer);video.pause();video.removeAttribute('src');video.load();video.remove();URL.revokeObjectURL(url);}
  },path.join(exportDir,'native.mp4'));
  if(coloredPixels.preview<1000||coloredPixels.exported<1000||coloredPixels.exportedMiddle<1000)throw new Error('Blank or monochrome native preview/export: '+JSON.stringify(coloredPixels));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  check('Native MP4 retains colored pixels, audio and visible Original preview after hidden export',{coloredPixels});
  await page.screenshot({path:path.join(root,'test-results/electron-video-native.png')});
  // Exercise fast extraction beyond the previous MediaRecorder 60-second cutoff.
  const longPath=path.join(env.BITCRUSH_USER_DATA,'long-silent.mp4');
  const long=await page.evaluate(async file=>window.electron.ffmpeg.execNative(['-hide_banner','-y','-f','lavfi','-i','color=size=64x48:rate=2','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','66','-c:v','libx264','-c:a','aac',file]),longPath);
  if(long.exitCode!==0)throw new Error(long.logs.join(''));
  const longResult=await page.evaluate(async filePath=>{
    const {importNativeVideo}=await import('../video-import.mjs');
    const read=await window.electron.readFile(filePath);
    const file=new File([read.data],'long.mp4',{type:'video/mp4'});
    const result=await importNativeVideo(file,{},()=>{},{fit:(width,height)=>({width,height}),maxDimension:2048,defaultFrameRate:24,minFrameRate:1,maxFrameRate:60});
    const audioPath=result.nativeTempDir+'/audio.webm';
    const probe=await window.electron.ffmpeg.execNative(['-hide_banner','-i',audioPath]);
    const summary={frames:result.frames.length,duration:result.metadata.duration,audioBytes:result.audioBuffer.byteLength,audioLog:probe.logs.join('')};
    await window.electron.ffmpeg.cleanupTempDir(result.nativeTempDir);URL.revokeObjectURL(result.url);return summary;
  },longPath);
  if(longResult.frames!==132||longResult.duration<65||!/Duration: 00:01:06/.test(longResult.audioLog))throw new Error('Long video/audio was truncated: '+JSON.stringify(longResult));
  check('66-second native import extracts every frame and complete audio',{frames:longResult.frames,duration:longResult.duration,audioBytes:longResult.audioBytes});
  await importFile.setInputFiles({name:'broken.mp4',mimeType:'video/mp4',buffer:Buffer.from('invalid video')});
  // Palette dialogs are optional for invalid media; dismiss if the renderer requests one.
  await palettePrompt.click({timeout:2000}).catch(()=>{});
  await expect(page.getByRole('alert')).toContainText('Could not import video',{timeout:30000});
  await expect(page.getByText('Importing Video',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Retry video import',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Could not import video',{timeout:30000});
  check('Invalid video exits loading and provides a working retry');
  await page.screenshot({path:path.join(root,'test-results/electron-video-recovery.png')});
  await importFile.setInputFiles({name:'broken.mp4',mimeType:'video/mp4',buffer:fs.readFileSync(path.join(root,'tests/fixtures/one-second.mp4'))});
  await palettePrompt.click({timeout:2000}).catch(()=>{});
  await expect(page.getByRole('button',{name:'Next frame',exact:true})).toBeVisible({timeout:150000});
  await expect(page.getByRole('alert')).toHaveCount(0);
  check('A valid replacement with the same filename imports after failure');
  if(report.errors.length)throw new Error(report.errors.join('\n'));
  report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;console.error(error);await page?.screenshot({path:path.join(root,'test-results/electron-video-failure.png')}).catch(()=>{});process.exitCode=1;}
finally{fs.mkdirSync('test-results',{recursive:true});const json=JSON.stringify(report,null,2);fs.writeFileSync('test-results/electron-video.json',json);fs.writeFileSync(`test-results/electron-video-${report.packaged?'packaged':'source'}.json`,json);await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close();}

