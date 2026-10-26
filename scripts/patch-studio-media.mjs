import {parse} from '@babel/parser';

// Adapt only presentation. Original transport, timeline and layer hooks remain in place.
export function patchStudioMedia(source) {
  const edits=[], found=new Set();
  const walk=(node,visit)=>{
    if(!node||typeof node!=='object')return;
    visit(node);
    for(const [key,value] of Object.entries(node)) {
      if(['loc','extra'].includes(key))continue;
      if(Array.isArray(value))value.forEach(child=>walk(child,visit));
      else if(value&&typeof value==='object')walk(value,visit);
    }
  };
  const prop=(node,key)=>node?.properties?.find(p=>p.key?.name===key||p.key?.value===key)?.value;
  walk(parse(source,{sourceType:'module'}),node=>{
    if(node.type!=='VariableDeclarator')return;
    const name=node.id?.name;
    if(name==='ch') {
      const old=source.slice(node.start,node.end);
      if(!old.includes('[Q,R]=f.useState(120)'))throw new Error('Timeline height anchor changed');
      let text=old.replace('[Q,R]=f.useState(120)','[Q,R]=f.useState(144)');
      if(!text.includes('title:q?"Collapse (T)":"Expand (T)"'))throw new Error('Timeline toggle anchor changed');
      text=text.replace('title:q?"Collapse (T)":"Expand (T)"','title:q?"Collapse (T)":"Expand (T)","aria-label":q?"Collapse timeline":"Expand timeline","aria-expanded":q');
      edits.push([node.start,node.end,text]);found.add(name);
    }
    if(name==='G0') {
      const ret=node.init.body.body.findLast(n=>n.type==='ReturnStatement');
      if(!source.slice(ret.argument.start,ret.argument.end).includes('className:"animation-bar-popup"'))throw new Error('Animation editor anchor changed');
      edits.push([ret.argument.start,ret.argument.end,`n.jsx(StudioViews.AnimationEditor,{legacy:(${source.slice(ret.argument.start,ret.argument.end)}),onClose:a,anchorRect:o})`]);found.add(name);
    }
    if(name==='Nv') {
      let text=source.slice(node.start,node.end);
      for(const component of ['J0','pv']) {
        const anchor=`n.jsx(${component},{`;
        if(!text.includes(anchor))throw new Error('Media zoom bridge anchor changed: '+component);
        text=text.replace(anchor,anchor+'onZoomChange:w,zoomActionsRef:y,zoomSettings:bcMediaSettings,');
      }
      if(!text.includes('=>h&&s?.type'))throw new Error('Media settings anchor changed');
      text=text.replace('=>h&&s?.type','=>{const bcMediaSettings=Na().settings;return h&&s?.type')+'}';
      edits.push([node.start,node.end,text]);found.add(name);
    }
    if(name==='Y0'||name==='mv') {
      const parameter=node.init.params[0];
      edits.push([parameter.end-1,parameter.end-1,',onZoomChange:bcOnZoomChange,zoomActionsRef:bcZoomActionsRef,zoomSettings:bcZoomSettings']);
      let count=0;
      walk(node.init.body,child=>{
        if(child.type!=='CallExpression')return;
        const cls=prop(child.arguments?.[1],'className'),style=prop(child.arguments?.[1],'style');
        if(cls?.type==='TemplateLiteral'&&cls.quasis[0].value.raw==='video-viewport '&&prop(style,'flexDirection')?.value==='column') {
          count++;edits.push([child.start,child.end,`n.jsx(StudioViews.MediaViewport,{legacy:(${source.slice(child.start,child.end)}),onZoomChange:bcOnZoomChange,zoomActionsRef:bcZoomActionsRef,settings:bcZoomSettings,mediaKey:s})`]);
        }
      });
      if(count!==1)throw new Error('Media stage anchor changed: '+name);found.add(name);
    }
    if(name==='f1'||name==='z1')walk(node.init,child=>{
      if(child.type!=='CallExpression')return;
      const cls=prop(child.arguments?.[1],'className')?.value;
      if(name==='f1'&&cls==='confirm-modal') {
        edits.push([child.start,child.end,`n.jsx(StudioViews.ModeConfirmation,{legacy:(${source.slice(child.start,child.end)}),onClose:ai})`]);found.add('confirm');
      }
      if(name==='z1'&&cls==='animation-config-modal') {
        edits.push([child.start,child.end,`n.jsx(StudioViews.AnimationSetup,{legacy:(${source.slice(child.start,child.end)}),onClose:o})`]);found.add(name);
      }
    });
  });
  if(found.size!==7)throw new Error('Missing Studio media adapter: '+[...found].join(','));
  let end=Infinity;
  for(const [start,stop,text]of edits.sort((a,b)=>b[0]-a[0])) {
    if(stop>end)throw new Error('Overlapping Studio media adapters');
    source=source.slice(0,start)+text+source.slice(stop);end=start;
  }
  return source;
}
