import {parse} from '@babel/parser';
const walk=(node,visit)=>{if(!node||typeof node!=='object')return;visit(node);for(const [key,value]of Object.entries(node)){if(['start','end','loc','extra'].includes(key))continue;if(Array.isArray(value))value.forEach(n=>walk(n,visit));else if(value&&typeof value==='object')walk(value,visit);}};
export function patchVideoImport(source) {
  const edits=[], seen=new Set();
  const replace=(text,old,value)=>{if(!text.includes(old))throw new Error('Video import patch anchor changed: '+old.slice(0,100));return text.replace(old,value);};
  walk(parse(source,{sourceType:'module'}),node=>{
    const name=node.type==='FunctionDeclaration'?node.id?.name:node.type==='VariableDeclarator'?node.id?.name:null;
    if(!['b0','w0','Kp','Y0','Op','j0','Nv','eh','sp','C0'].includes(name))return;
    let text=source.slice(node.start,node.end);
    if(name==='b0')text='async function b0(s,o,a){return importNativeVideo(s,o,a,{fit:qp,maxDimension:fn.MAX_SAFE_IMPORT_DIMENSION,defaultFrameRate:fn.DEFAULT_FRAME_RATE,minFrameRate:fn.MIN_FRAME_RATE,maxFrameRate:fn.MAX_FRAME_RATE})}';
    if(name==='w0'){
      text=replace(text,'if(l?.ffmpeg&&(await l.ffmpeg.getStatus()).installed){const w=await b0(s,o,a);if(w)return w}','if(l?.ffmpeg&&(await l.ffmpeg.getStatus()).installed){try{const w=await b0(s,o,a);if(w)return w}catch(error){if(o.signal?.aborted||error.name==="AbortError")throw error;console.warn("Native video import failed; trying bundled codec:",error.message)}}');
      const metadata=[];
      walk(node,n=>{if(n.type==='AwaitExpression'&&source.slice(n.start,n.end).startsWith('await new Promise(')&&source.slice(n.start,n.end).includes('loadedmetadata'))metadata.push(source.slice(n.start,n.end));});
      if(metadata.length!==1)throw new Error('Video metadata anchor changed');
      text=replace(text,metadata[0],'await waitForVideoMetadata(y,g,o.signal)');
      text=replace(text,'let h=!1;','let h=!1,bitcrushExtractor;');
      text=replace(text,'const I=new wd;','const I=bitcrushExtractor=new wd;');
      text=replace(text,'await I.exec(A)','await I.exec(A,300000).then(code=>{if(code!==0)throw new Error("The bundled codec could not extract this video. Try installing the Video Engine or another file.")})');
      text=replace(text,'U.length!==L&&','!U.length&&(()=>{throw new Error("No video frames were found. Try another video or install the Video Engine.")})(),U.length!==L&&');
      text=replace(text,'finally{for(const b of p)','finally{bitcrushExtractor?.terminate();for(const b of p)');
    }
    if(name==='j0')text=replace(text,'["-i",l,"-f","null","-"]','["-i",l]');
    // A finalized native file supports ordinary edit lists and starts at zero.
    // Fragmented empty_moov output delays B-frame video behind its audio.
    if(name==='C0')text=replace(text,'v="frag_keyframe+empty_moov+default_base_moof"','v="+faststart"');
    if(name==='eh'){
      text=replace(text,'at=Math.min(dt,zt)','at=Math.min(dt,zt,fn.WORKER_POOL_SIZE)');
      text=replace(text,'const Xt=await sp(Qe);','const Xt=await videoFrameTask(sp(Qe),`Reading video frame ${ft+1}`);');
      text=replace(text,'await R.processFrame(ft,Xt,_t,kt?void 0:Ct,Pt,"normal",void 0,!!Qe.filePath)','await videoFrameTask(R.processFrame(ft,Xt,_t,kt?void 0:Ct,Pt,"normal",void 0,!!Qe.filePath),`Rendering video frame ${ft+1}`)');
      text=replace(text,'await he.writeFileBinary(Me,ze)','await videoFrameTask(he.writeFileBinary(Me,ze),`Saving video frame ${ft+1}`)');
    }
    if(name==='sp')text=text.replaceAll('c.getContext("2d")','c.getContext("2d",{willReadFrequently:true})');
    if(name==='Kp')text=`async function Kp(s,o,a){
      if(o?.aborted)throw new ls;
      const codec=new wd, abort=()=>codec.terminate();o?.addEventListener("abort",abort,{once:true});
      try{await codec.load({coreURL:await Uo(jd,"text/javascript"),wasmURL:await Uo(kd,"application/wasm")});
        if(o?.aborted)throw new ls;
        await codec.writeFile("input",new Uint8Array(await s.arrayBuffer()));
        const logs=[];codec.on("log",({message})=>logs.push(message));
        codec.on("progress",({progress})=>a?.(Math.min(100,Math.round(progress*100))));
        const code=await codec.exec(["-i","input","-vn","-c:a","libopus","-f","webm","audio.webm"],300000);
        if(o?.aborted)throw new ls;
        if(code!==0){if(logs.join(" ").includes("does not contain any stream"))return null;throw new Error("Could not extract video audio: "+logs.slice(-6).join("\\n"));}
        const bytes=await codec.readFile("audio.webm");a?.(100);return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
      }finally{o?.removeEventListener("abort",abort);codec.terminate();}
    }`;
    if(name==='Op')text=replace(text,'n.jsx(Vn,{size:18}),','');
    if(name==='Y0'){
      text=replace(text,'=>{const w=', '=>{const [bitcrushImportError,setBitcrushImportError]=f.useState(null);const w=');
      text=replace(text,'s.name!==g.current?(g.current=s.name,tt(s,','s!==g.current?(g.current=s,setBitcrushImportError(null),tt(s,');
      text=replace(text,'console.error("Import failed:",Ae),alert(`Failed to import video: ${Ae.message}`)','setBitcrushImportError(Ae.message||"Video import failed")');
      // Export fills the frame cache even in Original mode. Only hide the video
      // when the corresponding processed overlay is actually being displayed.
      text=replace(text,'videoData:se,processedFrameUrl:te,onVideoRef:$','videoData:se,processedFrameUrl:N?te:null,onVideoRef:$');
      text=replace(text,'!se||pe?n.jsx(',`bitcrushImportError?n.jsxs("div",{className:"video-viewport-loading-container",role:"alert",children:[n.jsx("h3",{children:"Could not import video"}),n.jsx("p",{className:"bc-video-error",children:bitcrushImportError}),n.jsx("button",{className:"bc-button",onClick:()=>{setBitcrushImportError(null);tt(s,{extractAllFrames:true}).then(()=>d?.()).catch(error=>setBitcrushImportError(error.message))},children:"Retry video import"}),n.jsx("button",{className:"bc-button",onClick:()=>h?.(),children:"Choose another file"})]}):!se||pe?n.jsx(`);
    }
    if(name==='Nv')text=replace(text,'n.jsx(J0,{videoFile:s.file,','n.jsx(J0,{onCancelImport:()=>o(null),videoFile:s.file,');
    seen.add(name);edits.push([node.start,node.end,text]);
  });
  if(seen.size!==10)throw new Error('Missing video adapters: '+[...seen].join(','));
  for(const [start,end,text]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);
  return 'import {importNativeVideo,waitForVideoMetadata,videoFrameTask} from "../../video-import.mjs";\n'+source;
}
