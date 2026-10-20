'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const manifest=require('./assets/manifest.json');const metadata=require('./assets/metadata.json');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const errorRecord=error=>({name:error?.name||'Error',message:error?.message||String(error),stack:typeof error?.stack==='string'?error.stack.split('\n').slice(0,8):[]});
const exportsOf=module=>Object.fromEntries(Object.getOwnPropertyNames(module).map(key=>[key,typeof module[key]]));
if(typeof globalThis.ImageData==='undefined')globalThis.ImageData=class ImageData{constructor(data,width,height){if(typeof data==='number'){this.width=data;this.height=width;this.data=new Uint8ClampedArray(data*width*4);}else{this.data=data;this.width=width;this.height=height;}}};
function inputPixels(width=64,height=48){const bytes=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const k=(y*width+x)*4;bytes[k]=(x*7+y*11)%256;bytes[k+1]=(x*13+y*3)%256;bytes[k+2]=(x*5+y*17)%256;bytes[k+3]=255;}return bytes;}
function validateResult(data,width,height){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!ArrayBuffer.isView(data)||data.byteLength!==width*height*4)throw new Error('Engine returned invalid RGBA image data');return{width,height,bytes:data.byteLength,pixelSha256:sha(data),sample:Array.from(data.subarray(0,24))};}
async function runSuite(mode){
 const report={schemaVersion:1,kind:'original-bytecode-compatibility',mode,platform:process.platform,architecture:process.arch,runtime:process.versions,contextCapabilities:{ImageData:typeof ImageData,OffscreenCanvas:typeof OffscreenCanvas,document:typeof document,window:typeof window},originalArtifactSha256:manifest.sourceArtifactSha256,bytenodeVersion:require('bytenode/package.json').version,assetIntegrity:[],dither:{loaded:false,exports:null,algorithms:[]},halftone:{loaded:false,exports:null,cases:[]},limitations:['This probe loads unchanged original .jsc engines in stock Electron, not Tauri WebView.','A successful load/processing result is limited to the reported runtime, architecture, parameters and inputs.','Stochastic algorithms do not establish cross-run equality; process exit/crash is captured by the external runner.']};
 for(const entry of manifest.files){const actual=sha(fs.readFileSync(path.join(__dirname,'assets',entry.name)));const valid=actual===entry.sha256;report.assetIntegrity.push({name:entry.name,expected:entry.sha256,actual,valid});if(!valid)throw new Error(`Engine asset hash mismatch: ${entry.name}`);}
 require('bytenode');
 try{
  const core=require(path.join(__dirname,'assets','index-aa597334.jsc'));report.dither.loaded=true;report.dither.exports=exportsOf(core);
  if(typeof core.getAlgorithmById!=='function')throw new Error('Expected getAlgorithmById export is missing');
  for(const definition of metadata){const started=performance.now();const id=definition.metadata.id;try{
   const algorithm=core.getAlgorithmById(id);if(!algorithm||typeof algorithm.process!=='function')throw new Error(`Missing processor for ${id}`);
   const width=64,height=48;const pixels=inputPixels(width,height);const params={palette:['#000000','#ffffff'],orderedCycling:false,scale:45,luminanceThreshold:50,controls:Object.fromEntries((definition.controls||[]).map(c=>[c.id,c.defaultValue]))};
   const context={imageData:new globalThis.ImageData(pixels,width,height),outputCanvas:null,width,height};
   const result=await algorithm.process(context,params);const measured=validateResult(result.data,result.width,result.height);
   report.dither.algorithms.push({id,category:definition.metadata.category,deterministic:definition.features.isDeterministic,passed:true,milliseconds:Number((performance.now()-started).toFixed(2)),params,...measured});
  }catch(error){report.dither.algorithms.push({id,category:definition.metadata.category,passed:false,milliseconds:Number((performance.now()-started).toFixed(2)),error:errorRecord(error)});}}
 }catch(error){report.dither.error=errorRecord(error);}
 try{
  const halftone=require(path.join(__dirname,'assets','halftone-a3bff44b.jsc'));report.halftone.loaded=true;report.halftone.exports=exportsOf(halftone);
  if(typeof halftone.processHalftone!=='function')throw new Error('Expected processHalftone export is missing');
  const defaults={enabled:true,mode:'grayscale',cellSize:10,dotGain:.2,supersample:4,grayAngle:45,cyanAngle:15,magentaAngle:75,yellowAngle:0,blackAngle:45,gcr:1,usePhaseOffsets:true};
  for(const [name,overrides] of [['grayscale',{}],['cmyk',{mode:'cmyk',dotGain:.37,gcr:.7}],['cmyk-no-phase',{mode:'cmyk',dotGain:.17,gcr:.5,usePhaseOffsets:false}]]){const started=performance.now();try{
   const width=64,height=48;const imageData=new globalThis.ImageData(inputPixels(width,height),width,height);const canvas={width,height};const ctx={canvas,getImageData:()=>imageData,putImageData:()=>{}};const context={canvas,ctx,imageData,width,height};const params={...defaults,...overrides};
   const result=await halftone.processHalftone(context,params);const measured=validateResult(result.imageData.data,result.width,result.height);report.halftone.cases.push({name,passed:true,milliseconds:Number((performance.now()-started).toFixed(2)),params,...measured});
  }catch(error){report.halftone.cases.push({name,passed:false,error:errorRecord(error)});}}
 }catch(error){report.halftone.error=errorRecord(error);}
 report.summary={ditherLoaded:report.dither.loaded,ditherPassed:report.dither.algorithms.filter(x=>x.passed).length,ditherFailed:report.dither.algorithms.filter(x=>!x.passed).length,halftoneLoaded:report.halftone.loaded,halftonePassed:report.halftone.cases.filter(x=>x.passed).length,halftoneFailed:report.halftone.cases.filter(x=>!x.passed).length};
 report.passed=report.assetIntegrity.every(x=>x.valid)&&report.summary.ditherPassed===metadata.length&&report.summary.halftonePassed===3;
 return report;
}
function writeReport(report){const target=process.env.BITCRUSH_PROBE_REPORT||path.join(__dirname,'reports',`probe-${process.platform}-${process.arch}.json`);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2));console.log(JSON.stringify({report:target,passed:report.passed,summary:report.summary||report.error}));return target;}
module.exports={runSuite,writeReport,errorRecord};
if(require.main===module)runSuite('electron-run-as-node').then(report=>{writeReport(report);process.exitCode=report.passed?0:1;}).catch(error=>{writeReport({passed:false,error:errorRecord(error),platform:process.platform,architecture:process.arch,runtime:process.versions});process.exitCode=1;});
