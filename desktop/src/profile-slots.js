export const IMAGE_SLOT_COUNT=2;
export const DEFAULT_IMAGE_NAMES=['GPT IMAGE 2.6','GEMINI Banana pro'];
export const DEFAULT_TEXT_NAME='GEMINI flash 3.8';

export function fixedImageProfiles(profiles=[]){
  const source=Array.isArray(profiles)?profiles:[];
  return Array.from({length:IMAGE_SLOT_COUNT},(_,index)=>{
    const profile=source[index]||{};
    return {
      id:profile.id||crypto.randomUUID(),
      name:profile.name||DEFAULT_IMAGE_NAMES[index],
      baseUrl:profile.baseUrl||'',
      model:profile.model||'',
      key:profile.key||'',
      keyEnv:profile.keyEnv||''
    };
  });
}
