import React, {useRef, useState} from 'react';
import {Pencil, Check, X} from 'lucide-react';

export default function ProjectTitle({project, onOpen, onRename, batch, projectTime}) {
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(project.title),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(false);
  const save=async()=>{
    if(pending.current)return;
    const title=draft.trim();
    if(!title){setError('请输入项目名称');return}
    if(title===project.title){setEditing(false);return}
    pending.current=true;setBusy(true);setError('');
    try{await onRename(project.id,title);setEditing(false)}catch(e){setError(e.message||'重命名失败，请重试')}finally{pending.current=false;setBusy(false)}
  };
  return <div className="project-card-info"><div className="project-title-row">{editing ? <form className="project-title-form" onSubmit={event=>{event.preventDefault();save()}}><input aria-label="项目名称" autoFocus maxLength={60} value={draft} disabled={busy} onFocus={event=>event.target.select()} onChange={event=>{setDraft(event.target.value);setError('')}} onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.preventDefault();setEditing(false);setError('')}}}/><button className="project-title-action" type="submit" disabled={busy} title="保存名称" aria-label="保存名称"><Check size={15}/></button><button className="project-title-action" type="button" disabled={busy} title="取消修改" aria-label="取消修改" onClick={()=>{setEditing(false);setError('')}}><X size={15}/></button></form> : <><button className="project-title-open" type="button" disabled={batch.busy} title={project.title} onClick={()=>batch.active?batch.toggle(project.id):onOpen(project.id)}><strong>{project.title}</strong></button>{!batch.active&&<button className="project-title-action" type="button" title="修改项目名称" aria-label={`修改项目名称：${project.title}`} onClick={()=>{setDraft(project.title);setError('');setEditing(true)}}><Pencil size={14}/></button>}</>}</div><div className="project-card-meta"><small title={`项目 ID：${project.id}`}>ID: {project.id.slice(0,8)}{project.id.length>8?'...':''}</small><small>{projectTime(project.updatedAt)}</small></div>{error&&<small className="project-rename-error" role="alert">{error}</small>}</div>;
}
