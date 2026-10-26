// Display-only pan/zoom. Source frames, playback refs, processing and export stay original.
export function createMediaViewport(React) {
  const h=React.createElement;
  return function MediaViewport({legacy,onZoomChange,zoomActionsRef,settings={},mediaKey}) {
    const [view,setView]=React.useState({level:100,x:0,y:0}),[panning,setPanning]=React.useState(false);
    const current=React.useRef(view),stage=React.useRef(null),surface=React.useRef(null),content=React.useRef(null),drag=React.useRef(null);
    current.current=view;
    const min=Math.max(1,Number(settings.minZoom)||25),max=Math.max(100,min,Number(settings.maxZoom)||800),step=Math.max(1,Number(settings.zoomIncrement)||25);
    const commit=React.useCallback(next=>{
      const previous=current.current;
      if(next.level===previous.level&&next.x===previous.x&&next.y===previous.y)return;
      current.current=next;setView(next);
    },[]);
    const constrain=React.useCallback(next=>{
      const box=surface.current,media=content.current?.querySelector('video,img');
      if(!box||next.level<=100)return {...next,x:0,y:0};
      const width=media?.videoWidth||media?.naturalWidth||box.clientWidth,height=media?.videoHeight||media?.naturalHeight||box.clientHeight;
      const fit=Math.min(box.clientWidth/width,box.clientHeight/height),scale=next.level/100;
      const x=Math.max(0,(width*fit*scale-box.clientWidth)/2),y=Math.max(0,(height*fit*scale-box.clientHeight)/2);
      return {...next,x:Math.max(-x,Math.min(x,next.x)),y:Math.max(-y,Math.min(y,next.y))};
    },[]);
    const changeZoom=React.useCallback((requested,point)=>{
      const old=current.current,level=Math.min(max,Math.max(min,requested));
      const ratio=level/old.level,anchor=point||{x:0,y:0};
      commit(constrain({level,x:anchor.x+(old.x-anchor.x)*ratio,y:anchor.y+(old.y-anchor.y)*ratio}));
    },[min,max,commit,constrain]);
    const reset=React.useCallback(()=>{drag.current=null;setPanning(false);commit({level:100,x:0,y:0});},[commit]);
    React.useEffect(()=>{reset();},[mediaKey,reset]);
    React.useEffect(()=>{onZoomChange?.(view.level,min,max);},[view.level,min,max,onZoomChange]);
    React.useEffect(()=>{
      const actions={zoomIn:()=>changeZoom(current.current.level+step),zoomOut:()=>changeZoom(current.current.level-step),resetView:reset};
      if(zoomActionsRef)zoomActionsRef.current=actions;
      return()=>{if(zoomActionsRef?.current===actions)zoomActionsRef.current=null;};
    },[changeZoom,step,reset,zoomActionsRef]);
    React.useEffect(()=>{
      const element=stage.current;
      const wheel=event=>{
        if(settings.scrollZoomEnabled===false||!event.deltaY)return;
        event.preventDefault();
        const rect=surface.current.getBoundingClientRect();
        changeZoom(current.current.level+(event.deltaY<0?step:-step),{x:event.clientX-rect.left-rect.width/2,y:event.clientY-rect.top-rect.height/2});
      };
      element.addEventListener('wheel',wheel,{passive:false});
      return()=>element.removeEventListener('wheel',wheel);
    },[changeZoom,step,settings.scrollZoomEnabled]);
    React.useEffect(()=>{
      const key=event=>{
        const target=event.target;
        if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName))return;
        if(['+','='].includes(event.key)){event.preventDefault();changeZoom(current.current.level+step);}
        else if(['-','_'].includes(event.key)){event.preventDefault();changeZoom(current.current.level-step);}
        else if(event.key==='0'){event.preventDefault();reset();}
      };
      window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
    },[changeZoom,step,reset]);
    React.useEffect(()=>{
      const observer=new ResizeObserver(()=>commit(constrain(current.current)));
      observer.observe(surface.current);return()=>observer.disconnect();
    },[commit,constrain]);
    const down=event=>{
      if(event.button!==0||current.current.level<=100||event.target.closest('button,input,select'))return;
      event.preventDefault();drag.current={clientX:event.clientX,clientY:event.clientY,...current.current};
      event.currentTarget.setPointerCapture(event.pointerId);setPanning(true);
    };
    const move=event=>{if(drag.current)commit(constrain({...current.current,x:drag.current.x+event.clientX-drag.current.clientX,y:drag.current.y+event.clientY-drag.current.clientY}));};
    const up=event=>{drag.current=null;setPanning(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);};
    const [display,...transport]=React.Children.toArray(legacy.props.children);
    const layers=React.Children.toArray(display.props.children),fixed=[],media=[];
    for(const layer of layers)(['video-viewport-export-overlay','gif-processing-badge'].includes(layer.props?.className)?fixed:media).push(layer);
    const displayView=React.cloneElement(display,{
      ref:stage,className:`${display.props.className||''} bc-media-stage`,
      'aria-label':'Media preview',onPointerDown:down,onPointerMove:move,onPointerUp:up,onPointerCancel:up,onDoubleClick:reset,
      style:{...display.props.style,cursor:view.level>100?(panning?'grabbing':'grab'):'default'}
    },h('div',{ref:surface,className:'bc-media-surface'},h('div',{ref:content,className:'bc-media-transform','data-zoom':view.level,style:{transform:`translate3d(${view.x}px,${view.y}px,0) scale(${view.level/100})`}},media)),...fixed);
    return React.cloneElement(legacy,{className:legacy.props.className+' bc-motion-viewport'},displayView,...transport);
  };
}
