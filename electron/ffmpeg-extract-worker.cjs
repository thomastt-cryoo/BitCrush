'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs');
const path=require('node:path');
const AdmZip=require('adm-zip');
try {
  const {archive,candidate,binaryName}=workerData;
  const entry=new AdmZip(archive).getEntries().find(item=>!item.isDirectory&&path.posix.basename(item.entryName)===binaryName);
  if(!entry)throw new Error(`${binaryName} was missing from the downloaded archive`);
  fs.mkdirSync(path.dirname(candidate),{recursive:true});
  // Write just the selected executable to a fixed staging path. Never extract archive paths.
  fs.writeFileSync(candidate,entry.getData(),{mode:0o755});
  parentPort.postMessage({success:true});
}catch(error){parentPort.postMessage({success:false,error:error.message||String(error)});}
