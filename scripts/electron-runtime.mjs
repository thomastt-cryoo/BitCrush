import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export function electronExecutable(){
 if(process.env.BITCRUSH_ELECTRON)return path.resolve(process.env.BITCRUSH_ELECTRON);
 try{return require('electron');}catch{}
 const cached='C:/Users/mazin/Projects/dither-boy-redesign/reference/portability-analysis/core-probe/node_modules/electron/dist/electron.exe';
 if(fs.existsSync(cached))return cached;
 throw new Error('Electron 41.2.1 is missing. Run node node_modules/electron/install.js, or set BITCRUSH_ELECTRON to that runtime.');
}
