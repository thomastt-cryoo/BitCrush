'use strict';
const fs=require('node:fs');const path=require('node:path');
const baseline=require('./assets/windows-baseline.json');
const directory=path.resolve(process.argv[2]||path.join(__dirname,'reports'));
const candidates=['renderer','main','node'].map(mode=>path.join(directory,`${mode}-${process.platform}-${process.arch}.json`)).filter(file=>fs.existsSync(file)).map(file=>({file,report:JSON.parse(fs.readFileSync(file,'utf8'))}));
const selected=candidates.find(x=>x.report.passed)||candidates.find(x=>x.report.dither?.loaded)||candidates[0];
const checks=[];
for(const expected of baseline.dither.filter(x=>x.deterministic)){
 const actual=selected?.report.dither?.algorithms?.find(x=>x.id===expected.id);
 checks.push({kind:'dither',id:expected.id,expected:expected.pixelSha256,actual:actual?.pixelSha256||null,passed:!!actual?.passed&&actual.pixelSha256===expected.pixelSha256,error:actual?.error?.message||null});
}
for(const expected of baseline.halftone){
 const actual=selected?.report.halftone?.cases?.find(x=>x.name===expected.name);
 checks.push({kind:'halftone',id:expected.name,expected:expected.pixelSha256,actual:actual?.pixelSha256||null,passed:!!actual?.passed&&actual.pixelSha256===expected.pixelSha256,error:actual?.error?.message||null});
}
const report={schemaVersion:1,platform:process.platform,architecture:process.arch,sourceMode:selected?.report.mode||null,passed:checks.every(x=>x.passed),checks,skipped:baseline.dither.filter(x=>!x.deterministic).map(x=>({id:x.id,reason:'Original metadata marks this algorithm non-deterministic; a valid-output processing check remains required.'})),scope:'Exact pixel SHA-256 comparison with Windows x64 baseline for72 deterministic original algorithms and3 compiled halftone cases. Limited to the recorded input/settings and stock Electron41.2.1.'};
fs.mkdirSync(directory,{recursive:true});const target=path.join(directory,`conformance-${process.platform}-${process.arch}.json`);fs.writeFileSync(target,JSON.stringify(report,null,2));console.log(JSON.stringify({report:target,passed:report.passed,checks:checks.length,failures:checks.filter(x=>!x.passed).map(x=>({kind:x.kind,id:x.id,error:x.error}))},null,2));process.exitCode=report.passed?0:1;
