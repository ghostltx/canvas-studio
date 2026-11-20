import {bindings,failure,imageKey,json,userId,validId} from '../../../../../lib/canvas-store';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=userId(request),{id}=await params;if(!validId(id))return json({error:'无效任务'},400);
    const {db,bucket}=bindings();
    const task=await db.prepare("SELECT mime_type AS mimeType FROM canvas_tasks WHERE id=? AND user_id=? AND status='completed'").bind(id,user).first<{mimeType:string}>();
    if(!task)return json({error:'任务图片不存在'},404);
    const image=await bucket.get(imageKey(user,id));if(!image)return json({error:'任务图片文件不存在'},404);
    return new Response(image.body,{headers:{'Content-Type':task.mimeType||'image/png','Cache-Control':'private, max-age=3600'}});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:500)}
}
