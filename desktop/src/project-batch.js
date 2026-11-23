import {deleteProject} from './db';

export async function deleteProjectBatch(ids,onProgress=()=>{}){
  const unique=[...new Set(ids)],deletedIds=[],failed=[];
  for(const id of unique){
    try{
      await deleteProject(id);
      deletedIds.push(id);
    }catch(error){
      failed.push({id,message:error.message||'删除失败，请重试'});
    }
    onProgress({completed:deletedIds.length+failed.length,total:unique.length});
  }
  return {deletedIds,failed};
}
