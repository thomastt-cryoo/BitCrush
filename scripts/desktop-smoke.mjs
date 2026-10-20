import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const executable = process.argv[2];
if (!executable) throw new Error('Pass the built native executable path.');
await mkdir('artifacts', { recursive: true });
const reportPath = resolve('artifacts/desktop-smoke.json');
const progressPath = resolve('artifacts/desktop-smoke.progress.json');
await rm(reportPath, { force: true });
await rm(progressPath, { force: true });
const child = spawn(resolve(executable), ['--smoke-test', reportPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
child.stdout.on('data', data => logs += data);
child.stderr.on('data', data => logs += data);
let timedOut = false;
const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 180000);
const result = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', (code, signal) => resolve({ code, signal })); });
clearTimeout(timer);
let report;
try { report = JSON.parse(await readFile(reportPath, 'utf8')); }
catch {
  const progress = await readFile(progressPath, 'utf8').catch(() => 'No checkpoint written');
  throw new Error(`Native app did not write its WebView test report. ${JSON.stringify({ ...result, timedOut })} Last checkpoint: ${progress} ${logs.slice(-3000)}`);
}
console.log(JSON.stringify(report, null, 2));
if (!report.webview?.passed) process.exitCode = 1;
