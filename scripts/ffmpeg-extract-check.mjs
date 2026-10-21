import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import AdmZip from 'adm-zip';
const require=createRequire(import.meta.url),{extractBinary}=require(process.env.BITCRUSH_TEST_APP_ROOT?path.resolve(process.env.BITCRUSH_TEST_APP_ROOT,'native-ffmpeg.cjs'):'../electron/native-ffmpeg.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bitcrush-extract-check-'));
const candidate=path.join(directory,'stage','candidate');
const archive=path.join(directory,'download.zip');
try{
  const bytes=Buffer.alloc(32*1024*1024,0x6a),zip=new AdmZip();
  zip.addFile('upstream/bin/ffmpeg.exe',bytes);zip.addFile('upstream/bin/ffprobe.exe',Buffer.from('do not extract'));
  zip.writeZip(archive);
  let ticks=0;const timer=setInterval(()=>ticks++,1);
  try{await extractBinary(archive,candidate,'ffmpeg.exe');}finally{clearInterval(timer);}
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex'),crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.ok(ticks>0,'Extraction blocked the caller event loop');
  assert.deepEqual(fs.readdirSync(path.dirname(candidate)),['candidate']);
  console.log(`PASS ZIP extraction preserves exact bytes and caller stays responsive (${ticks} timer ticks)`);
  const previous=fs.readFileSync(candidate);
  await assert.rejects(extractBinary(archive,candidate,'missing.exe'),/missing/);
  assert.deepEqual(fs.readFileSync(candidate),previous);
  console.log('PASS A missing executable leaves the existing candidate unchanged');
}finally{
  const resolved=path.resolve(directory),temporary=path.resolve(os.tmpdir());
  assert.equal(path.dirname(resolved),temporary);assert.ok(path.basename(resolved).startsWith('bitcrush-extract-check-'));
  fs.rmSync(resolved,{recursive:true,force:true});
}
