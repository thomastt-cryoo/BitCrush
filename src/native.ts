import { isTauri, invoke } from '@tauri-apps/api/core';

export { isTauri, invoke };

export async function setWindowAppearance(appearance: 'dark' | 'light') {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().setTheme(appearance);
}

export async function chooseImage(): Promise<{ name: string; blob: Blob } | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({ multiple: false, filters: [{ name: 'Images and video', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'mp4', 'webm', 'mov', 'avi', 'mkv'] }] });
  if (typeof path !== 'string') return null;
  const { readFile } = await import('@tauri-apps/plugin-fs');
  const bytes = await readFile(path);
  return { name: path.split(/[\\/]/).at(-1)!, blob: new Blob([bytes]) };
}

export async function saveBlob(blob: Blob, name: string) {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const extension = name.split('.').at(-1)!;
    const path = await save({ defaultPath: name, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
    if (!path) return false;
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
