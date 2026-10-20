import { getMediaRuntime } from './media';
import { processImage, cancelProcessing } from './engine';
import { isTauri, saveBlob } from './native';
import type { Project } from './types';

export interface VideoClip {
  url: string;
  name: string;
  metadata: { width: number; height: number; duration: number; frameRate: number; frameCount: number; hasAudio: boolean; format: string };
  frames: Array<{ index: number; timestamp: number; imageData: ImageData }>;
  audioBuffer: ArrayBuffer | null;
  thumbnail: string;
}
export interface MediaProgress { phase: string; progress: number; message: string }

export async function importClip(file: File, signal: AbortSignal, progress: (p: MediaProgress) => void): Promise<VideoClip> {
  const runtime = await getMediaRuntime();
  const target = window as any;
  target.electron = { ...target.electron, ffmpeg: { getStatus: async () => ({ installed: false }) } };
  const cancel = () => { runtime.cancelMediaJobs(); cancelProcessing(); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    const clip = await runtime.importVideoFile(file, { extractAllFrames: true, maxDimension: 1920, signal }, progress);
    if (signal.aborted) { URL.revokeObjectURL(clip.url); signal.throwIfAborted(); }
    return clip;
  } finally { signal.removeEventListener('abort', cancel); }
}

export async function exportClip(clip: VideoClip, project: Project, quality: number, includeAudio: boolean, signal: AbortSignal, progress: (p: MediaProgress) => void) {
  const runtime = await getMediaRuntime();
  const bridgeUrl = new URL('./media/tauri-media-bridge.mjs', document.baseURI).href;
  const { installOriginalWasmMediaBridge } = await import(/* @vite-ignore */ bridgeUrl);
  let saved: Uint8Array<ArrayBuffer> | undefined;
  const filename = clip.name.replace(/\.[^.]+$/, '') + '-bitcrush.mp4';
  let bridge;
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { readFile, writeFile } = await import('@tauri-apps/plugin-fs');
    bridge = installOriginalWasmMediaBridge({ save, readFile, writeFile });
  } else {
    bridge = installOriginalWasmMediaBridge({ save: async () => filename, readFile: async () => { throw Error('No disk frames in this job'); }, writeFile: async (_path: string, bytes: Uint8Array) => { saved = new Uint8Array(bytes); } });
  }
  const cancel = () => { runtime.cancelMediaJobs(); cancelProcessing(); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    const path = await runtime.chooseVideoSavePath(filename);
    if (!path) return false;
    const frames = [];
    const canvas = document.createElement('canvas');
    for (let index = 0; index < clip.frames.length; index++) {
      signal.throwIfAborted();
      const frame = clip.frames[index];
      // Match original video processing: time is omitted unless animation supplies it.
      const pixels = await processImage(frame.imageData, project);
      signal.throwIfAborted();
      canvas.width = pixels.width; canvas.height = pixels.height;
      canvas.getContext('2d')!.putImageData(pixels, 0, 0);
      frames.push({ index, timestamp: frame.timestamp, dataUrl: canvas.toDataURL('image/png') });
      progress({ phase: 'processing', progress: (index + 1) / clip.frames.length * 50, message: `Processing frame ${index + 1} of ${clip.frames.length}` });
    }
    const result = await runtime.exportVideoFile(frames, clip.audioBuffer?.slice(0) ?? null, path, { frameRate: clip.metadata.frameRate, quality, includeAudio }, progress);
    signal.throwIfAborted();
    if (!result.success) throw Error(result.error || 'Video export failed');
    if (saved) await saveBlob(new Blob([saved], { type: 'video/mp4' }), filename);
    return true;
  } finally {
    signal.removeEventListener('abort', cancel);
    runtime.cancelMediaJobs();
    bridge.restore();
  }
}
