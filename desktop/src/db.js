import * as browser from './browser-db';
import {remoteStore} from './remote-db';

const STORAGE_KEY='canvas-storage-mode-v1';
const nas=remoteStore('nas'),cloud=remoteStore('cloud');
const iso=value=>Date.parse(value||0)||0;
let lastSaveTime=0;

export function getStorageMode(){
  try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return {nas:value.nas===true,cloud:value.cloud===true}}catch{return {nas:false,cloud:false}}
}
const stores=mode=>mode.nas||mode.cloud?[...(mode.nas?[nas]:[]),...(mode.cloud?[cloud]:[])]:[browser];
const storeName=store=>store===browser?'browser':store.kind;

async function portableBrowser(document){
  const dataUrl=async src=>{
    if(typeof src!=='string'||!src.startsWith('/api/'))return src;
    const response=await fetch(src);if(!response.ok)throw new Error('读取待迁移图片失败');
    const blob=await response.blob();
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('读取图片失败'));reader.readAsDataURL(blob)});
  };
  const nodes=[];
  for(const node of document.nodes||[])nodes.push({...node,data:{...node.data,src:await dataUrl(node.data?.src),previousSrc:await dataUrl(node.data?.previousSrc)}});
  return {...document,nodes};
}
async function upsert(store,meta,document){
  return store===browser?browser.upsertProject(meta,await portableBrowser(document)):store.upsertProject(meta,document);
}
async function combined(){
  const active=stores(getStorageMode());
  const lists=await Promise.all(active.map(async store=>({store,projects:await store.listProjects()})));
  const entries=new Map();
  for(const {store,projects} of lists)for(const meta of projects){const existing=entries.get(meta.id);if(!existing||iso(meta.updatedAt)>iso(existing.meta.updatedAt))entries.set(meta.id,{store,meta})}
  return {active,lists,entries};
}

export async function setStorageMode(next){
  const target={nas:next.nas===true,cloud:next.cloud===true},previous=getStorageMode();
  if(previous.nas===target.nas&&previous.cloud===target.cloud)return target;
  const from=stores(previous),to=stores(target),all=[...new Set([...from,...to])];
  await Promise.all(all.filter(store=>store!==browser).map(store=>store.verify()));
  const lists=await Promise.all(all.map(async store=>({store,projects:await store.listProjects()})));
  const latest=new Map();
  for(const {store,projects} of lists)for(const meta of projects){const existing=latest.get(meta.id);if(!existing||iso(meta.updatedAt)>iso(existing.meta.updatedAt))latest.set(meta.id,{store,meta})}
  for(const {store,meta} of latest.values()){
    const document=await store.loadDocument(meta.id);
    if(!document)throw new Error(`迁移画布 ${meta.title} 时无法读取内容`);
    for(const destination of to){
      if(destination===store)continue;
      const existing=lists.find(item=>item.store===destination)?.projects.find(item=>item.id===meta.id);
      if(existing&&iso(existing.updatedAt)>=iso(meta.updatedAt))continue;
      await upsert(destination,meta,document);
    }
  }
  let syncError;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const taskResponse=await fetch('/api/tasks/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(target)});
      if(!taskResponse.ok){const result=await taskResponse.json();throw new Error(result.error||'生成任务同步失败')}
      syncError=null;break;
    }catch(error){syncError=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)))}
  }
  if(syncError)throw syncError;
  localStorage.setItem(STORAGE_KEY,JSON.stringify(target));
  return target;
}

export async function listProjects(){
  const {active,lists,entries}=await combined();
  if(active.length===2){
    for(const [id,{store,meta}] of entries){
      const stale=lists.find(item=>item.store!==store)?.projects.find(item=>item.id===id);
      if(stale&&iso(stale.updatedAt)>=iso(meta.updatedAt))continue;
      const document=await store.loadDocument(id);
      if(document)await upsert(active.find(item=>item!==store),meta,document);
    }
  }
  return [...entries.values()].map(item=>item.meta).sort((a,b)=>iso(b.updatedAt)-iso(a.updatedAt));
}

export async function loadDocument(id){
  const {active,lists}=await combined();
  const candidates=lists.map(({store,projects})=>({store,meta:projects.find(item=>item.id===id)})).filter(item=>item.meta).sort((a,b)=>iso(b.meta.updatedAt)-iso(a.meta.updatedAt));
  if(!candidates.length)return null;
  const newest=candidates[0],document=await newest.store.loadDocument(id);
  if(!document)return null;
  if(active.length===2&&(candidates.length===1||iso(candidates[1]?.meta.updatedAt)<iso(newest.meta.updatedAt)))await upsert(active.find(store=>store!==newest.store),newest.meta,document);
  return document;
}

export async function createProject(){
  const active=stores(getStorageMode());
  if(active.length===1)return active[0].createProject();
  const id=crypto.randomUUID(),now=new Date().toISOString(),document={title:'未命名画布',nodes:[],edges:[],viewport:{x:0,y:0,zoom:1}},meta={id,createdAt:now,updatedAt:now,preview:null};
  await Promise.all(active.map(store=>upsert(store,meta,document)));
  return id;
}

export async function saveDocument(id,document,options){
  const active=stores(getStorageMode());
  lastSaveTime=Math.max(Date.now(),lastSaveTime+1);
  const timestamp=new Date(lastSaveTime).toISOString();
  const results=await Promise.allSettled(active.map(store=>store.saveDocument(id,document,{...options,timestamp})));
  const failed=results.find(item=>item.status==='rejected');
  if(failed)throw failed.reason;
}

export async function exportWorkspace(){
  if(!getStorageMode().nas&&!getStorageMode().cloud)return browser.exportWorkspace();
  const projects=await listProjects(),documents=[];
  for(const project of projects)documents.push({id:project.id,createdAt:project.createdAt,updatedAt:project.updatedAt,preview:project.preview||null,document:await portableBrowser(await loadDocument(project.id))});
  const mode=getStorageMode();
  const response=await fetch(`/api/tasks?nas=${mode.nas?1:0}&cloud=${mode.cloud?1:0}`);
  const tasks=[];
  if(response.ok)for(const task of (await response.json()).tasks||[]){
    let image=null;
    if(task.imageUrl){const imageResponse=await fetch(task.imageUrl);if(imageResponse.ok){const blob=await imageResponse.blob();image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('读取任务图片失败'));reader.readAsDataURL(blob)})}}
    tasks.push({...task,image});
  }
  return {format:'canvas-studio-workspace',version:1,exportedAt:new Date().toISOString(),documents,tasks};
}
