import {bindings,failure,imageKey,json,validId} from '../../../../../../lib/canvas-store';
import {syncUser} from '../../../../../../lib/desktop-sync';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{const user=syncUser(request),{id}=await params;if(!validId(id)||id==='main')return json({error:'任务 ID 无效'},400);const {db,bucket}=bindings();const task=await db.prepare('SELECT mime_type AS mimeType FROM canvas_tasks WHERE id=? AND user_id=?').bind(id,user).first<{mimeType:string}>();if(!task)return json({error:'任务不存在'},404);const image=await bucket.get(imageKey(user,id));if(!image)return json({error:'任务图片不存在'},404);return new Response(image.body,{headers:{'Content-Type':task.mimeType||image.httpMetadata?.contentType||'image/png'}})}catch(error){return failure(error,error instanceof Error&&error.message.includes('授权')?401:500)}
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{const user=syncUser(request),{id}=await params;if(!validId(id)||id==='main')return json({error:'任务 ID 无效'},400);const {db,bucket}=bindings();const task=await db.prepare('SELECT id FROM canvas_tasks WHERE id=? AND user_id=?').bind(id,user).first();if(!task)return json({error:'任务不存在'},404);const type=request.headers.get('content-type')||'image/png';if(!['image/png','image/jpeg','image/webp'].includes(type))return json({error:'图片格式无效'},400);const bytes=await request.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>45*1024*1024)return json({error:'图片须小于 45 MB'},413);await bucket.put(imageKey(user,id),bytes,{httpMetadata:{contentType:type}});return json({ok:true})}catch(error){return failure(error,error instanceof Error&&error.message.includes('授权')?401:500)}
}
