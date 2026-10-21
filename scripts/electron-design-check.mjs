import {_electron as electron,expect} from '@playwright/test';
import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const env={...process.env,BITCRUSH_USER_DATA:fs.mkdtempSync(path.join(os.tmpdir(),'bitcrush-design-'))};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:process.env.BITCRUSH_PACKAGED_EXECUTABLE||electronExecutable(),args:process.env.BITCRUSH_PACKAGED_EXECUTABLE?[]:[path.resolve('dist/electron')],env});
const errors=[];const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
await page.setViewportSize({width:1440,height:960});
await expect(page.locator('.studio-style')).toHaveCount(73);
await page.screenshot({path:'test-results/studio-new-empty.png'});
const fixture=await page.evaluate(()=>{
  const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 768;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 768); sky.addColorStop(0, '#5f5f5f'); sky.addColorStop(.6, '#e8e8e8'); sky.addColorStop(1, '#292929');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 768);
  ctx.fillStyle = '#f3f3f3'; ctx.beginPath(); ctx.arc(660, 238, 91, 0, Math.PI * 2); ctx.fill();
  for (let hill = 0; hill < 6; hill++) {
    const value = 126 - hill * 20; ctx.fillStyle = `rgb(${value},${value},${value})`;
    ctx.beginPath(); ctx.moveTo(0, 768);
    for (let x = 0; x <= 960; x += 2) ctx.lineTo(x, 420 + hill * 52 + Math.sin(x / (110 + hill * 14) + hill * 1.8) * (82 - hill * 6) + Math.sin(x / 43 + hill * 2) * 12);
    ctx.lineTo(960, 768); ctx.closePath(); ctx.fill();
  }
  return canvas.toDataURL('image/png').split(',')[1];});
await page.locator('input[aria-label="Import image or video file"]').setInputFiles({name:'Contour study.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});
await page.getByRole('button',{name:'Floyd-Steinberg',exact:true}).click();
await page.waitForTimeout(1500);
await expect(page.locator('.bc-section')).toHaveCount(4);
await expect(page.locator('.studio-controls .custom-select-trigger,.studio-controls .controls-sections')).toHaveCount(0);
await page.screenshot({path:'test-results/studio-new-dither.png'});
await page.getByRole('button',{name:'Halftone',exact:true}).click();await page.getByRole('button',{name:'Enter Halftone',exact:true}).click();
await page.waitForTimeout(1500);
await page.screenshot({path:'test-results/studio-new-halftone.png'});
await page.getByRole('button',{name:'Save preset',exact:true}).click();
await page.getByPlaceholder('Enter a name for this preset').fill('Contour study');
await page.screenshot({path:'test-results/studio-new-save.png'});
await page.getByRole('button',{name:'Close (ESC)',exact:true}).click();
await page.getByRole('button',{name:'Settings',exact:true}).click();
await expect(page.getByRole('dialog')).toBeVisible();
await expect(page.locator('.settings-modal .custom-select-trigger')).toHaveCount(0);
await page.getByRole('button',{name:'Export settings',exact:true}).click();
await page.getByRole('combobox',{name:'Default Format',exact:true}).selectOption('jpeg');
await expect(page.getByRole('slider',{name:'JPEG Quality',exact:true})).toBeVisible();
await page.getByRole('spinbutton',{name:'JPEG Quality value',exact:true}).fill('86');
await expect(page.getByRole('slider',{name:'JPEG Quality',exact:true})).toHaveValue('86');
await page.screenshot({path:'test-results/studio-new-settings.png'});
await page.getByRole('button',{name:'Close settings (ESC)',exact:true}).click();
await page.getByRole('button',{name:'Switch to light appearance',exact:true}).click();
await page.screenshot({path:'test-results/studio-new-light.png'});
if(errors.length)throw new Error(errors.join('\n'));
fs.writeFileSync('test-results/electron-design.json',JSON.stringify({passed:true,viewport:{width:1440,height:960},checks:['Grouped library and inspector','Original form widgets replaced','Dark and light workspace','Saved-look dialog','Settings export format and quality callbacks']},null,2));
console.log('PASS Studio visual states and settings controls');
}finally{await app.evaluate(({app})=>app.exit(0));await app.close();}
