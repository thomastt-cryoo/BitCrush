import fs from 'node:fs';
import path from 'node:path';
import {parse} from '@babel/parser';
import crypto from 'node:crypto';
import {patchVideoImport} from './patch-video-import.mjs';
import {patchStudioMedia} from './patch-studio-media.mjs';
const provenance=JSON.parse(fs.readFileSync('electron/vendor/provenance.json','utf8'));
for(const file of provenance.files){const bytes=fs.readFileSync('electron/vendor/'+file.file.slice(5));if(crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('Reference asset changed: '+file.file);}
const output=process.env.BITCRUSH_BUILD_OUTPUT||'dist/electron';fs.mkdirSync(output,{recursive:true});
fs.cpSync('electron/vendor/renderer',output+'/renderer',{recursive:true});
for(const name of ['main.cjs','native-ffmpeg.cjs','ffmpeg-extract-worker.cjs','video-import.mjs','engine-worker.cjs','engine-renderer.cjs','engine-renderer.html','studio-shell.mjs','studio-components.mjs','studio-media.mjs','studio-media-viewport.mjs','studio.css','mp4.mjs'])fs.copyFileSync('electron/'+name,output+'/'+name);
const preload=fs.readFileSync('electron/vendor/preload.js','utf8');
const execAnchor='execNative:e=>n.ipcRenderer.invoke("ffmpeg:execNative",e)';
if(!preload.includes(execAnchor))throw new Error('Native FFmpeg preload anchor changed');
fs.writeFileSync(output+'/preload.cjs',preload.replace(execAnchor,'execNative:(e,r)=>n.ipcRenderer.invoke("ffmpeg:execNative",e,r),cancelNative:e=>n.ipcRenderer.invoke("ffmpeg:cancelNative",e)'));
fs.copyFileSync('icon.svg',output+'/renderer/brand.svg');
fs.copyFileSync('src/fonts/inter-latin-wght-normal.woff2',output+'/renderer/inter.woff2');
fs.copyFileSync('src/data/algorithms.json',output+'/algorithms.json');
fs.copyFileSync('branding/icon.png',output+'/icon.png');
fs.mkdirSync(output+'/engine',{recursive:true});
for(const name of ['index-aa597334.jsc','halftone-a3bff44b.jsc','metadata.json','manifest.json'])fs.copyFileSync('verification/core-probe/assets/'+name,output+'/engine/'+name);
fs.copyFileSync('node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',output+'/renderer/assets/ffmpeg-core-CgUfceKH.wasm');
const walk=(node,visit)=>{if(!node||typeof node!=='object')return;visit(node);for(const [key,value]of Object.entries(node)){if(['start','end','loc','extra'].includes(key))continue;if(Array.isArray(value))for(const child of value)walk(child,visit);else if(value&&typeof value==='object')walk(value,visit);}};
const apply=(source,edits)=>{edits.sort((a,b)=>b[0]-a[0]);let last=Infinity;for(const [start,end,text]of edits){if(end>last)throw new Error('Overlapping patch at '+start);source=source.slice(0,start)+text+source.slice(end);last=start;}return source;};
const property=(node,name)=>node?.properties?.find(p=>p.key?.name===name||p.key?.value===name)?.value;
// Preserve the original native dialogs, file operations, palettes, clipboard, and video IPC.
let main=fs.readFileSync('electron/vendor/main.js','utf8'),mainEdits=[];
const mainAST=parse(main,{sourceType:'script'});
for(const statement of mainAST.program.body){const text=main.slice(statement.start,statement.end);
 if((statement.type==='VariableDeclaration'&&text.includes('require("discord-rpc")'))||text.startsWith('o.protocol.registerSchemesAsPrivileged')||text.startsWith('o.app.whenReady()')||text.startsWith('o.app.on("window-all-closed"')) {mainEdits.push([statement.start,statement.end,'']);continue;}
 if(statement.type==='IfStatement'&&text.startsWith('if(o.app.isPackaged)for(let r of de)')){mainEdits.push([statement.start,statement.end,'']);continue;}
 if(/^o\.ipcMain\.(handle|on)\(/.test(text)) {const channel=statement.expression?.arguments?.[0]?.value;if(['ffmpeg:getStatus','ffmpeg:download','ffmpeg:uninstall','ffmpeg:execNative'].includes(channel)||channel==='allow-close'||channel==='cancel-close'||channel==='getHardwareId'||channel?.startsWith('license:')||channel==='licensing:fetch'||channel==='dither:process'||channel==='halftone:process')mainEdits.push([statement.start,statement.end,'']);}
 if(statement.type==='FunctionDeclaration'&&['pe','he','q','we','be'].includes(statement.id.name))mainEdits.push([statement.start,statement.end,'']);
 if(statement.type==='FunctionDeclaration'&&['F','N'].includes(statement.id.name))mainEdits.push([statement.body.start,statement.body.end,statement.id.name==='F'?'{return o.app.getPath("userData")}':'{return c.join(o.app.getPath("userData"),"palettes")}']);
}
main=apply(main,mainEdits)+'\nmodule.exports={attachWindow:win=>{f=win}};\n';
fs.writeFileSync(output+'/legacy-main.cjs',main);
let source=fs.readFileSync('electron/vendor/renderer/assets/index-Cc7ZI13O.js','utf8');
const ast=parse(source,{sourceType:'module'}),edits=[];let root,controls,settings,general,header;
walk(ast,node=>{if(node.type==='FunctionDeclaration'&&node.id?.name==='ny')root=node;
 if(node.type==='VariableDeclarator'){const id=node.id?.name;if(id==='f1')controls=node.init;if(id==='M1')settings=node.init;if(id==='L1')general=node.init;if(id==='rx')header=node.init;if(id==='so')edits.push([node.init.start,node.init.end,'{dark:Dv,light:Mv}']);
  if(id==='Ho'){const status=property(node.init.arguments[0].body,'isLicensed');if(!status)throw new Error('Offline status initialization anchor missing');edits.push([status.start,status.end,'true']);}
 }
});
if(!root||!controls||!settings||!general)throw new Error('Reference renderer structure changed');
// Keep the original session parser/input as a headless action adapter.
let sessionInput;
walk(header,node=>{if(node.type==='CallExpression'&&property(node.arguments[1],'title')?.value==='Timeline session JSON')sessionInput=node;});
if(!header||!sessionInput)throw new Error('Timeline session input anchor changed');
const headerReturn=header.body.body.findLast(x=>x.type==='ReturnStatement');
edits.push([headerReturn.argument.start,headerReturn.argument.end,source.slice(sessionInput.start,sessionInput.end)]);
const ret=root.body.body.findLast(x=>x.type==='ReturnStatement');
edits.push([ret.argument.start,ret.argument.end,`n.jsx(BitCrushStudio,{legacy:${source.slice(ret.argument.start,ret.argument.end)},media:v,animation:q,dimensions:S,registry:Tt,instances:Ee,order:vt,tab:T,onTab:Dn,onAddEffect:Wr,onRemoveEffect:Re,onMoveEffect:Ne,onDuplicateEffect:Xn,onRenameEffect:qe,onResetEffects:ee,onImport:Xr,onExport:Ln,format:yt,onFormat:Gt,svg:on,screens:Yt,exporting:Pt,processing:Fe,status:be,onSave:()=>window.dispatchEvent(new CustomEvent("request-save-preset")),libraryPreferences:Sh(),presetLibrary:n.jsx(F1,{ditherRegistry:Tt,allPalettes:Fn,palettesByCategory:nn,onLoadPreset:ar}),onLibrary:()=>{An("library");Rt(true)},onSettings:()=>{An("general");Rt(true)},onBatch:Mn,onAnimate:dr,onClear:()=>_n(null),onRotateLeft:Qn,onRotateRight:kn,onFlipH:Wn,onFlipV:Yn,onTheme:d,canUndo:De.canUndo,canRedo:De.canRedo,onUndo:()=>{Be.current=true;De.undo()},onRedo:()=>{Be.current=true;De.redo()}})`]);
// The original control state remains authoritative; the library selects through its existing setters.
const ctrlRet=controls.body.body.findLast(x=>x.type==='ReturnStatement');
edits.push([ctrlRet.start,ctrlRet.start,`const studioImportedFile=f.useRef(null);f.useEffect(()=>{if(s?.file&&s.file!==studioImportedFile.current){studioImportedFile.current=s.file;Te("basic");It("none");}},[s?.file]);f.useEffect(()=>{window.__bitcrushControls={style:ge,category:at,paletteId:Xt,paletteColors:Zn,palettes:ze,depth:an,selectStyle:(id,category)=>{si(category);ri(id)},selectOriginalColors:()=>{Te("basic");It("none")},selectPalette:p=>{if(ge==="none"){si("basic");ri("color-separation")}kt(p.category);Ae(p.id);ts(p.hexColors);Qt(p.hexColors.length)},setMode:mode=>si(mode==="halftone"?"halftone":"all")};window.dispatchEvent(new Event("bitcrush-editor-state"));},[ge,at,Xt,Zn,ze,an]);`]);
const adapters={'$x':'Primary',Gx:'Post',Vx:'Tint',Hx:'Glow',Wx:'Glitch',Zx:'Chromatic',Kx:'Temporal',Xx:'Pipeline',Jx:'Picker'};
walk(controls,node=>{if(node.type==='CallExpression'&&node.callee?.object?.name==='n'){const className=property(node.arguments[1],'className');if(className?.type==='StringLiteral'&&['controls-header','action-buttons-section'].includes(className.value))edits.push([node.start,node.end,'null']);else if(adapters[node.arguments[0]?.name])edits.push([node.arguments[0].start,node.arguments[0].end,'BitCrush'+adapters[node.arguments[0].name]]);}});
walk(settings,node=>{if(node.type==='CallExpression'&&node.callee?.object?.name==='n'){const props=node.arguments[1],title=property(props,'title');if(['About this app','Third-party licenses'].includes(title?.value))edits.push([node.start,node.end,'null']);}
 if(node.type==='LogicalExpression'&&node.left?.type==='BinaryExpression'&&['about','licenses'].includes(node.left.right?.value))edits.push([node.start,node.end,'null']);
 if(node.type==='StringLiteral'&&node.value==='about') { // defaults only; removed branches are already covered
  if(node.start<settings.body.start||source.slice(node.start-12,node.start).includes('useState('))edits.push([node.start,node.end,'"general"']);
 }
});
// Remove appearance galleries and social integration from preferences.
walk(general,node=>{if(node.type==='CallExpression'&&node.callee?.object?.name==='n'&&property(node.arguments[1],'className')?.value==='settings-section'){const text=source.slice(node.start,node.end);if(text.includes('"Themes"')||text.includes('"Discord Rich Presence"'))edits.push([node.start,node.end,'null']);}});
// Replace the remaining library and canvas chrome views while retaining their hooks.
walk(ast,node=>{if(node.type==='VariableDeclarator'&&['x1','I1','O1'].includes(node.id?.name)){
 const result=node.init.body.body.findLast(n=>n.type==='ReturnStatement');
 if(!result)throw new Error('Studio view adapter anchor missing: '+node.id.name);
 edits.push([result.argument.start,result.argument.end,`n.jsx(StudioViews.${node.id.name==='x1'?'Footer':node.id.name==='O1'?'SavePreset':'Presets'},{legacy:(${source.slice(result.argument.start,result.argument.end)})})`]);
}});
// Original animation images are replaced by the approved logo (no unused branding payload).
walk(ast,node=>{if(node.type==='StringLiteral'&&/\.(gif)$/.test(node.value)&&/branding|loading/.test(node.value))edits.push([node.start,node.end,'"../brand.svg"']);});
walk(root,node=>{if(node.type==='AssignmentExpression'&&source.slice(node.left.start,node.left.end)==='document.title')edits.push([node.right.start,node.right.end,'"BitCrush Studio"']);});
// Graph edits/preset loads must retain the media snapshot for transform undo.
let historyPatches=0;
walk(ast,node=>{if(node.type==='ArrowFunctionExpression'&&source.slice(node.body.start,node.body.start+26).startsWith('{if(J1(E,P.present))')){historyPatches++;edits.push([node.body.start+1,node.body.start+1,'E={mediaTransformUrl:P.present.mediaTransformUrl,mediaTransformWidth:P.present.mediaTransformWidth,mediaTransformHeight:P.present.mediaTransformHeight,...E};']);}});
if(historyPatches!==1)throw new Error('History snapshot anchor changed');
let encoderPatches=0;
walk(ast,node=>{if(node.type==='IfStatement'&&source.slice(node.test.start,node.test.end)==='M.byteLength<I'){encoderPatches++;edits.push([node.start,node.end,'if(!isValidMp4(M))throw new Error("Video encoder returned an invalid MP4 container");']);}});
if(encoderPatches!==1)throw new Error('MP4 validation anchor changed');
source=apply(source,edits);
source=patchVideoImport(source);
source=patchStudioMedia(source);
// A second pass wraps views whose nested controls were patched above.
const chromeEdits=[];
walk(parse(source,{sourceType:'module'}),node=>{if(node.type==='VariableDeclarator'&&['M1','L1','T1'].includes(node.id?.name)){
 const result=node.init.body.body.findLast(n=>n.type==='ReturnStatement');
 chromeEdits.push([result.argument.start,result.argument.end,`n.jsx(StudioViews.${node.id.name==='M1'?'Settings':'SettingsPane'},{legacy:(${source.slice(result.argument.start,result.argument.end)})})`]);
}});
source=apply(source,chromeEdits);
source=source.replaceAll('Dither Boy','BitCrush Studio').replaceAll('Dither_Boy','BitCrush');
source='import {createStudioShell} from "../../studio-shell.mjs";\nimport {createStudioComponents} from "../../studio-components.mjs";\nimport {isValidMp4} from "../../mp4.mjs";\n'+source;
const mount='Ag.createRoot(document.getElementById("root"))';if(!source.includes(mount))throw new Error('Missing mount');
const views=Object.entries(adapters).map(([original,view])=>`const BitCrush${view}=props=>n.jsx(StudioViews.${['Primary','Picker','Pipeline'].includes(view)?view:'Effect'},{...props,legacy:${original}(props)});`).join('');
source=source.replace(mount,'const StudioViews=createStudioComponents(f);const BitCrushStudio=createStudioShell(f,n,StudioViews);'+views+mount);
parse(source,{sourceType:'module'});
fs.writeFileSync(output+'/renderer/assets/index-Cc7ZI13O.js',source);
let html=fs.readFileSync(output+'/renderer/index.html','utf8').replace(/<title>[^<]*<\/title>/,'<title>BitCrush Studio</title>').replace('</head>','<link rel="stylesheet" href="../studio.css"></head>');
fs.writeFileSync(output+'/renderer/index.html',html);
fs.writeFileSync(output+'/package.json',JSON.stringify({name:'bitcrush',productName:'BitCrush',version:'0.2.0',main:'main.cjs'}));
for(const dependency of ['bytenode','adm-zip'])fs.cpSync('node_modules/'+dependency,output+'/node_modules/'+dependency,{recursive:true});
fs.copyFileSync('THIRD-PARTY-NOTICES.txt',output+'/THIRD-PARTY-NOTICES.txt');
fs.cpSync('verification/codec-source/licenses',output+'/notices/media',{recursive:true});
fs.writeFileSync(output+'/CODEC-SOURCES.txt',`The bundled FFmpeg WebAssembly core is the unchanged @ffmpeg/core 0.12.10 binary.\nOfficial release and pinned dependency sources are supplied by the ffmpeg-core-0.12.10-sources artifact:\nhttps://github.com/thomastt-cryoo/BitCrush/actions/runs/${process.env.GITHUB_RUN_ID||'39517388069'}\nSource acquisition manifests and verification: verification/codec-source in the BitCrush repository.\nRun python scripts/package-codec-sources.py to assemble the corresponding source corpus.\n`);
for(const file of ['main.cjs','legacy-main.cjs','native-ffmpeg.cjs','ffmpeg-extract-worker.cjs','video-import.mjs','engine-worker.cjs','engine-renderer.cjs','studio-shell.mjs','studio-components.mjs','studio-media.mjs','studio-media-viewport.mjs'])parse(fs.readFileSync(output+'/'+file,'utf8'),{sourceType:file.endsWith('.mjs')?'module':'script'});
console.log('Built BitCrush Electron workspace with the original renderer and exact engines.');
