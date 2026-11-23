import {bindings,docKey,failure,json,userId,validId} from '../../../../lib/canvas-store';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=userId(request),{id}=await params;
    if(!validId(id))return json({error:'无效的画布 ID'},400);
    const {db,bucket}=bindings();
    const owner=await db.prepare('SELECT id FROM canvas_projects WHERE id=? AND user_id=?').bind(id,user).first();
    if(!owner)return json({error:'画布不存在'},404);
    const document=await bucket.get(docKey(user,id));
    if(!document)return json({error:'画布数据丢失'},404);
    return new Response(document.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:500)}
}
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=userId(request),{id}=await params;
    if(!validId(id))return json({error:'无效的画布 ID'},400);
    const {db,bucket}=bindings();
    const owner=await db.prepare('SELECT id FROM canvas_projects WHERE id=? AND user_id=?').bind(id,user).first();
    if(!owner)return json({error:'画布不存在'},404);
    const value=await request.json() as {title?:string,nodes?:unknown[],edges?:unknown[],viewport?:unknown,preview?:string|null,touch?:boolean};
    if(!Array.isArray(value.nodes)||!Array.isArray(value.edges)||typeof value.title!=='string')return json({error:'画布数据格式无效'},400);
    const body=JSON.stringify({title:value.title,nodes:value.nodes,edges:value.edges,viewport:value.viewport});
    if(body.length>90_000_000)return json({error:'单个画布超过 90 MB，请减少图片数量'},413);
    await bucket.put(docKey(user,id),body,{httpMetadata:{contentType:'application/json'}});
    const now=new Date().toISOString();
    await db.prepare('UPDATE canvas_projects SET title=?,node_count=?,preview=COALESCE(?,preview),updated_at=CASE WHEN ? THEN ? ELSE updated_at END WHERE id=? AND user_id=?').bind(value.title.trim()||'未命名画布',value.nodes.length,value.preview??null,value.touch!==false?1:0,now,id,user).run();
    return json({ok:true});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:500)}
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=userId(request),{id}=await params;
    if(!validId(id))return json({error:'无效的画布 ID'},400);
    const {db,bucket}=bindings();
    const owner=await db.prepare('SELECT id FROM canvas_projects WHERE id=? AND user_id=?').bind(id,user).first();
    if(!owner)return json({ok:true});
    await bucket.delete(docKey(user,id));
    await db.prepare('DELETE FROM canvas_projects WHERE id=? AND user_id=?').bind(id,user).run();
    return json({ok:true});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:500)}
}
