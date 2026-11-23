const DB = 'canvas-studio-v1';
const VERSION = 2;

function open() {
  return new Promise((resolve,reject) => {
    const request=indexedDB.open(DB,VERSION);
    request.onupgradeneeded=event=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('documents'))db.createObjectStore('documents');
      if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});
      if(event.oldVersion<2){
        const legacy=request.transaction.objectStore('documents').get('main');
        legacy.onsuccess=()=>{
          if(!legacy.result)return;
          const now=new Date().toISOString();
          request.transaction.objectStore('projects').put({
            id:'main',title:legacy.result.title?.trim()||'未命名画布',
            createdAt:now,updatedAt:now,nodeCount:legacy.result.nodes?.length||0,
            preview:null,previewSourceKey:null,previewUpdatedAt:null
          });
        };
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('画布数据库正在被其他页面使用，请关闭旧页面后重试'));
  });
}

function transact(db,stores,mode,work) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,mode);
    let value;
    try{work(tx,result=>{value=result})}catch(error){tx.abort();db.close();reject(error);return}
    tx.oncomplete=()=>{db.close();resolve(value)};
    tx.onerror=()=>{db.close();reject(tx.error||new Error('本地数据库操作失败'))};
    tx.onabort=()=>{db.close();reject(tx.error||new Error('本地数据库操作已取消'))};
  });
}

export async function loadDocument(projectId) {
  const db=await open();
  return transact(db,['documents'],'readonly',(tx,done)=>{
    tx.objectStore('documents').get(projectId).onsuccess=event=>done(event.target.result||null);
  });
}

export async function saveDocument(projectId,value,{touch=true}={}) {
  const db=await open();
  const now=new Date().toISOString();
  return transact(db,['documents','projects'],'readwrite',tx=>{
    tx.objectStore('documents').put(value,projectId);
    const projects=tx.objectStore('projects');
    projects.get(projectId).onsuccess=event=>{
      const previous=event.target.result||{id:projectId,createdAt:now,preview:null};
      projects.put({...previous,title:value.title?.trim()||'未命名画布',nodeCount:value.nodes?.length||0,updatedAt:touch?now:previous.updatedAt||now});
    };
  });
}

export async function createProject() {
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const document={title:'未命名画布',nodes:[],edges:[],viewport:{x:0,y:0,zoom:1}};
  const meta={id,title:document.title,createdAt:now,updatedAt:now,nodeCount:0,preview:null,previewSourceKey:null,previewUpdatedAt:null};
  const db=await open();
  await transact(db,['documents','projects'],'readwrite',tx=>{
    tx.objectStore('documents').put(document,id);
    tx.objectStore('projects').put(meta);
  });
  return id;
}

export async function deleteProject(id){
  const db=await open();
  return transact(db,['documents','projects'],'readwrite',tx=>{
    tx.objectStore('documents').delete(id);
    tx.objectStore('projects').delete(id);
  });
}

export async function upsertProject(meta,document){
  const db=await open();
  return transact(db,['documents','projects'],'readwrite',(tx,done)=>{
    const projects=tx.objectStore('projects'),documents=tx.objectStore('documents');
    projects.get(meta.id).onsuccess=event=>{
      const previous=event.target.result;
      if(previous&&previous.updatedAt>=meta.updatedAt){done(false);return}
      documents.put(document,meta.id);
      projects.put({id:meta.id,title:document.title||'未命名画布',createdAt:meta.createdAt||new Date().toISOString(),updatedAt:meta.updatedAt||new Date().toISOString(),nodeCount:document.nodes?.length||0,preview:meta.preview||null,previewSourceKey:null,previewUpdatedAt:meta.updatedAt||new Date().toISOString()});
      done(true);
    };
  });
}

async function readProjects() {
  const db=await open();
  return transact(db,['projects'],'readonly',(tx,done)=>{
    tx.objectStore('projects').getAll().onsuccess=event=>done(event.target.result||[]);
  });
}

function sourceForPreview(document) {
  const nodes=document?.nodes||[];
  return nodes.filter(node=>node.type==='generate'&&node.data?.src).at(-1)?.data.src
    || nodes.filter(node=>node.type==='image'&&node.data?.src).at(-1)?.data.src
    || nodes.find(node=>node.data?.src)?.data.src
    || null;
}

function sourceKey(source) {
  return source?.startsWith('data:')?`${source.length}:${source.slice(0,80)}:${source.slice(-80)}`:source||'';
}

function makeThumbnail(source) {
  if(!source)return Promise.resolve(null);
  return new Promise(resolve=>{
    const image=new Image();
    image.onload=()=>{
      try{
        const canvas=document.createElement('canvas');
        canvas.width=480;canvas.height=300;
        const context=canvas.getContext('2d');
        context.fillStyle='#e9e8e5';context.fillRect(0,0,480,300);
        const scale=Math.max(480/image.naturalWidth,300/image.naturalHeight);
        const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
        context.drawImage(image,(480-width)/2,(300-height)/2,width,height);
        resolve(canvas.toDataURL('image/jpeg',.72));
      }catch{resolve(null)}
    };
    image.onerror=()=>resolve(null);
    image.src=source;
  });
}

async function updatePreview(meta,preview,key) {
  const db=await open();
  await transact(db,['projects'],'readwrite',tx=>{
    const store=tx.objectStore('projects');
    store.get(meta.id).onsuccess=event=>{
      const current=event.target.result;
      if(current?.updatedAt===meta.updatedAt)store.put({...current,preview,previewSourceKey:key,previewUpdatedAt:meta.updatedAt});
    };
  });
}

export async function listProjects() {
  const projects=await readProjects();
  await Promise.allSettled(projects.filter(project=>project.previewUpdatedAt!==project.updatedAt).map(async project=>{
    const document=await loadDocument(project.id);
    if(!document)return;
    const source=sourceForPreview(document),key=sourceKey(source);
    const preview=key===project.previewSourceKey?project.preview:await makeThumbnail(source);
    await updatePreview(project,preview,key);
  }));
  return (await readProjects()).sort((a,b)=>Date.parse(b.updatedAt||0)-Date.parse(a.updatedAt||0));
}

const blobData=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('读取图片失败'));reader.readAsDataURL(blob)});
async function portableImage(src){
  if(!src||src.startsWith('data:'))return src;
  if(src.startsWith('/api/tasks/')){
    const response=await fetch(src);
    if(!response.ok)throw new Error('无法导出一张任务图片，请检查本地任务服务');
    return blobData(await response.blob());
  }
  return src;
}
export async function exportWorkspace(){
  const projects=await readProjects();
  const documents=[];
  for(const project of projects){
    const document=await loadDocument(project.id);
    if(!document)continue;
    const nodes=[];
    for(const node of document.nodes||[])nodes.push({...node,data:{...node.data,src:await portableImage(node.data?.src)}});
    documents.push({id:project.id,createdAt:project.createdAt,updatedAt:project.updatedAt,preview:project.preview||null,document:{...document,nodes}});
  }
  let tasks=[];
  const response=await fetch('/api/tasks');
  if(response.ok){
    const list=(await response.json()).tasks||[];
    for(const task of list)tasks.push({...task,image:task.imageUrl?await portableImage(task.imageUrl):null});
  }
  return {format:'canvas-studio-workspace',version:1,exportedAt:new Date().toISOString(),documents,tasks};
}
