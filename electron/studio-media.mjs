// View adapters retain the original controlled values, refs and callbacks.
import {createMediaViewport} from './studio-media-viewport.mjs';
export function createStudioMediaViews(React, {Field, Button}) {
  const h=React.createElement;
  const text=node=>Array.isArray(node)?node.map(text).join(' '):React.isValidElement(node)?text(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';
  const children=node=>React.Children.toArray(node.props.children);
  const byClass=(node,name)=>children(node).find(child=>child.props?.className===name);
  // Native selectors use letter/space keys. Keep those away from the original
  // window-level transport and timeline shortcuts; Escape still closes the editor.
  const selectorKeys=event=>{if(event.target.tagName==='SELECT'&&!event.ctrlKey&&!event.metaKey&&!['Escape','Tab'].includes(event.key))event.stopPropagation();};
  function useFocus(ref,onEscape) {
    React.useEffect(()=>{
      const previous=document.activeElement;
      const focusable=()=>[...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')];
      focusable()[0]?.focus();
      const key=event=>{
        if(event.key==='Escape'&&onEscape){event.preventDefault();onEscape();}
        if(event.key!=='Tab')return;
        const items=focusable(),first=items[0],last=items.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      };
      const element=ref.current;element.addEventListener('keydown',key);
      return()=>{element.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
    },[]);
  }
  // Use the existing Studio fields with each original onChange/min/max/option.
  function form(node,label,key) {
    if(Array.isArray(node))return node.map((child,index)=>form(child,label,index));
    if(!React.isValidElement(node))return node;
    const p=node.props;
    if(node.type==='label'&&children(node).some(child=>typeof child.type==='function'&&child.props.onChange)) {
      const control=children(node).find(child=>typeof child.type==='function'&&child.props.onChange);
      return h(Field,{key,field:{...control.props,label:children(node).filter(child=>typeof child==='string').join('').trim()}});
    }
    if(typeof node.type==='function'&&typeof p.onChange==='function'&&(p.options||'min'in p))return h(Field,{key,field:{...p,label:p.label||label}});
    if(p.className==='animation-config-group') {
      const name=text(children(node).find(child=>child.type==='label'));
      const control=children(node).find(child=>typeof child.type==='function'&&child.props.onChange);
      return h(Field,{key,field:{...control.props,label:name}});
    }
    return React.cloneElement(node,{key},form(p.children,label));
  }
  function ModeConfirmation({legacy,onClose}) {
    const ref=React.useRef(null),id=React.useId();useFocus(ref,onClose);
    const heading=byClass(legacy,'confirm-modal-title'),message=byClass(legacy,'confirm-modal-message'),actions=byClass(legacy,'confirm-modal-actions');
    return React.cloneElement(legacy,{ref,className:'confirm-modal bc-dialog bc-mode-dialog',role:'dialog','aria-modal':true,'aria-labelledby':id,'aria-describedby':id+'-description'},
      h('header',null,h('div',null,h('small',{className:'bc-dialog-eyebrow'},'Workspace mode'),h('h2',{id},text(heading))),h(Button,{icon:'close',title:'Close mode confirmation',onClick:onClose,className:'icon subtle'})),
      h('p',{id:id+'-description',className:'bc-mode-description'},text(message)),
      h('footer',null,...children(actions).map((button,index)=>React.cloneElement(button,{className:'bc-button'+(index===1?' primary':'')}))));
  }
  function AnimationEditor({legacy,onClose,anchorRect}) {
    const ref=React.useRef(null),[position,setPosition]=React.useState(null);
    useFocus(ref);
    React.useLayoutEffect(()=>{
      const place=()=>{
        const rect=ref.current.getBoundingClientRect();
        const left=Math.max(16,Math.min(anchorRect.left,window.innerWidth-rect.width-16));
        const top=Math.max(16,Math.min(anchorRect.top-rect.height-10,window.innerHeight-rect.height-16));
        setPosition(old=>old?.left===left&&old?.top===top?old:{left,top});
      };
      place();const observer=new ResizeObserver(place);observer.observe(ref.current);window.addEventListener('resize',place);
      return()=>{observer.disconnect();window.removeEventListener('resize',place);};
    },[anchorRect]);
    const group=byClass(legacy,'control-group'),remove=children(legacy).find(child=>child.type==='button');
    // The original outside-click listener owns this ref; keep it connected.
    const connect=element=>{ref.current=element;if(typeof legacy.ref==='function')legacy.ref(element);else if(legacy.ref)legacy.ref.current=element;};
    return React.cloneElement(legacy,{ref:connect,className:'animation-bar-popup bc-animation-editor',role:'dialog','aria-label':'Animation layer',onKeyDown:selectorKeys,style:{...legacy.props.style,...position,bottom:'auto',visibility:position?'visible':'hidden'}},
      h('header',null,h('div',null,h('small',{className:'bc-dialog-eyebrow'},'Timeline'),h('h2',null,'Animation layer')),h(Button,{icon:'close',title:'Close animation editor',onClick:onClose,className:'icon subtle'})),
      h('div',{className:'bc-animation-fields'},form(group.props.children)),
      h('footer',null,h(Button,{title:'Delete animation layer',onClick:remove.props.onClick,className:'bc-animation-delete'},'Delete layer'),h(Button,{onClick:onClose,primary:true},'Done')));
  }
  function AnimationSetup({legacy,onClose}) {
    const ref=React.useRef(null),id=React.useId();useFocus(ref,onClose);
    const content=byClass(legacy,'animation-config-content'),footer=byClass(legacy,'animation-config-footer');
    return React.cloneElement(legacy,{ref,className:'animation-config-modal bc-dialog bc-animation-setup',role:'dialog','aria-modal':true,'aria-labelledby':id,onKeyDown:selectorKeys},
      h('header',null,h('div',null,h('small',{className:'bc-dialog-eyebrow'},'Still image to motion'),h('h2',{id},'Create animation')),h(Button,{icon:'close',title:'Close',onClick:onClose,className:'icon subtle'})),
      h('div',{className:'bc-animation-setup-fields'},form(content.props.children)),
      h('footer',null,...children(footer).map((button,index)=>React.cloneElement(button,{className:'bc-button'+(index===1?' primary':'')}))));
  }
  return {ModeConfirmation,AnimationEditor,AnimationSetup,MediaViewport:createMediaViewport(React)};
}
