import React,{useState} from 'react';
import {Download,LoaderCircle} from 'lucide-react';

function notify(message,error=false){
  window.dispatchEvent(new CustomEvent('canvas-download-status',{detail:{message,error}}));
}

export async function download(src,name='图片.png'){
  let objectUrl;
  try{
    if(!src)throw new Error('当前没有可下载的图片');
    const response=await fetch(src,{signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw new Error(`无法读取图片（HTTP ${response.status}）`);
    const blob=await response.blob();
    if(!blob.size)throw new Error('图片内容为空');
    if(/(?:text\/html|application\/json)/i.test(blob.type))throw new Error('图片地址未返回图片，请重新登录或刷新后重试');
    const extension=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif'})[blob.type.split(';')[0]];
    const cleanName=(name||'图片.png').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-');
    const filename=extension?cleanName.replace(/\.(?:png|jpe?g|webp|gif|avif)$/i,'')+'.'+extension:cleanName;
    objectUrl=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=objectUrl;
    anchor.download=filename;
    document.body.appendChild(anchor);
    try{anchor.click()}finally{anchor.remove()}
    notify('图片已交给浏览器下载');
    return true;
  }catch(error){
    notify(error?.name==='TimeoutError'?'读取图片超时，请重试':error.message||'图片下载失败，请重试',true);
    return false;
  }finally{
    // Give the browser time to consume the Blob before releasing its URL.
    if(objectUrl)setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
  }
}

export default function ImageDownloadButton({src,name,className='',label='下载图片'}){
  const [busy,setBusy]=useState(false);
  return <button type="button" className={className} title={busy?'正在读取图片…':label} aria-label={busy?'正在读取图片':label} disabled={busy||!src} onClick={async event=>{
    event.stopPropagation();
    setBusy(true);
    try{await download(src,name)}finally{setBusy(false)}
  }}>{busy?<LoaderCircle size={15} className="spin"/>:<Download size={15}/>}</button>;
}
