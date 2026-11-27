export const CONFIG_FORMAT='canvas-studio-api-settings';
import {fixedImageProfiles,DEFAULT_TEXT_NAME} from './profile-slots.js';
const string=(value,max=4096)=>typeof value==='string'?value.slice(0,max):'';
const readConfigText=raw=>{
  const content=raw.trim();
  if(content.startsWith('{'))return content;
  const match=content.match(/```json\s*\n([\s\S]*?)\n```/i);
  if(!match)throw new Error('请选择 Canvas Studio 导出的 API 配置文件');
  return match[1];
};

export function parseApiConfig(raw,current,localMode=false){
  const input=JSON.parse(readConfigText(raw));
  if(input?.format!==CONFIG_FORMAT||input.version!==1||!Array.isArray(input.imageProfiles)||input.imageProfiles.length<1)throw new Error('请选择 Canvas Studio 导出的 API 配置文件');
  if(input.imageProfiles.length>2)throw new Error('当前界面固定两个生图 API；请先在原设备导出或整理多余配置');
  const used=new Set();
  const imageProfiles=input.imageProfiles.map((item,index)=>{
    if(!item||typeof item!=='object')throw new Error('图像 API 配置格式错误');
    const baseUrl=string(item.baseUrl,500),model=string(item.model,120),matching=current.imageProfiles.find(old=>old.id===item.id||old.baseUrl===baseUrl&&old.model===model);
    const id=matching?.id||(/^[-0-9a-f]{36}$/i.test(item.id||'')?item.id:crypto.randomUUID());
    if(used.has(id))throw new Error('配置文件包含重复的图像 API');
    used.add(id);
    return {id,name:string(item.name,80)||`图像 API ${index+1}`,baseUrl,model,key:string(item.key),keyEnv:''};
  });
  if(imageProfiles.length<2){const spare=current.imageProfiles.find(item=>!used.has(item.id));if(spare)imageProfiles.push(spare)}
  const text=input.text||{};
  const storage=localMode?input.storage:undefined;
  if(storage!==undefined&&(!storage||typeof storage!=='object'||Array.isArray(storage)))throw new Error('存储配置格式错误');
  return {imageProfiles:fixedImageProfiles(imageProfiles),text:{name:string(text.name,80)||DEFAULT_TEXT_NAME,baseUrl:string(text.baseUrl,500),model:string(text.model,120),key:string(text.key),keyEnv:''},...(storage===undefined?{}:{storage})};
}

async function requestStorageConfig(method,config){
  const response=await fetch('/api/storage-config',{
    method,
    headers:{'X-Canvas-Settings':'1',...(config?{'Content-Type':'application/json'}:{})},
    body:config?JSON.stringify(config):undefined,
    cache:'no-store'
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result)throw new Error(result?.error||'无法读取或保存本机存储配置，请检查 Canvas Studio 本地服务');
  return result;
}

export async function applyImportedStorage(storage,setMode){
  if(!storage)return false;
  const {dataDir,cloud,mode}=storage;
  await requestStorageConfig('PUT',{dataDir,cloud});
  if(mode&&typeof mode.nas==='boolean'&&typeof mode.cloud==='boolean')setMode(mode);
  return true;
}

export async function exportApiConfig(settings,localMode,mode){
  const storage=localMode?(settings.storage??{...await requestStorageConfig('GET'),mode}):undefined;
  const configured=(entry)=>Boolean(entry?.baseUrl?.trim()||entry?.model?.trim()||entry?.key?.trim()||entry?.keyEnv?.trim());
  if(!settings?.imageProfiles?.some(configured)&&!configured(settings?.text)&&!storage?.dataDir&&!storage?.cloud)throw new Error('当前没有可导出的 API 或存储配置');
  const imageProfiles=fixedImageProfiles(settings.imageProfiles).map(({id,name,baseUrl,model,key,keyEnv})=>({id,name,baseUrl,model,key:key||'',keyEnv:keyEnv||''}));
  const text={...settings.text,name:settings.text?.name||DEFAULT_TEXT_NAME};
  if(localMode){
    const names=[...new Set([...imageProfiles.map(item=>item.keyEnv),text.keyEnv].filter(Boolean))];
    if(names.length){
      const response=await fetch('/api/env-keys/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({names})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'读取本地环境变量失败');
      for(const item of imageProfiles)if(item.keyEnv)item.key=result.values[item.keyEnv];
      if(text.keyEnv)text.key=result.values[text.keyEnv];
    }
  }
  for(const item of imageProfiles)delete item.keyEnv;
  delete text.keyEnv;
  const data={format:CONFIG_FORMAT,version:1,exportedAt:new Date().toISOString(),imageProfiles,text,...(storage?{storage}:{})};
  const markdown=['# Canvas Studio API 配置','','图像 API 按下方顺序排列，第一项是新建生图框的默认模型。文本 API 用于提示词优化和图像反推。','','```json',JSON.stringify(data,null,2),'```',''].join('\n');
  const url=URL.createObjectURL(new Blob([markdown],{type:'text/markdown;charset=utf-8'}));
  try{const anchor=document.createElement('a');anchor.href=url;anchor.download=`canvas-studio-api-${new Date().toISOString().slice(0,10)}.md`;anchor.click()}finally{setTimeout(()=>URL.revokeObjectURL(url),30000)}
}
