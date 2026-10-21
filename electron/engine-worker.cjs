'use strict';
const {parentPort}=require('node:worker_threads');
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
globalThis.ImageData=class ImageData{constructor(data,width,height){if(typeof data==='number'){this.width=data;this.height=width;this.data=new Uint8ClampedArray(data*width*4);}else{this.data=data;this.width=width;this.height=height;}}};
const manifest=require('./engine/manifest.json');
for(const file of manifest.files){const bytes=fs.readFileSync(path.join(__dirname,'engine',file.name));if(crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('Engine integrity mismatch: '+file.name);}
require('bytenode');
const core=require('./engine/index-aa597334.jsc');
const halftone=require('./engine/halftone-a3bff44b.jsc');
parentPort.on('message',async({id,kind,payload})=>{try{
 const {width,height,buffer,params}=payload;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||buffer.byteLength!==width*height*4)throw new Error('Invalid image dimensions or RGBA buffer');
 const imageData=new ImageData(new Uint8ClampedArray(buffer),width,height);
 let result;
 if(kind==='dither'){
  const algorithm=core.getAlgorithmById(payload.algorithmId);if(!algorithm)throw new Error('Unknown algorithm: '+payload.algorithmId);
  result=await algorithm.process({imageData,outputCanvas:null,width,height},params);
 }else{
  const canvas={width,height};const ctx={canvas,getImageData:()=>imageData,putImageData:()=>{}};
  const output=await halftone.processHalftone({canvas,ctx,imageData,width,height},params);result=output.imageData;
 }
 if(!result||!ArrayBuffer.isView(result.data)||result.data.byteLength!==result.width*result.height*4)throw new Error('Engine returned invalid image data');
 const output=new Uint8ClampedArray(result.data).buffer;
 parentPort.postMessage({id,result:{width:result.width,height:result.height,buffer:output}},[output]);
}catch(error){parentPort.postMessage({id,error:error.stack||String(error)});}});
