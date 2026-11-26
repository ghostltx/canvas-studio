import ModelPicker from './ModelPicker';
import React,{useRef,useState} from 'react';
import {ArrowLeftRight,Image as ImageIcon,Pencil,Type} from 'lucide-react';

function EditablePanelTitle({name,onChange,label}){
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(''),cancelled=useRef(false);
  const begin=()=>{cancelled.current=false;setDraft(name);setEditing(true)};
  const finish=()=>{if(!cancelled.current)onChange(draft.trim()||name);setEditing(false)};
  return <div className="api-panel-title">{editing?<input autoFocus aria-label={label} maxLength={80} value={draft} onChange={event=>setDraft(event.target.value)} onBlur={finish} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();if(event.key==='Escape'){cancelled.current=true;event.currentTarget.blur()}}}/>:<><strong title={name}>{name}</strong><button type="button" className="api-title-edit" aria-label={label} title={label} onClick={begin}><Pencil size={12}/></button></>}</div>;
}

function KeyFields({entry,onChange,placeholder}){
  return <label>{entry.keyEnv&&!entry.key?'API Key（已有配置仍可使用，输入新 Key 可替换）':'API Key'}<input type="password" autoComplete="off" value={entry.key||''} onChange={event=>onChange({key:event.target.value,keyEnv:''})} placeholder={placeholder}/></label>;
}

export default function ImageProfileEditor({settings,onChange}){
  const updateImage=(index,patch)=>onChange(current=>({...current,imageProfiles:current.imageProfiles.map((profile,position)=>position===index?{...profile,...patch}:profile)}));
  const updateText=patch=>onChange(current=>({...current,text:{...current.text,...patch}}));
  const swapImages=()=>onChange(current=>({...current,imageProfiles:[current.imageProfiles[1],current.imageProfiles[0]]}));
  return <div className="api-settings-grid">
    {settings.imageProfiles.slice(0,2).map((profile,index)=><section className="api-config-panel" key={profile.id} aria-label={`生图 API ${index+1}`}>
      <div className="api-config-panel-head"><span className="api-config-panel-icon image"><ImageIcon size={17}/></span><div><EditablePanelTitle name={profile.name} label={`修改生图 API ${index+1} 名称`} onChange={name=>updateImage(index,{name})}/><small>{index===0?'生图 API 1 · 新框默认':'生图 API 2 · 备用'}</small></div>{index===1&&<button type="button" className="api-priority-button" title="设为默认生图 API" onClick={swapImages}><ArrowLeftRight size={13}/>设为默认</button>}</div>
      <label>Base URL<input value={profile.baseUrl} onChange={event=>updateImage(index,{baseUrl:event.target.value})} placeholder="https://example.com/v1"/></label>
      <KeyFields entry={profile} onChange={patch=>updateImage(index,patch)} placeholder="图像 API Key"/>
      <ModelPicker entry={profile} label="模型名称" placeholder="例如 gpt-image-2.6" onChange={model=>updateImage(index,{model})}/>
    </section>)}
    <section className="api-config-panel text" aria-label="文本 API">
      <div className="api-config-panel-head"><span className="api-config-panel-icon text"><Type size={17}/></span><div><EditablePanelTitle name={settings.text?.name||'GEMINI flash 3.8'} label="修改文本 API 名称" onChange={name=>updateText({name})}/><small>文本 API · 提示词优化与反推</small></div></div>
      <label>Base URL<input value={settings.text?.baseUrl||''} onChange={event=>updateText({baseUrl:event.target.value})} placeholder="https://example.com/v1"/></label>
      <KeyFields entry={settings.text||{}} onChange={updateText} placeholder="文本 API Key"/>
      <ModelPicker entry={settings.text||{}} label="文本／视觉模型名称" placeholder="例如 gpt-4.1-mini" onChange={model=>updateText({model})}/>
    </section>
  </div>;
}
