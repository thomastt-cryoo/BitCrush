// One-time import from the preserved, authorized application copy. Downloads is never modified.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const input=process.argv[2];
if(!input) throw new Error('Pass the preserved resources/app.asar path');
const bytes=fs.readFileSync(input), digest=crypto.createHash('sha256').update(bytes).digest('hex');
if(digest!=='ff648aef8e28f383cc523213838d07b07c293f79186e5d0b3048f7c7549adb6a') throw new Error('Unexpected reference application');
const header=JSON.parse(bytes.subarray(16,16+bytes.readUInt32LE(12))), base=8+bytes.readUInt32LE(4);
const imported=[];
function walk(dir,prefix='') {for(const [name,item] of Object.entries(dir.files)){const file=prefix+name;if(item.files){walk(item,file+'/');continue;}
 if(!(['dist/main.js','dist/preload.js'].includes(file)||file.startsWith('dist/renderer/')))continue;
 if(item.unpacked||file.endsWith('.map')||file.endsWith('.wasm')||/\.(gif)$/i.test(file))continue;
 const content=bytes.subarray(base+Number(item.offset),base+Number(item.offset)+item.size);
 const hash=crypto.createHash('sha256').update(content).digest('hex');
 if(item.integrity?.hash&&hash!==item.integrity.hash)throw new Error('Integrity mismatch: '+file);
 const target=path.join('electron/vendor',file.slice(5));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);imported.push({file,bytes:content.length,sha256:hash});
}}
walk(header);fs.writeFileSync('electron/vendor/provenance.json',JSON.stringify({sourceArtifactSha256:digest,files:imported},null,2)+'\n');console.log(`Imported ${imported.length} verified files`);
