import {_electron as electron} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {electronExecutable} from './electron-runtime.mjs';
const executablePath=electronExecutable();
const env={...process.env,BITCRUSH_USER_DATA:path.resolve('test-results/electron-inspect-profile')};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath,args:['dist/electron'],env});
const errors=[];app.process().stderr.on('data',b=>process.stderr.write(b));
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.waitForTimeout(3000);
 console.log(JSON.stringify({title:await page.title(),layout:await page.locator('.studio-empty').evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),display:getComputedStyle(e).display,zIndex:getComputedStyle(e).zIndex,visibility:getComputedStyle(e).visibility})),text:(await page.locator('body').innerText()).slice(-3500),errors}));
 fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/electron-studio.png'});
}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close();}
