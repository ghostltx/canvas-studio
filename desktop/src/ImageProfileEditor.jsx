import React,{useRef,useState} from 'react';
import {ArrowLeftRight,Image as ImageIcon,Pencil,Type} from 'lucide-react';

function EditablePanelTitle({name,onChange,label}){
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(''),cancelled=useRef(false);
  const begin=()=>{cancelled.current=false;setDraft(name);setEditing(true)};
  const finish=()=>{if(!cancelled.current)onChange(draft.trim()||name);setEditing(false)};
  return <div className="api-panel-title">{editing?<input autoFocus aria-label={label} maxLength={80} value={draft} onChange={event=>setDraft(event.target.value)} onBlur={finish} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();if(event.key==='Escape'){cancelled.current=true;event.currentTarget.blur()}}}/>:<><strong title={name}>{name}</strong><button type="button" className="api-title-edit" aria-label={label} title={label} onClick={begin}><Pencil size={12}/></button></>}</div>;
}

function KeyFields({entry,onChange,envNames,placeholder}){
  const choices=[...new Set([...(envNames||[]),...(entry.keyEnv?[entry.keyEnv]:[])])];
  return <>
    {envNames!==null&&<label>Key 来源<select value={entry.keyEnv||''} onChange={event=>onChange({keyEnv:event.target.value,key:event.target.value?'':entry.key})}><option value="">手动填写 API Key</option>{choices.map(name=><option key={name} value={name}>环境变量：{name}</option>)}</select></label>}
    {!entry.keyEnv?<label>API Key<input type="password" autoComplete="off" value={entry.key||''} onChange={event=>onChange({key:event.target.value})} placeholder={placeholder}/></label>:<div className="api-key-env-note">请求时从本机环境变量 {entry.keyEnv} 读取 Key</div>}
  </>;
}

export default function ImageProfileEditor({settings,onChange,envNames=null}){
  const updateImage=(index,patch)=>onChange(current=>({...current,imageProfiles:current.imageProfiles.map((profile,position)=>position===index?{...profile,...patch}:profile)}));
  const updateText=patch=>onChange(current=>({...current,text:{...current.text,...patch}}));
  const swapImages=()=>onChange(current=>({...current,imageProfiles:[current.imageProfiles[1],current.imageProfiles[0]]}));
  return <div className="api-settings-grid">
    {settings.imageProfiles.slice(0,2).map((profile,index)=><section className="api-config-panel" key={profile.id} aria-label={`生图 API ${index+1}`}>
      <div className="api-config-panel-head"><span className="api-config-panel-icon image"><ImageIcon size={17}/></span><div><EditablePanelTitle name={profile.name} label={`修改生图 API ${index+1} 名称`} onChange={name=>updateImage(index,{name})}/><small>{index===0?'生图 API 1 · 新框默认':'生图 API 2 · 备用'}</small></div>{index===1&&<button type="button" className="api-priority-button" title="设为默认生图 API" onClick={swapImages}><ArrowLeftRight size={13}/>设为默认</button>}</div>
      <label>Base URL<input value={profile.baseUrl} onChange={event=>updateImage(index,{baseUrl:event.target.value})} placeholder="https://example.com/v1"/></label>
      <KeyFields entry={profile} onChange={patch=>updateImage(index,patch)} envNames={envNames} placeholder="图像 API Key"/>
      <label>模型名称<input value={profile.model} onChange={event=>updateImage(index,{model:event.target.value})} placeholder="例如 gpt-image-2.6"/></label>
    </section>)}
    <section className="api-config-panel text" aria-label="文本 API">
      <div className="api-config-panel-head"><span className="api-config-panel-icon text"><Type size={17}/></span><div><EditablePanelTitle name={settings.text?.name||'GEMINI flash 3.8'} label="修改文本 API 名称" onChange={name=>updateText({name})}/><small>文本 API · 提示词优化与反推</small></div></div>
      <label>Base URL<input value={settings.text?.baseUrl||''} onChange={event=>updateText({baseUrl:event.target.value})} placeholder="https://example.com/v1"/></label>
      <KeyFields entry={settings.text||{}} onChange={updateText} envNames={envNames} placeholder="文本 API Key"/>
      <label>文本／视觉模型名称<input value={settings.text?.model||''} onChange={event=>updateText({model:event.target.value})} placeholder="例如 gpt-4.1-mini"/></label>
    </section>
  </div>;
}
