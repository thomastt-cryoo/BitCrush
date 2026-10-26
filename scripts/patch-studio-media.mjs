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
      let text=old.replace('[Q,R]=f.useState(120)','[Q,R]=f.useState(176)');
      if(!text.includes('title:q?"Collapse (T)":"Expand (T)"'))throw new Error('Timeline toggle anchor changed');
      text=text.replace('title:q?"Collapse (T)":"Expand (T)"','title:q?"Collapse (T)":"Expand (T)","aria-label":q?"Collapse timeline":"Expand timeline","aria-expanded":q');
      edits.push([node.start,node.end,text]);found.add(name);
    }
    if(name==='G0') {
      const ret=node.init.body.body.findLast(n=>n.type==='ReturnStatement');
      if(!source.slice(ret.argument.start,ret.argument.end).includes('className:"animation-bar-popup"'))throw new Error('Animation editor anchor changed');
      edits.push([ret.argument.start,ret.argument.end,`n.jsx(StudioViews.AnimationEditor,{legacy:(${source.slice(ret.argument.start,ret.argument.end)}),onClose:a,anchorRect:o})`]);found.add(name);
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
  if(found.size!==4)throw new Error('Missing Studio media adapter: '+[...found].join(','));
  let end=Infinity;
  for(const [start,stop,text]of edits.sort((a,b)=>b[0]-a[0])) {
    if(stop>end)throw new Error('Overlapping Studio media adapters');
    source=source.slice(0,start)+text+source.slice(stop);end=start;
  }
  return source;
}
