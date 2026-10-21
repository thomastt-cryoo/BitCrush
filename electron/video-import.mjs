// Media orchestration only. The original image/effect engines remain unchanged.
export async function videoFrameTask(task, label, timeout = 120000) {
  let timer;
  try { return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out. Retry the export or reopen the video.`)),timeout);})]); }
  finally { clearTimeout(timer); }
}
export function waitForVideoMetadata(video, url, signal, timeout = 15000) {
  return new Promise((resolve,reject) => {
    const done = error => { clearTimeout(timer); video.removeEventListener('loadedmetadata',loaded); video.removeEventListener('error',failed); signal?.removeEventListener('abort',aborted); error ? reject(error) : resolve(); };
    const loaded = () => done();
    const failed = () => done(new Error('This video could not be decoded. Try installing the Video Engine or choosing another file.'));
    const aborted = () => done(new DOMException('Video import canceled','AbortError'));
    const timer = setTimeout(() => done(new Error('Reading video metadata timed out. Try the Video Engine or another file.')),timeout);
    video.addEventListener('loadedmetadata',loaded); video.addEventListener('error',failed); signal?.addEventListener('abort',aborted,{once:true});
    if (signal?.aborted) return aborted();
    video.src = url; video.load();
  });
}
export async function importNativeVideo(file, options, onProgress, {fit, maxDimension, defaultFrameRate, minFrameRate, maxFrameRate}) {
  const api = window.electron, signal = options.signal;
  const progress = (phase,value,currentFrame,totalFrames,message) => onProgress?.({phase,progress:value,currentFrame,totalFrames,message});
  const url = URL.createObjectURL(file), directory = await api.ffmpeg.getTempDir();
  const input = `${directory}/input.${file.name.match(/\.(\w+)$/)?.[1] || 'mp4'}`;
  let keep = false, unsubscribe;
  const execute = async (args,timeout) => {
    if (signal?.aborted) throw new DOMException('Video import canceled','AbortError');
    const id = crypto.randomUUID(), cancel = () => api.ffmpeg.cancelNative(id);
    signal?.addEventListener('abort',cancel,{once:true});
    try { const result = await api.ffmpeg.execNative(args,{id,timeout}); if (signal?.aborted) throw new DOMException('Video import canceled','AbortError'); return result; }
    finally { signal?.removeEventListener('abort',cancel); }
  };
  try {
    progress('loading',1,0,0,'Reading video…');
    const write = await api.writeFileBinary(input,await file.arrayBuffer());
    if (!write.success) throw new Error(write.error || 'Could not stage the video');
    // Read headers only; do not decode the whole clip just to detect its frame rate.
    const probe = await execute(['-hide_banner','-i',input],15000), text = probe.logs.join('');
    const duration = text.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const video = text.split(/\r?\n/).find(line => /Stream .*Video:/.test(line));
    const dimensions = video?.match(/\b(\d{2,6})x(\d{2,6})\b/);
    if (!duration || !dimensions) throw new Error(`FFmpeg could not read this video's duration or dimensions.\n${text.slice(-1800)}`);
    const seconds = +duration[1]*3600 + +duration[2]*60 + +duration[3];
    if (!(seconds > 0)) throw new Error('The video has no valid duration');
    const frameRate = Math.max(minFrameRate,Math.min(maxFrameRate,+(video.match(/([\d.]+)\s*fps/)?.[1] || defaultFrameRate)));
    const {width,height,scaleFilter} = fit(+dimensions[1],+dimensions[2],options.maxDimension || maxDimension);
    let total = Math.ceil(seconds*frameRate);
    progress('extracting-frames',10,0,total,'Extracting frames…');
    unsubscribe = api.ffmpeg.onExecProgress(({frame}) => { if (frame != null) progress('extracting-frames',Math.round(10+Math.min(frame/total,1)*75),frame,total,`Extracting frames (${frame}/${total})`); });
    const args = ['-hide_banner','-y','-i',input,'-map','0:v:0','-an'];
    if (scaleFilter) args.push('-vf',scaleFilter);
    args.push('-fps_mode','passthrough',`${directory}/frame_%06d.png`);
    const extraction = await execute(args,1800000);
    unsubscribe(); unsubscribe = null;
    if (extraction.exitCode !== 0) throw new Error(`Native FFmpeg frame extraction failed (exit ${extraction.exitCode}).\n${extraction.logs.join('').slice(-2200)}`);
    const indexed = await api.ffmpeg.readFramesDir(directory);
    if (!indexed.success || !indexed.paths.length) throw new Error(indexed.error || 'FFmpeg did not extract any video frames');
    total = indexed.paths.length;
    const frames = indexed.paths.map((filePath,index) => ({index,timestamp:index/frameRate,filePath}));
    let audioBuffer = null;
    const hasAudio = /Stream .*Audio:/.test(text);
    if (hasAudio) {
      progress('extracting-audio',90,total,total,'Extracting audio…');
      const audio = `${directory}/audio.webm`;
      const result = await execute(['-hide_banner','-y','-i',input,'-map','0:a:0','-vn','-c:a','libopus','-f','webm',audio],300000);
      if (result.exitCode !== 0) throw new Error(`FFmpeg could not extract the audio.\n${result.logs.join('').slice(-1800)}`);
      const read = await api.readFile(audio);
      if (!read.success) throw new Error(read.error || 'Could not read extracted audio');
      const bytes = new Uint8Array(read.data); audioBuffer = bytes.buffer;
    }
    keep = true;
    progress('complete',100,total,total,'Video imported');
    return {url,name:file.name,metadata:{width,height,duration:seconds,frameRate,frameCount:total,hasAudio,format:file.type || 'video/mp4'},frames,audioBuffer,thumbnail:null,nativeTempDir:directory};
  } finally {
    unsubscribe?.();
    if (!keep) { URL.revokeObjectURL(url); await api.ffmpeg.cleanupTempDir(directory); }
  }
}
