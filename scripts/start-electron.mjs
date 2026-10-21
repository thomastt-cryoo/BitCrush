import {spawn} from 'node:child_process';
import {electronExecutable} from './electron-runtime.mjs';
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(electronExecutable(),['dist/electron'],{stdio:'inherit',env});
child.on('exit',code=>{process.exitCode=code||0;});
