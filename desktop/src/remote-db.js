async function jsonRequest(url,options){
  const response=await fetch(url,options);
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||`存储请求失败（HTTP ${response.status}）`);
  return result;
}

const sourceForPreview=document=>{
  const nodes=document?.nodes||[];
  return nodes.filter(node=>node.type==='generate'&&node.data?.src).at(-1)?.data.src
    ||nodes.filter(node=>node.type==='image'&&node.data?.src).at(-1)?.data.src
    ||nodes.find(node=>node.data?.src)?.data.src||null;
};

function thumbnail(source){
  if(!source)return Promise.resolve(null);
  return new Promise(resolve=>{
    const image=new Image();
    image.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=480;canvas.height=300;const ctx=canvas.getContext('2d');ctx.fillStyle='#e9e8e5';ctx.fillRect(0,0,480,300);const scale=Math.max(480/image.naturalWidth,300/image.naturalHeight);ctx.drawImage(image,(480-image.naturalWidth*scale)/2,(300-image.naturalHeight*scale)/2,image.naturalWidth*scale,image.naturalHeight*scale);resolve(canvas.toDataURL('image/jpeg',.72))}catch{resolve(null)}};
    image.onerror=()=>resolve(null);image.src=source;
  });
}

export function remoteStore(kind){
  const cloud=kind==='cloud',prefix=cloud?'/api/cloud':'/api';
  const cacheKey=`canvas-asset-map-${kind}`;
  let saved={};try{saved=JSON.parse(localStorage.getItem(cacheKey)||'{}')}catch{}
  const uploads=new Map(Object.entries(saved));
  const remember=(source,url)=>{uploads.set(source,url);if(source.startsWith('/api/')){saved[source]=url;try{localStorage.setItem(cacheKey,JSON.stringify(saved))}catch{}}};
  const localImage=src=>cloud&&typeof src==='string'&&src.startsWith('/api/assets/')?`/api/cloud${src.slice(4)}`:src;
  const nativeImage=src=>cloud&&typeof src==='string'&&src.startsWith('/api/cloud/assets/')?`/api${src.slice('/api/cloud'.length)}`:src;
  async function uploadImage(src){
    if(typeof src!=='string'||!src)return src;
    if(cloud&&src.startsWith('/api/cloud/assets/'))return nativeImage(src);
    if(!cloud&&src.startsWith('/api/assets/'))return src;
    if(!src.startsWith('data:image/')&&!src.startsWith('/api/'))return src;
    if(uploads.has(src))return uploads.get(src);
    const source=await fetch(src),blob=await source.blob();
    if(!source.ok)throw new Error('读取画布图片失败');
    const result=await jsonRequest(`${prefix}/assets`,{method:'POST',headers:{'Content-Type':blob.type},body:blob});
    remember(src,result.url);
    return result.url;
  }
  async function portable(document){
    const nodes=[];
    for(const node of document.nodes||[])nodes.push({...node,data:{...node.data,src:await uploadImage(node.data?.src),previousSrc:await uploadImage(node.data?.previousSrc)}});
    return {...document,nodes};
  }
  async function upsertProject(meta,document){
    const body=JSON.stringify({...meta,document:await portable(document)});
    return jsonRequest(cloud?`${prefix}/projects`:`${prefix}/projects/migrate`,{method:'POST',headers:{'Content-Type':'application/json'},body});
  }
  return {
    kind,
    verify:async()=>jsonRequest(cloud?`${prefix}/status`:'/api/storage'),
    listProjects:async()=> (await jsonRequest(`${prefix}/projects`)).projects,
    loadDocument:async id=>{const response=await fetch(`${prefix}/projects/${encodeURIComponent(id)}`);if(response.status===404)return null;const result=await response.json();if(!response.ok)throw new Error(result.error||'读取画布失败');return cloud?{...result,nodes:result.nodes.map(node=>({...node,data:{...node.data,src:localImage(node.data?.src),previousSrc:localImage(node.data?.previousSrc)}}))}:result},
    upsertProject,
    createProject:async()=>{const id=crypto.randomUUID(),now=new Date().toISOString(),document={title:'未命名画布',nodes:[],edges:[],viewport:{x:0,y:0,zoom:1}};await upsertProject({id,createdAt:now,updatedAt:now,preview:null},document);return id},
    saveDocument:async(id,document,{touch=true,timestamp=new Date().toISOString()}={})=>{
      const preview=await thumbnail(sourceForPreview(document));
      return upsertProject({id,createdAt:timestamp,updatedAt:timestamp,preview,touch},document);
    }
  };
}
