// Layout adapter only. The retained renderer owns processing, history and documents.
export function createStudioShell(React, jsx) {
  const {useState,useEffect}=React;
  const h=(type,props,...children)=>React.createElement(type,props,...children);
  const names={basic:'Essentials',ordered:'Ordered', 'error-diffusion':'Error diffusion',experimental:'Experimental',artistic:'Artistic'};
  const label=value=>names[value]||String(value).replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  function Button({children,title,onClick,disabled=false,primary=false}) {return h('button',{type:'button',title,'aria-label':title,onClick:event=>{onClick?.(event);event.currentTarget.closest('details')?.removeAttribute('open');},disabled,className:primary?'studio-button primary':'studio-button'},children);}
  function Studio(props) {
    const [section,setSection]=useState('Styles'),[query,setQuery]=useState(''),[category,setCategory]=useState('all');
    const [state,setState]=useState(window.__bitcrushControls),[algorithms,setAlgorithms]=useState([]);
    const [theme,setTheme]=useState(()=>localStorage.getItem('bitcrush-appearance')==='light'?'light':'dark');
    const [videoSize,setVideoSize]=useState(null);
    useEffect(()=>{setVideoSize(null);if(props.media?.type!=='video')return;const video=document.createElement('video');video.preload='metadata';video.onloadedmetadata=()=>setVideoSize({width:video.videoWidth,height:video.videoHeight});video.src=props.media.url;return()=>{video.onloadedmetadata=null;video.removeAttribute('src');video.load();};},[props.media?.url,props.media?.type]);
    useEffect(()=>{const update=()=>setState({...window.__bitcrushControls});window.addEventListener('bitcrush-editor-state',update);update();return()=>window.removeEventListener('bitcrush-editor-state',update);},[]);
    useEffect(()=>{fetch(new URL('./algorithms.json',import.meta.url)).then(r=>r.json()).then(setAlgorithms).catch(console.error);},[]);
    useEffect(()=>{props.onTheme(theme);document.documentElement.dataset.studioTheme=theme;localStorage.setItem('bitcrush-appearance',theme);document.title='BitCrush Studio';},[theme]);
    const children=props.legacy?.props?.children||[];
    const workspace=children[3]?.props?.children;
    const viewport=workspace?.[0]?.props?.children||[];
    const sidebar=workspace?.[2]?.props?.children||[];
    const originalHeader=viewport[0]?.props||{};
    const originalTabs=sidebar[0]?.props||{};
    const controls=sidebar[1]?.props?.children;
    const activeInstance=props.instances?.[props.tab];
    const selected=algorithms.find(a=>a.metadata.id===state?.style);
    const groups=[...new Set(algorithms.map(a=>a.metadata.category))];
    const visible=algorithms.filter(a=>(category==='all'||a.metadata.category===category)&&`${a.metadata.name} ${a.metadata.description}`.toLowerCase().includes(query.toLowerCase()));
    const palettes=(state?.palettes||[]).filter(p=>`${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase()));
    const chooseStyle=a=>{props.onTab('controls');state?.selectStyle(a.metadata.id,a.metadata.category);};
    const selectSection=next=>{setSection(next);setQuery('');if(next!=='Presets')props.onTab('controls');};
    const mode=state?.category==='halftone';
    const dimensions=props.media?.type==='video'?videoSize:props.dimensions;
    const disabled=!props.media||props.exporting;
    const extraMenuActions=[
      h(Button,{key:'import-session',title:'Import timeline session',onClick:()=>document.querySelector('[title="Timeline session JSON"]')?.click(),disabled:disabled||(!props.animation&&props.media?.type!=='video')},'Import session'),
      h(Button,{key:'export-session',title:'Export timeline session',onClick:()=>window.dispatchEvent(new CustomEvent('timeline-export-session-request')),disabled:disabled||(!props.animation&&props.media?.type!=='video')},'Export session'),
      h(Button,{key:'help',title:'Keyboard shortcuts',onClick:()=>window.dispatchEvent(new CustomEvent('open-help'))},'Keyboard shortcuts'),
      h(Button,{key:'refresh',title:'Refresh viewport',onClick:()=>window.dispatchEvent(new CustomEvent('refresh-viewport')),disabled},'Refresh viewport'),
      h(Button,{key:'fullscreen',title:'Toggle fullscreen',onClick:()=>window.electron.toggleFullscreen()},'Toggle fullscreen'),
      h(Button,{key:'center',title:'Center window',onClick:()=>window.electron.centerWindow()},'Center window')
    ];
    return h('div',{className:'bitcrush-studio'},
      h('header',{className:'studio-topbar'},
        h('a',{className:'studio-brand',href:'#',onClick:e=>e.preventDefault()},h('img',{src:'./brand.svg',alt:'BitCrush logo'}),h('strong',null,'BitCrush',h('span',null,'STUDIO'))),
        h('div',{className:'studio-document'},h('span',null,props.media?.name||'Untitled workspace'),h('small',null,props.media?'Your creative workspace':'An image. A few pixels. Endless possibilities.')),
        h('nav',{'aria-label':'Workspace actions'},
          h(Button,{title:'Undo',onClick:props.onUndo,disabled:!props.canUndo},'↶'),h(Button,{title:'Redo',onClick:props.onRedo,disabled:!props.canRedo},'↷'),
          h(Button,{title:theme==='dark'?'Switch to light appearance':'Switch to dark appearance',onClick:()=>setTheme(theme==='dark'?'light':'dark')},theme==='dark'?'☼':'☾'),
          h(Button,{title:'Settings',onClick:props.onSettings},'Settings'),
          h(Button,{title:'Import image or video',onClick:props.onImport,disabled:props.exporting},'＋ Import'),
          h(Button,{title:'Export',onClick:props.onExport,disabled,primary:true},props.exporting?'Exporting…':'Export ↗'))),
      h('aside',{className:'studio-library','aria-label':'Library'},
        h('div',{className:'studio-panel-heading'},h('h2',null,'Library'),h('span',null,'MAKE IT YOURS')),
        h('div',{className:'studio-library-tabs',role:'tablist','aria-label':'Library sections'},...['Styles','Palettes','Presets'].map(s=>h('button',{key:s,role:'tab','aria-selected':section===s,onClick:()=>selectSection(s)},s))),
        section!=='Presets'&&h('input',{className:'studio-search',type:'search',placeholder:`Search ${section.toLowerCase()}…`,'aria-label':`Search ${section.toLowerCase()}`,value:query,onChange:e=>setQuery(e.target.value)}),
        section==='Styles'&&h('select',{className:'studio-category','aria-label':'Style category',value:category,onChange:e=>setCategory(e.target.value)},h('option',{value:'all'},'All styles'),...groups.map(c=>h('option',{key:c,value:c},label(c)))),
        h('div',{className:'studio-library-scroll'},
          section==='Styles'&&h(React.Fragment,null,...visible.map((a,i)=>h('button',{key:a.metadata.id,className:`studio-style ${a.metadata.id===state?.style&&!mode?'selected':''}`,disabled:props.exporting,'aria-pressed':a.metadata.id===state?.style&&!mode,onClick:()=>chooseStyle(a)},h('span',{className:`studio-pattern pattern-${i%6}`}),h('span',null,a.metadata.name,h('small',null,label(a.metadata.category))),a.metadata.id===state?.style&&!mode&&h('span',{className:'studio-check'},'✓'))),visible.length===0&&h('p',{className:'studio-note'},'No styles match your search.')),
          section==='Palettes'&&h(React.Fragment,null,...palettes.map(p=>h('button',{key:p.id,className:`studio-palette ${p.id===state?.paletteId?'selected':''}`,disabled:props.exporting,onClick:()=>{props.onTab('controls');state?.selectPalette(p);}},h('span',{className:'studio-palette-colors'},...(p.hexColors||[]).map((c,i)=>h('i',{key:i,style:{background:c}}))),h('span',null,p.name,h('small',null,`${p.category} · ${p.hexColors?.length||0} colors`))))),
          section==='Presets'&&h('div',{className:'studio-presets'},props.presetLibrary)),
        h('div',{className:'studio-library-bottom'},h(Button,{title:'Save preset',onClick:props.onSave,disabled:!workspace},'＋ Save current preset'),h(Button,{title:'Manage presets and favorites',onClick:props.onLibrary},'Manage library'))),
      h('main',{className:'studio-workspace','aria-label':'Canvas workspace'},
        h('div',{className:'studio-canvas-toolbar'},h('span',null,'WORKSPACE',dimensions?.width>0&&dimensions?.height>0&&h('small',null,`${dimensions.width} × ${dimensions.height}`)),
          h('div',null,h(Button,{title:'Rotate left',onClick:props.onRotateLeft,disabled:disabled||props.media?.type==='video'},'↶'),h(Button,{title:'Rotate right',onClick:props.onRotateRight,disabled:disabled||props.media?.type==='video'},'↷'),h(Button,{title:'Flip horizontal',onClick:props.onFlipH,disabled:disabled||props.media?.type==='video'},'↔'),h(Button,{title:'Flip vertical',onClick:props.onFlipV,disabled:disabled||props.media?.type==='video'},'↕'),
          h('details',{className:'studio-more'},h('summary',null,'More ···'),h('div',{className:'studio-menu'},...extraMenuActions,h(Button,{title:'Batch export',onClick:props.onBatch,disabled},'Batch export'),h(Button,{title:'Animate image',onClick:props.onAnimate,disabled:disabled||props.media?.type==='video'||props.animation},'Animate image'),h(Button,{title:'Clear workspace',onClick:props.onClear,disabled},'Clear workspace'),...(originalHeader.recentFiles||[]).map((r,i)=>h(Button,{key:i,title:`Open recent ${r.name}`,onClick:()=>originalHeader.onOpenRecentFile?.(r.path,r.name,r.type)},r.name)))))),
        viewport[0],viewport[1],
        h('div',{className:`studio-canvas ${props.media?'has-media':''}`},viewport[3],!props.media&&h('div',{className:'studio-empty'},h('img',{src:'./brand.svg',alt:''}),h('small',null,'SMALL PIXELS. BIG POSSIBILITIES.'),h('h1',null,'Make something',h('br'),'beautifully pixelated.'),h('p',null,'Drop an image or video here, choose a style,',h('br'),'and make it your own.'),h(Button,{title:'Choose media',onClick:props.onImport,primary:true},'＋ Choose media'),h('span',null,'JPG · PNG · WEBP · BMP · VIDEO'))),
        viewport[4]),
      h('aside',{className:'studio-inspector','aria-label':'Inspector'},
        h('div',{className:'studio-panel-heading'},h('h2',null,'Inspector'),h('span',null,'FINE TUNE')),
        h('div',{className:'studio-mode-tabs'},h('button',{'aria-pressed':!mode,onClick:()=>{props.onTab('controls');state?.setMode('dither');},disabled:props.exporting},'Dither'),h('button',{'aria-pressed':mode,onClick:()=>{props.onTab('controls');state?.setMode('halftone');},disabled:props.exporting},'Halftone')),
        h('div',{className:'studio-style-description'},h('small',null,mode?'PRINT & TEXTURE':label(selected?.metadata.category||'Dither')),h('h1',null,mode?'Halftone':selected?.metadata.name||'Your next creation'),h('p',null,mode?'Explore print-inspired dots and color separations.':selected?.metadata.description||'Choose a style from the library to get started.')),
        h('div',{className:'studio-effect-tabs','aria-label':'Effect stages'},...['controls','custom',...(props.order||[]).filter(id=>!['adjustments','dither-style','color-palette'].includes(id)&&props.instances[id]?.settings?.visible!==false)].map(id=>h('button',{key:id,className:props.tab===id?'selected':'',onClick:()=>props.onTab(id),disabled:props.exporting},id==='controls'?'Style':id==='custom'?'Pipeline':props.instances[id]?.customLabel||props.instances[id]?.label||label(id))),h('button',{title:'Add effect','aria-label':'Add effect',onClick:props.onAddEffect,disabled},'+')),
        activeInstance&&h('div',{className:'studio-stage-actions'},h(Button,{title:'Move effect earlier',onClick:()=>originalTabs.onMoveTab?.(props.tab,'down'),disabled},'← Earlier'),h(Button,{title:'Move effect later',onClick:()=>originalTabs.onMoveTab?.(props.tab,'up'),disabled},'Later →'),!activeInstance.isOriginal&&h(Button,{title:'Remove effect',onClick:()=>originalTabs.onDeleteTab?.(props.tab),disabled},'Remove')),
        h('div',{className:'studio-controls'},controls),
        h('div',{className:'studio-export'},h('label',null,'Export as',h('select',{'aria-label':'Export format',value:props.format,onChange:e=>props.onFormat(e.target.value),disabled:props.exporting},...((props.media?.type==='video'||props.animation)?['mp4']:['png','jpeg','webp','clipboard',...(props.svg?['svg']:[]),...(props.screens?['screens']:[])]).map(format=>h('option',{key:format,value:format},format.toUpperCase())))),h(Button,{title:'Save preset from inspector',onClick:props.onSave},'Save preset'))),
      h('footer',{className:'studio-status'},h('span',null,h('i',{className:props.processing?'busy':''}),props.status||(props.processing?'Processing…':'Ready to create')),h('span',null,'BITCRUSH STUDIO'),h('span',null,props.media?.type==='video'?'VIDEO WORKSPACE':'LOCAL · OFFLINE')),
      ...(workspace?workspace.slice(3):[]));
  }
  class Boundary extends React.Component {
    constructor(props){super(props);this.state={error:null};}
    static getDerivedStateFromError(error){return{error};}
    componentDidCatch(error){console.error('BitCrush Studio failed',error);}
    render(){return this.state.error?h('div',{className:'studio-failure'},h('h1',null,'The workspace could not open'),h('pre',null,this.state.error.stack),h('button',{onClick:()=>location.reload()},'Reload workspace')):h(Studio,this.props);}
  }
  return Boundary;
}
