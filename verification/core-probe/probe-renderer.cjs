'use strict';
const {ipcRenderer}=require('electron');
const {runSuite,errorRecord}=require('./probe-runtime.cjs');
runSuite('electron-renderer').then(report=>ipcRenderer.send('probe:complete',report)).catch(error=>ipcRenderer.send('probe:complete',{passed:false,error:errorRecord(error),platform:process.platform,architecture:process.arch,runtime:process.versions}));
