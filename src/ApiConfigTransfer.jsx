import React,{useRef,useState} from 'react';
import {Download,Upload} from 'lucide-react';
import {exportApiConfig,parseApiConfig} from './api-config-transfer';

export default function ApiConfigTransfer({settings,onImport,localMode=false}){
  const fileInput=useRef(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const exportFile=async()=>{setBusy(true);setMessage('');try{await exportApiConfig(settings,localMode)}catch(error){setMessage(error.message||'导出失败')}finally{setBusy(false)}};
  const importFile=async file=>{if(!file)return;setBusy(true);setMessage('');try{if(file.size>1024*1024)throw new Error('配置文件不能超过 1 MB');onImport(parseApiConfig(await file.text(),settings));setMessage('已载入配置，点击“保存设置”后生效')}catch(error){setMessage(error.message||'导入失败')}finally{setBusy(false)}};
  return <div className="api-transfer"><div className="api-transfer-actions"><button type="button" disabled={busy} onClick={exportFile}><Download size={15}/>导出配置 .md</button><button type="button" disabled={busy} onClick={()=>fileInput.current?.click()}><Upload size={15}/>导入配置</button><input ref={fileInput} type="file" accept=".md,.json,text/markdown,application/json" hidden onChange={event=>{void importFile(event.target.files?.[0]);event.target.value=''}}/></div><p>导出当前浏览器的图像、文本 API 配置和 Key；换浏览器请先导入。也兼容旧版 JSON 配置。</p>{message&&<div className="api-transfer-message" role="status">{message}</div>}</div>;
}
