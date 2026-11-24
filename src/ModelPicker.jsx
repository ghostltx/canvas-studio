import React,{useEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronUp,RefreshCw} from 'lucide-react';

export default function ModelPicker({entry,onChange,label,placeholder}){
  const [models,setModels]=useState([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[loaded,setLoaded]=useState(false);
  const request=useRef(0);
  const ready=Boolean(entry.baseUrl?.trim()&&(entry.key?.trim()||entry.keyEnv?.trim()));
  useEffect(()=>{request.current++;setModels([]);setOpen(false);setLoading(false);setError('');setQuery('');setLoaded(false)},[entry.baseUrl,entry.key,entry.keyEnv]);
  const fetchModels=async()=>{
    if(!ready||loading)return;
    const current=++request.current;setLoading(true);setError('');setOpen(true);
    try{
      const response=await fetch('/api/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:entry.baseUrl,key:entry.key||'',keyEnv:entry.keyEnv||''})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||`获取失败（HTTP ${response.status}）`);
      if(current!==request.current)return;
      setModels(result.models||[]);setLoaded(true);
    }catch(cause){if(current===request.current){setError(cause.message||'获取模型列表失败');setLoaded(false)}}finally{if(current===request.current)setLoading(false)}
  };
  const filtered=models.filter(model=>model.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="model-picker"><label>{label}<input value={entry.model||''} onChange={event=>onChange(event.target.value)} placeholder={placeholder}/></label><div className="model-picker-actions"><button type="button" className="model-fetch-button" onClick={fetchModels} disabled={!ready||loading} title={!ready?'请先填写 Base URL 和 Key':''}><RefreshCw size={13} className={loading?'spin':''}/>{loading?'获取中…':loaded?'重新获取模型':'获取模型列表'}</button>{loaded&&<button type="button" className="model-collapse-button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'收起':'展开'} {open?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button>}</div>{open&&<div className="model-list-panel">{loaded&&<><input className="model-search" aria-label="筛选模型" placeholder="输入字母筛选模型" value={query} onChange={event=>setQuery(event.target.value)}/><div className="model-results" role="listbox" aria-label="模型列表">{filtered.length?filtered.map(model=><button type="button" role="option" aria-selected={entry.model===model} key={model} onClick={()=>{onChange(model);setOpen(false)}}>{model}</button>):<div className="model-list-message">{models.length?'没有匹配的模型':'接口没有返回模型'}</div>}</div></>}{error&&<div role="alert" className="model-list-error">{error}</div>}</div>}</div>;
}
