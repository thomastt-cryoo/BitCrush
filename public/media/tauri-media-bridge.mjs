/** New host adapter, separate from the unchanged original media functions.
 * Inject @tauri-apps/plugin-dialog save and @tauri-apps/plugin-fs readFile/writeFile.
 * Native FFmpeg intentionally reports absent so the bundled original Wasm is used.
 */
export function installOriginalWasmMediaBridge({save,readFile,writeFile},target=window){
 if(typeof save!=='function'||typeof readFile!=='function'||typeof writeFile!=='function')throw new TypeError('A save/readFile/writeFile host adapter is required');
 const previous=target.electron;
 const bridge={
  ...previous,
  ffmpeg:{getStatus:async()=>({installed:false,path:null,version:null})},
  showSaveDialog:async options=>{
   const filePath=await save({defaultPath:options?.defaultPath,filters:options?.filters});
   return{canceled:!filePath,filePath:filePath||undefined};
  },
  readFile:async filePath=>{
   try{return{success:true,data:await readFile(filePath)};}
   catch(error){return{success:false,error:String(error?.message||error)};}
  },
  writeFileBinary:async(filePath,input)=>{
   try{
    const bytes=input instanceof ArrayBuffer?new Uint8Array(input):ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):null;
    if(!bytes)throw new TypeError('Original media output must be an ArrayBuffer or byte view');
    await writeFile(filePath,bytes);
    return{success:true};
   }catch(error){return{success:false,error:String(error?.message||error)};}
  }
 };
 target.electron=bridge;
 return{bridge,restore:()=>{if(target.electron===bridge)target.electron=previous;}};
}

/** Browser File objects are what the unchanged importer accepts.
 * Tauri file dialogs return paths; convert through scoped binary readFile.
 */
export async function fileFromSelectedPath(filePath,readFile,mimeType='video/mp4'){
 const bytes=await readFile(filePath);
 const name=filePath.replace(/\\/g,'/').split('/').pop()||'input.mp4';
 return new File([bytes],name,{type:mimeType});
}
