'use strict';
const {app,BrowserWindow,ipcMain,protocol,session,Menu,dialog}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {Worker}=require('node:worker_threads');
app.setName('BitCrush');
app.setPath('userData',process.env.BITCRUSH_USER_DATA||path.join(app.getPath('appData'),'BitCrush'));
protocol.registerSchemesAsPrivileged([{scheme:'app-frame',privileges:{standard:true,secure:true,supportFetchAPI:true,bypassCSP:true}}]);
const legacy=require('./legacy-main.cjs');
require('./native-ffmpeg.cjs').register({app,ipcMain});
let worker,sequence=0;const pending=new Map();
function getWorker(){if(worker)return worker;worker=new Worker(path.join(__dirname,'engine-worker.cjs'));
 worker.on('message',({id,result,error})=>{const entry=pending.get(id);if(!entry)return;clearTimeout(entry.timer);pending.delete(id);error?entry.reject(new Error(error)):entry.resolve(result);});
 const failed=error=>{worker=null;for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error);}pending.clear();};
 worker.on('error',failed);worker.on('exit',code=>{if(pending.size)failed(new Error('Processing worker exited: '+code));worker=null;});return worker;}
function processImage(kind,payload){return new Promise((resolve,reject)=>{const engine=getWorker(),id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Processing exceeded two minutes'));engine.terminate();},120000);pending.set(id,{resolve,reject,timer});engine.postMessage({id,kind,payload});});}
ipcMain.handle('dither:process',(_,payload)=>processImage('dither',payload));
// The original halftone module uses Chromium's OffscreenCanvas. Keep that exact
// implementation in an isolated, local renderer instead of emulating canvas in Node.
let canvasEngine,canvasReady;
function getCanvasEngine(){if(canvasReady)return canvasReady;
 canvasEngine=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});
 canvasEngine.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 canvasEngine.webContents.on('will-navigate',event=>event.preventDefault());
 canvasEngine.on('closed',()=>{canvasEngine=null;canvasReady=null;});
 canvasReady=canvasEngine.loadFile(path.join(__dirname,'engine-renderer.html'));return canvasReady;
}
ipcMain.handle('halftone:process',async(_,payload)=>{await getCanvasEngine();
 return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Halftone processing exceeded two minutes'));},120000);pending.set(id,{resolve,reject,timer});canvasEngine.webContents.send('engine:process',{id,payload});});
});
ipcMain.on('engine:result',(event,{id,result,error})=>{if(event.sender!==canvasEngine?.webContents)return;const entry=pending.get(id);if(!entry)return;clearTimeout(entry.timer);pending.delete(id);error?entry.reject(new Error(error)):entry.resolve(result);});
// Offline edition: renderer compatibility calls resolve locally; no activation module is shipped.
ipcMain.handle('license:getStatus',()=>({isLicensed:true,email:null,error:null}));
ipcMain.handle('license:periodicCheck',()=>({success:true}));
let win,allowClose=false,quitRequested=false;
ipcMain.on('allow-close',()=>{allowClose=true;win?.destroy();if(quitRequested)app.quit();});
ipcMain.on('cancel-close',()=>{quitRequested=false;});
function createWindow(){allowClose=false;win=new BrowserWindow({title:'BitCrush Studio',icon:path.join(__dirname,'icon.png'),width:1500,height:960,minWidth:1050,minHeight:700,backgroundColor:'#101113',show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 legacy.attachWindow(win);Menu.setApplicationMenu(process.platform==='darwin'?Menu.buildFromTemplate([{label:'BitCrush',submenu:[{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},{label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'Window',submenu:[{role:'minimize'},{role:'zoom'},{role:'front'}]}]):null);
 win.on('enter-full-screen',()=>win?.webContents.send('fullscreen-changed',true));
 win.on('leave-full-screen',()=>win?.webContents.send('fullscreen-changed',false));
 win.on('close',event=>{if(!allowClose){event.preventDefault();win.webContents.send('close-requested');}});
 win.on('closed',()=>{win=null;canvasEngine?.destroy();worker?.terminate();});
 win.webContents.on('render-process-gone',(_,details)=>dialog.showErrorBox('BitCrush workspace stopped',`The workspace process stopped (${details.reason}). Reopen BitCrush to continue.`));
 win.webContents.on('did-fail-load',(_,code,message)=>dialog.showErrorBox('BitCrush could not open',`${message} (${code})`));
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.once('ready-to-show',()=>win.show());win.loadFile(path.join(__dirname,'renderer/index.html'));return win;}
app.whenReady().then(()=>{session.defaultSession.setPermissionRequestHandler((_,__,callback)=>callback(false));
 protocol.handle('app-frame',async request=>{try{return new Response(await fs.promises.readFile(new URL(request.url).searchParams.get('p')),{headers:{'Content-Type':'image/png'}});}catch{return new Response('Not found',{status:404});}});
 createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
});
app.on('window-all-closed',()=>{worker?.terminate();if(process.platform!=='darwin')app.quit();});
app.on('before-quit',event=>{if(win&&!allowClose){event.preventDefault();quitRequested=true;win.close();return;}canvasEngine?.destroy();worker?.terminate();});
