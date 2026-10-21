'use strict';
const {ipcRenderer}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const manifest=require('./engine/manifest.json');
for(const file of manifest.files){const bytes=fs.readFileSync(path.join(__dirname,'engine',file.name));if(crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('Engine integrity mismatch: '+file.name);}
require('bytenode');
const {processHalftone}=require('./engine/halftone-a3bff44b.jsc');
ipcRenderer.on('engine:process',async(_,{id,payload})=>{try{
 const {width,height,buffer,params}=payload;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||buffer.byteLength!==width*height*4)throw new Error('Invalid image dimensions or RGBA buffer');
 const imageData=new ImageData(new Uint8ClampedArray(buffer),width,height),canvas={width,height};
 const result=await processHalftone({canvas,ctx:{canvas,getImageData:()=>imageData,putImageData:()=>{}},imageData,width,height},params);
 ipcRenderer.send('engine:result',{id,result:{width:result.width,height:result.height,buffer:result.imageData.data.buffer}});
}catch(error){ipcRenderer.send('engine:result',{id,error:error.stack||String(error)});}});
