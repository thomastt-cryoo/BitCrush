'use strict';
const path=require('node:path');
const {app,BrowserWindow,ipcMain}=require('electron');
const {runSuite,writeReport,errorRecord}=require('./probe-runtime.cjs');
app.setPath('userData',path.join(__dirname,'.runtime-user-data',`${process.platform}-${process.arch}`));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{try{
 if(process.env.BITCRUSH_PROBE_MODE==='renderer'){
  const window=new BrowserWindow({show:false,width:100,height:100,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});
  ipcMain.once('probe:complete',(_event,report)=>{writeReport(report);app.exit(report.passed?0:1);});
  window.webContents.once('render-process-gone',(_event,details)=>{writeReport({passed:false,mode:'electron-renderer',error:{message:'Renderer process exited',details},platform:process.platform,architecture:process.arch,runtime:process.versions});app.exit(1);});
  await window.loadFile(path.join(__dirname,'probe-renderer.html'));
 }else{const report=await runSuite('electron-main');writeReport(report);app.exit(report.passed?0:1);}
 }catch(error){writeReport({passed:false,error:errorRecord(error),platform:process.platform,architecture:process.arch,runtime:process.versions});app.exit(1);}});
