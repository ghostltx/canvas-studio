import React,{useEffect,useRef,useState} from 'react';
import {Check,FolderOpen,ListChecks,LoaderCircle,Trash2,X} from 'lucide-react';
import './project-batch.css';

export function useProjectBatch(projects,onDelete){
  const [active,setActive]=useState(false),[selected,setSelected]=useState(()=>new Set());
  const [dialog,setDialog]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [progress,setProgress]=useState({completed:0,total:0});
  const running=useRef(false);
  useEffect(()=>{
    const present=new Set(projects.map(project=>project.id));
    setSelected(previous=>{
      const next=new Set([...previous].filter(id=>present.has(id)));
      return next.size===previous.size?previous:next;
    });
  },[projects]);
  const selectedProjects=projects.filter(project=>selected.has(project.id));
  const toggleMode=()=>{
    if(running.current)return;
    setActive(value=>!value);setSelected(new Set());setError('');
  };
  const toggle=id=>{
    if(running.current)return;
    setSelected(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next});
  };
  const toggleVisible=visible=>{
    if(running.current||!visible.length)return;
    const all=visible.every(project=>selected.has(project.id));
    setSelected(previous=>{
      const next=new Set(previous);
      for(const project of visible){if(all)next.delete(project.id);else next.add(project.id)}
      return next;
    });
  };
  const openDialog=()=>{
    if(!selectedProjects.length||running.current)return;
    setError('');setProgress({completed:0,total:selectedProjects.length});setDialog(selectedProjects);
  };
  const closeDialog=()=>{if(!running.current)setDialog(null)};
  const confirm=async()=>{
    if(!dialog?.length||running.current)return;
    running.current=true;setBusy(true);setError('');setProgress({completed:0,total:dialog.length});
    try{
      const result=await onDelete(dialog.map(project=>project.id),setProgress);
      const deleted=new Set(result.deletedIds);
      setSelected(previous=>new Set([...previous].filter(id=>!deleted.has(id))));
      if(result.failed.length){
        const failed=new Set(result.failed.map(item=>item.id));
        const remaining=dialog.filter(project=>failed.has(project.id));
        setDialog(remaining);
        setError(`已删除 ${result.deletedIds.length} 个画布，${result.failed.length} 个删除失败。\n${result.failed.map(item=>`${dialog.find(project=>project.id===item.id)?.title||'画布'}：${item.message}`).join('\n')}`);
      }else{
        setDialog(null);setActive(false);setSelected(new Set());
      }
    }catch(cause){
      setError(cause.message||'批量删除失败，请重试');
    }finally{
      running.current=false;setBusy(false);
    }
  };
  return {active,selected,selectedProjects,dialog,busy,error,progress,toggleMode,toggle,toggleVisible,clear:()=>setSelected(new Set()),openDialog,closeDialog,confirm};
}

export function ProjectBatchButton({batch,disabled=false}){
  return <button className={`project-batch-button ${batch.active?'active':''}`} type="button" aria-pressed={batch.active} disabled={disabled||batch.busy} onClick={batch.toggleMode}>
    {batch.active?<Check size={16}/>:<ListChecks size={16}/>} {batch.active?'完成':'批量管理'}
  </button>;
}

export function ProjectBatchToolbar({batch,visible,filtered=false}){
  const allRef=useRef(null);
  const selectedVisible=visible.filter(project=>batch.selected.has(project.id)).length;
  const hidden=batch.selectedProjects.length-selectedVisible;
  useEffect(()=>{if(allRef.current)allRef.current.indeterminate=selectedVisible>0&&selectedVisible<visible.length},[selectedVisible,visible.length,batch.active]);
  if(!batch.active)return null;
  return <div className="project-batch-toolbar" role="toolbar" aria-label="项目批量管理">
    <label className="project-select-all"><input ref={allRef} type="checkbox" checked={visible.length>0&&selectedVisible===visible.length} disabled={!visible.length||batch.busy} onChange={()=>batch.toggleVisible(visible)}/>{filtered?'全选当前结果':'全选'}</label>
    <span className="project-selection-count" aria-live="polite">已选 {batch.selectedProjects.length} 项{hidden>0?`（${hidden} 项不在当前结果中）`:''}</span>
    <div className="project-batch-toolbar-actions">
      <button className="project-batch-clear" type="button" disabled={!batch.selectedProjects.length||batch.busy} onClick={batch.clear}><X size={15}/>取消选择</button>
      <button className="project-batch-delete" type="button" disabled={!batch.selectedProjects.length||batch.busy} onClick={batch.openDialog}><Trash2 size={16}/>删除所选（{batch.selectedProjects.length}）</button>
    </div>
  </div>;
}

export function ProjectBatchCheckbox({batch,project}){
  return <label className="project-card-select" title={`选择「${project.title}」`}>
    <input type="checkbox" aria-label={`选择项目：${project.title}`} checked={batch.selected.has(project.id)} disabled={batch.busy} onChange={()=>batch.toggle(project.id)}/>
  </label>;
}

export function ProjectBatchDialog({batch,storageLabel}){
  const dialogRef=useRef(null),cancelRef=useRef(null),open=!!batch.dialog;
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement;
    cancelRef.current?.focus();
    return()=>previous?.isConnected&&previous.focus();
  },[open]);
  useEffect(()=>{if(batch.busy)dialogRef.current?.focus()},[batch.busy]);
  if(!open)return null;
  const onKeyDown=event=>{
    if(event.key==='Escape'){event.stopPropagation();batch.closeDialog()}
    if(event.key!=='Tab')return;
    const buttons=[...dialogRef.current.querySelectorAll('button:not(:disabled)')];
    if(!buttons.length){event.preventDefault();return}
    const first=buttons[0],last=buttons.at(-1);
    if(!buttons.includes(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus()}
    else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  };
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)batch.closeDialog()}}>
    <div ref={dialogRef} className="project-delete-modal project-batch-dialog" role="dialog" aria-modal="true" aria-labelledby="project-batch-delete-title" aria-describedby="project-batch-delete-description" aria-busy={batch.busy} tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="project-delete-icon"><Trash2 size={22}/></div>
      <h2 id="project-batch-delete-title">删除这 {batch.dialog.length} 个画布？</h2>
      <p id="project-batch-delete-description">将从{storageLabel}中永久删除以下画布，此操作无法撤销。</p>
      <ul className="project-batch-delete-list">{batch.dialog.map(project=><li key={project.id}>
        <span className="project-batch-preview">{project.preview?<img src={project.preview} alt=""/>:<FolderOpen size={20}/>}</span>
        <span className="project-batch-item-name" title={project.title}>{project.title}</span><small>{project.nodeCount||0} 个节点</small>
      </li>)}</ul>
      {batch.error&&<p className="project-delete-error project-batch-error" role="alert">{batch.error}</p>}
      {batch.busy&&<p className="project-batch-progress" role="status">正在删除 {batch.progress.completed} / {batch.progress.total}</p>}
      <div className="project-delete-actions">
        <button ref={cancelRef} className="secondary-button" type="button" disabled={batch.busy} onClick={batch.closeDialog}>取消</button>
        <button className="project-delete-confirm" type="button" disabled={batch.busy} onClick={batch.confirm}>{batch.busy?<><LoaderCircle size={15} className="spin"/>删除中…</>:batch.error?'重试删除':'确认删除'}</button>
      </div>
    </div>
  </div>;
}
