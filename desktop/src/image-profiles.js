import {fixedImageProfiles,DEFAULT_IMAGE_NAMES,DEFAULT_TEXT_NAME} from './profile-slots.js';

const STORAGE_KEY='canvas-api-settings';

export function loadSettings(){
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{}}catch{}
  let imageProfiles=Array.isArray(saved.imageProfiles)?saved.imageProfiles:null;
  if(!imageProfiles){
    const old=saved.image||{baseUrl:saved.baseUrl||'',key:saved.key||'',model:saved.model||''};
    imageProfiles=[{id:crypto.randomUUID(),name:old.model||'图像 API 1',baseUrl:old.baseUrl||'',model:old.model||'',key:old.key||'',keyEnv:old.keyEnv||''}];
    localStorage.setItem(STORAGE_KEY,JSON.stringify({...saved,imageProfiles,text:saved.text||{baseUrl:'',key:'',model:''}}));
  }
  if(imageProfiles.length>2&&!localStorage.getItem('canvas-api-extra-profiles-backup'))localStorage.setItem('canvas-api-extra-profiles-backup',JSON.stringify(imageProfiles.slice(2)));
  const renamed=saved.apiSlotLayoutVersion===2?imageProfiles:imageProfiles.map((profile,index)=>({
    ...profile,name:(!profile.name||profile.name===`图像 API ${index+1}`||profile.name===`生图 API ${index+1}`||index===0&&profile.name==='gpt-image-2.6-sunburst-c')?DEFAULT_IMAGE_NAMES[index]||profile.name:profile.name
  }));
  const settings={apiSlotLayoutVersion:2,imageProfiles:fixedImageProfiles(renamed),text:{name:saved.text?.name||DEFAULT_TEXT_NAME,baseUrl:saved.text?.baseUrl||'',key:saved.text?.key||'',keyEnv:saved.text?.keyEnv||'',model:saved.text?.model||''}};
  if(imageProfiles.length!==2||imageProfiles.some((profile,index)=>profile.name!==settings.imageProfiles[index].name)||!saved.text?.name||saved.apiSlotLayoutVersion!==2)localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));
  return settings;
}

export function saveSettings(settings){localStorage.setItem(STORAGE_KEY,JSON.stringify({...settings,apiSlotLayoutVersion:2,imageProfiles:fixedImageProfiles(settings.imageProfiles),text:{...settings.text,name:settings.text?.name||DEFAULT_TEXT_NAME}}))}
export function profileMetadata(settings){return fixedImageProfiles(settings.imageProfiles).map(({id,name,baseUrl,model})=>({id,name,baseUrl,model}))}
export function mergeRemoteProfiles(local,remote){
  const keys=new Map(local.imageProfiles.map(item=>[item.id,item]));
  const merged=remote.slice(0,2).map((item,index)=>{const saved=keys.get(item.id)||local.imageProfiles.find(old=>old.baseUrl===item.baseUrl&&old.model===item.model);const legacy=!item.name||item.name===`图像 API ${index+1}`||item.name===`生图 API ${index+1}`||index===0&&item.name==='gpt-image-2.6-sunburst-c';return {...item,name:legacy?saved?.name||DEFAULT_IMAGE_NAMES[index]:item.name,key:saved?.key||'',keyEnv:saved?.keyEnv||''}});
  return {...local,imageProfiles:fixedImageProfiles([...merged,...local.imageProfiles.filter(item=>!merged.some(profile=>profile.id===item.id))])};
}
export const firstImageProfile=settings=>settings.imageProfiles[0]||null;
export const selectedImageProfile=(settings,id)=>settings.imageProfiles.find(item=>item.id===id)||null;
