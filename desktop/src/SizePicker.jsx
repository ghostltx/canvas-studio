import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronDown} from 'lucide-react';
import './size-picker.css';

const parsePreset=([size,label])=>{
  const match=/^([124]K)\s+.*?\s+(\d+:\d+)\s+·/.exec(label);
  return match?{size,tier:match[1],ratio:match[2]}:null;
};
const ratioLabel=ratio=>ratio==='1:1'?'正方形':Number(ratio.split(':')[0])>Number(ratio.split(':')[1])?'横向':'纵向';
const preview=size=>{
  const match=/^(\d+)x(\d+)$/.exec(size);
  if(!match)return <span className="size-preview auto" aria-hidden="true"/>;
  const width=Number(match[1]),height=Number(match[2]),scale=Math.min(28/width,21/height);
  return <span className="size-preview" aria-hidden="true" style={{width:Math.max(3,width*scale),height:Math.max(3,height*scale)}}/>;
};

export default function SizePicker({id,value,presets,onChange}){
  const [open,setOpen]=useState(false);
  const root=useRef(null),panel=useRef(null);
  const [placement,setPlacement]=useState({});
  const entries=presets.map(parsePreset).filter(Boolean);
  const current=entries.find(entry=>entry.size===value);
  const tier=current?.tier||(value==='auto'||value==='custom'?value:'legacy');
  const ratios=entries.filter(entry=>entry.tier===tier);
  const placePanel=()=>{
    const bounds=root.current?.getBoundingClientRect();
    if(!bounds)return;
    const width=Math.min(290,window.innerWidth-24);
    const left=Math.max(12,Math.min(bounds.left,window.innerWidth-width-12));
    const above=bounds.top>window.innerHeight-bounds.bottom&&window.innerHeight-bounds.bottom<310;
    const maxHeight=Math.min(390,Math.max(160,above?bounds.top-20:window.innerHeight-bounds.bottom-16));
    setPlacement({left,top:above?Math.max(8,bounds.top-maxHeight-4):bounds.bottom+4,width,maxHeight});
  };
  useEffect(()=>{
    if(!open)return;
    const dismiss=event=>{if(!root.current?.contains(event.target)&&!panel.current?.contains(event.target))setOpen(false)};
    const escape=event=>{if(event.key==='Escape'){setOpen(false);root.current?.querySelector('.size-picker-trigger')?.focus()}};
    document.addEventListener('pointerdown',dismiss);
    document.addEventListener('keydown',escape);
    window.addEventListener('resize',placePanel);
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);window.removeEventListener('resize',placePanel)};
  },[open]);
  useLayoutEffect(()=>{if(open)placePanel()},[open]);
  useEffect(()=>{if(open)panel.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'})},[open]);
  const switchTier=event=>{
    const next=event.target.value;
    setOpen(false);
    if(next==='auto'||next==='custom'){onChange(next);return}
    if(next==='legacy')return;
    const sameRatio=entries.find(entry=>entry.tier===next&&entry.ratio===current?.ratio);
    onChange((sameRatio||entries.find(entry=>entry.tier===next&&entry.ratio==='1:1')).size);
  };
  const onTriggerKeyDown=event=>{
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();
      if(!open){setOpen(true);return}
      const options=Array.from(panel.current?.querySelectorAll('[role="option"]')||[]);
      const index=options.indexOf(document.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?options.length-1:event.key==='ArrowUp'?Math.max(0,index-1):Math.min(options.length-1,index+1);
      options[next]?.focus();
    }
  };
  return <div className="size-picker nodrag nowheel" ref={root}>
    <label className="field-label" htmlFor={`${id}-tier`}>分辨率</label>
    <select className="nodrag size-tier-select" id={`${id}-tier`} value={tier} onChange={switchTier}>
      {tier==='legacy'&&<option value="legacy">当前尺寸 · {value.replace('x',' × ')}</option>}
      <option value="1K">1K</option><option value="2K">2K</option><option value="4K">4K</option>
      <option value="auto">自动</option><option value="custom">自定义宽高…</option>
    </select>
    <label className="field-label" htmlFor={id}>画面比例</label>
    <button id={id} type="button" className="size-picker-trigger" aria-haspopup="listbox" aria-expanded={open} disabled={!current} onKeyDown={onTriggerKeyDown} onClick={()=>setOpen(!open)}><span>{current?`${ratioLabel(current.ratio)} ${current.ratio} · ${value.replace('x',' × ')}`:tier==='custom'?'由自定义宽高决定':tier==='auto'?'由模型自动决定':`当前尺寸 · ${value.replace('x',' × ')}`}</span>{current&&preview(value)}<ChevronDown size={15}/></button>
    {open&&createPortal(<div ref={panel} className="size-picker-options nodrag nowheel" role="listbox" aria-label="画面比例" style={placement} onWheel={event=>event.stopPropagation()} onKeyDown={onTriggerKeyDown}>
      {ratios.map(entry=><button key={entry.size} type="button" role="option" aria-selected={entry.size===value} className="size-picker-option" onClick={()=>{onChange(entry.size);setOpen(false);root.current?.querySelector('.size-picker-trigger')?.focus()}}><span>{ratioLabel(entry.ratio)} {entry.ratio} · {entry.size.replace('x',' × ')}</span>{preview(entry.size)}{entry.size===value?<Check size={13}/>:<span className="size-option-check"/>}</button>)}
    </div>,document.body)}
  </div>;
}
