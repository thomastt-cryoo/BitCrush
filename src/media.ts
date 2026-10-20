import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';

let setup: Promise<any> | undefined;
export function getMediaRuntime() {
  return setup ??= (async () => {
    const base = new URL('./media/', document.baseURI);
    const moduleUrl = new URL('video-workflows-original.mjs', base).href;
    const runtime = await import(/* @vite-ignore */ moduleUrl);
    const wasmURL = isTauri()
      ? convertFileSrc(await invoke<string>('media_runtime_path'))
      : new URL('ffmpeg-core.wasm', base).href;
    runtime.configureMediaRuntime({ coreURL: new URL('ffmpeg-core-CI9Irx9p.js', base).href, wasmURL });
    return runtime;
  })();
}

export async function verifyMediaRuntime() {
  await getMediaRuntime();
  const url = new URL('./media/smoke.mjs', document.baseURI).href;
  const { runMediaProof } = await import(/* @vite-ignore */ url);
  return runMediaProof();
}
