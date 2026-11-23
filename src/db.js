async function api(url,options){
  const response=await fetch(url,options);
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||`云端请求失败（HTTP ${response.status}）`);
  return result;
}
const sourceForPreview=document=>{
  const nodes=document?.nodes||[];
  return nodes.filter(node=>node.type==='generate'&&node.data?.src).at(-1)?.data.src
    ||nodes.filter(node=>node.type==='image'&&node.data?.src).at(-1)?.data.src
    ||nodes.find(node=>node.data?.src)?.data.src||null;
};
const previews=new Map();
const uploaded=new Map();
async function uploadImage(src){
  if(typeof src!=='string'||!src.startsWith('data:image/'))return src;
  if(uploaded.has(src))return uploaded.get(src);
  const blob=await (await fetch(src)).blob();
  const result=await api('/api/assets',{method:'POST',headers:{'Content-Type':blob.type},body:blob});
  uploaded.set(src,result.url);
  return result.url;
}
async function portableDocument(value){
  const nodes=[];
  for(const node of value.nodes||[])nodes.push({...node,data:{...node.data,src:await uploadImage(node.data?.src),previousSrc:await uploadImage(node.data?.previousSrc)}});
  return {...value,nodes};
}
function thumbnail(source){
  if(!source)return Promise.resolve(null);
  if(previews.has(source))return Promise.resolve(previews.get(source));
  return new Promise(resolve=>{
    const image=new Image();
    image.onload=()=>{
      try{
        const canvas=document.createElement('canvas');canvas.width=480;canvas.height=300;
        const context=canvas.getContext('2d');context.fillStyle='#e9e8e5';context.fillRect(0,0,480,300);
        const scale=Math.max(480/image.naturalWidth,300/image.naturalHeight);
        context.drawImage(image,(480-image.naturalWidth*scale)/2,(300-image.naturalHeight*scale)/2,image.naturalWidth*scale,image.naturalHeight*scale);
        const data=canvas.toDataURL('image/jpeg',.72);previews.set(source,data);resolve(data);
      }catch{resolve(null)}
    };
    image.onerror=()=>resolve(null);image.src=source;
  });
}
export async function loadDocument(projectId){return api(`/api/projects/${encodeURIComponent(projectId)}`)}
export async function saveDocument(projectId,value,{touch=true}={}){
  const preview=await thumbnail(sourceForPreview(value));
  const document=await portableDocument(value);
  return api(`/api/projects/${encodeURIComponent(projectId)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...document,preview,touch})});
}
export async function createProject(){return (await api('/api/projects',{method:'POST'})).id}
export async function listProjects(){return (await api('/api/projects')).projects.map(project=>({...project,storageLocations:['cloud']}))}

export async function deleteProject(id){return api(`/api/projects/${encodeURIComponent(id)}`,{method:'DELETE'})}
