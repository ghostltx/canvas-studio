import {bindings,docKey,failure,json,validId} from '../../../../../lib/canvas-store';
import {syncUser} from '../../../../../lib/desktop-sync';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=syncUser(request),{id}=await params;
    if(!validId(id))return json({error:'无效的画布 ID'},400);
    const {db,bucket}=bindings();
    const owner=await db.prepare('SELECT id FROM canvas_projects WHERE id=? AND user_id=?').bind(id,user).first();
    if(!owner)return json({error:'画布不存在'},404);
    const object=await bucket.get(docKey(user,id));
    if(!object)return json({error:'画布数据丢失'},404);
    return new Response(object.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('授权')?401:500)}
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=syncUser(request),{id}=await params;
    if(!validId(id))return json({error:'无效的画布 ID'},400);
    const {db,bucket}=bindings();
    const owner=await db.prepare('SELECT id FROM canvas_projects WHERE id=? AND user_id=?').bind(id,user).first();
    if(!owner)return json({ok:true});
    await bucket.delete(docKey(user,id));
    await db.prepare('DELETE FROM canvas_projects WHERE id=? AND user_id=?').bind(id,user).run();
    return json({ok:true});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('授权')?401:500)}
}
