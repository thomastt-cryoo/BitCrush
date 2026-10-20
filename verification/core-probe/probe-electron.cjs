'use strict';
const path=require('node:path');
const {app,BrowserWindow,ipcMain}=require('electron');
const {runSuite,writeReport,errorRecord}=require('./probe-runtime.cjs');
app.setPath('userData',path.join(__dirname,'.runtime-user-data',`${process.platform}-${process.arch}`));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{try{
 if(process.env.BITCRUSH_PROBE_MODE==='renderer'){
  const window=new BrowserWindow({show:false,width:100,height:100,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});
  const completed=new Promise(resolve=>ipcMain.once('probe:complete',(_event,report)=>resolve(report)));
  const onGone=(_event,details)=>{writeReport({passed:false,mode:'electron-renderer',error:{message:'Renderer process exited',details},platform:process.platform,architecture:process.arch,runtime:process.versions});app.exit(1);};
  window.webContents.once('render-process-gone',onGone);
  await window.loadFile(path.join(__dirname,'probe-renderer.html'));
  // A fast suite can finish before loadFile resolves. Exit only after both finish,
  // so closing the window cannot reject navigation and overwrite a valid report.
  const report=await completed;
  window.webContents.removeListener('render-process-gone',onGone);
  writeReport(report);app.exit(report.passed?0:1);
 }else{const report=await runSuite('electron-main');writeReport(report);app.exit(report.passed?0:1);}
 }catch(error){writeReport({passed:false,error:errorRecord(error),platform:process.platform,architecture:process.arch,runtime:process.versions});app.exit(1);}});
