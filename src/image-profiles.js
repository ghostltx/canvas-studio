const STORAGE_KEY='canvas-api-settings';

export function loadSettings(){
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{}}catch{}
  let imageProfiles=Array.isArray(saved.imageProfiles)?saved.imageProfiles:null;
  if(!imageProfiles){
    const old=saved.image||{baseUrl:saved.baseUrl||'',key:saved.key||'',model:saved.model||''};
    imageProfiles=[{id:crypto.randomUUID(),name:old.model||'图像 API 1',baseUrl:old.baseUrl||'',model:old.model||'',key:old.key||''}];
    localStorage.setItem(STORAGE_KEY,JSON.stringify({...saved,imageProfiles,text:saved.text||{baseUrl:'',key:'',model:''}}));
  }
  return {imageProfiles:imageProfiles.map((profile,index)=>({id:profile.id||crypto.randomUUID(),name:profile.name||`图像 API ${index+1}`,baseUrl:profile.baseUrl||'',model:profile.model||'',key:profile.key||''})),text:saved.text||{baseUrl:'',key:'',model:''}};
}

export function saveSettings(settings){localStorage.setItem(STORAGE_KEY,JSON.stringify(settings))}
export function profileMetadata(settings){return settings.imageProfiles.map(({id,name,baseUrl,model})=>({id,name,baseUrl,model}))}
export function mergeRemoteProfiles(local,remote){
  const keys=new Map(local.imageProfiles.map(item=>[item.id,item.key]));
  return {...local,imageProfiles:remote.map(item=>({...item,key:keys.get(item.id)||local.imageProfiles.find(old=>old.baseUrl===item.baseUrl&&old.model===item.model)?.key||''}))};
}
export const firstImageProfile=settings=>settings.imageProfiles[0]||null;
export const selectedImageProfile=(settings,id)=>settings.imageProfiles.find(item=>item.id===id)||null;
