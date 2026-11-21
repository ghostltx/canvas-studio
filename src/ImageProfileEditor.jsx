import React,{useState} from 'react';
import {ChevronDown,GripVertical,Plus,Trash2,ArrowUp,ArrowDown} from 'lucide-react';

export default function ImageProfileEditor({profiles,onChange,envNames=null}){
  const [expanded,setExpanded]=useState(null),[dragging,setDragging]=useState(null);
  const move=(from,to)=>{if(from<0||to<0||to>=profiles.length||from===to)return;const next=[...profiles];next.splice(to,0,next.splice(from,1)[0]);onChange(next)};
  const update=(id,patch)=>onChange(profiles.map(item=>item.id===id?{...item,...patch}:item));
  return <div className="image-profile-editor">
    <div className="profile-heading"><strong>图像 API</strong><button type="button" onClick={()=>{const id=crypto.randomUUID();onChange([...profiles,{id,name:`图像 API ${profiles.length+1}`,baseUrl:'',key:'',keyEnv:'',model:''}]);setExpanded(id)}}><Plus size={15}/>添加</button></div>
    <p className="profile-help">拖动调整默认优先级。新生图框默认使用第一项，现有框保留自己的选择。</p>
    {profiles.map((item,index)=><div className="profile-card" key={item.id} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();move(profiles.findIndex(profile=>profile.id===dragging),index);setDragging(null)}}>
      <div className="profile-card-top"><span className="profile-grip" title="拖动排序" draggable onDragStart={event=>{setDragging(item.id);event.dataTransfer.effectAllowed='move'}} onDragEnd={()=>setDragging(null)}><GripVertical size={17}/></span><button type="button" className="profile-toggle" onClick={()=>setExpanded(expanded===item.id?null:item.id)}><span><b>{item.name||`图像 API ${index+1}`}</b><small>{item.model||'未填写模型'}{index===0?' · 新节点默认':''}</small></span><ChevronDown size={16} className={expanded===item.id?'chevron-open':''}/></button><button type="button" title="上移" disabled={index===0} onClick={()=>move(index,index-1)}><ArrowUp size={14}/></button><button type="button" title="下移" disabled={index===profiles.length-1} onClick={()=>move(index,index+1)}><ArrowDown size={14}/></button></div>
      {expanded===item.id&&<div className="profile-details"><label>自定义名称<input value={item.name} onChange={event=>update(item.id,{name:event.target.value})} placeholder="例如 我的生图服务"/></label><label>Base URL<input value={item.baseUrl} onChange={event=>update(item.id,{baseUrl:event.target.value})} placeholder="https://example.com/v1"/></label>
        {envNames!==null&&<label>Key 来源<select value={item.keyEnv||''} onChange={event=>update(item.id,{keyEnv:event.target.value,key:event.target.value?'':item.key})}><option value="">手动填写 API Key</option>{[...new Set([...envNames,...(item.keyEnv?[item.keyEnv]:[])])].map(name=><option key={name} value={name}>环境变量：{name}</option>)}</select></label>}
        {!item.keyEnv&&<label>API Key<input type="password" value={item.key||''} onChange={event=>update(item.id,{key:event.target.value})} placeholder="仅保存在这台设备"/></label>}
        {item.keyEnv&&<p className="profile-help">请求时由本地服务读取 {item.keyEnv}，不会把环境变量值保存在浏览器。</p>}
        <label>模型名称<input value={item.model} onChange={event=>update(item.id,{model:event.target.value})} placeholder="例如 gpt-image-2.6"/></label><button type="button" className="profile-delete" disabled={profiles.length===1} onClick={()=>{onChange(profiles.filter(profile=>profile.id!==item.id));setExpanded(null)}}><Trash2 size={14}/>删除这项</button></div>}
    </div>)}
  </div>;
}
