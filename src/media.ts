import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';

let setup: Promise<any> | undefined;
export function getMediaRuntime() {
  return setup ??= (async () => {
    const base = new URL('./media/', document.baseURI);
    const moduleUrl = new URL('video-workflows-original.mjs', base).href;
    const runtime = await import(/* @vite-ignore */ moduleUrl);
    let wasmURL = new URL('ffmpeg-core.wasm', base).href;
    let coreURL = new URL('ffmpeg-core-CI9Irx9p.js', base).href;
    if (isTauri()) {
      const resource = convertFileSrc(await invoke<string>('media_runtime_path'));
      // Fetch native schemes in the owning WebView, then give the module worker
      // ordinary Blob URLs, as the original media loader does.
      const response = await fetch(resource);
      if (!response.ok) throw Error('The bundled offline media runtime could not be read');
      wasmURL = URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: 'application/wasm' }));
      const script = await fetch(coreURL);
      if (!script.ok) throw Error('The bundled media loader could not be read');
      coreURL = URL.createObjectURL(new Blob([await script.text()], { type: 'text/javascript' }));
    }
    runtime.configureMediaRuntime({ coreURL, wasmURL });
    return runtime;
  })();
}

export async function verifyMediaRuntime(onProgress?: (phase: string) => void) {
  (window as any).__bitcrushSmokeProgress = onProgress;
  onProgress?.('Loading local media modules and resource');
  await getMediaRuntime();
  const url = new URL('./media/smoke.mjs', document.baseURI).href;
  const { runMediaProof } = await import(/* @vite-ignore */ url);
  return runMediaProof();
}
