import {bindings,failure,json,validId} from '../../../../../lib/canvas-store';
import {syncUser} from '../../../../../lib/desktop-sync';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=syncUser(request),{id}=await params;if(!validId(id)||id==='main')return json({error:'无效图片'},400);
    const {bucket}=bindings(),object=await bucket.get(`users/${encodeURIComponent(user)}/assets/${id}`);
    if(!object)return json({error:'图片不存在'},404);
    return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/png','Cache-Control':'private,max-age=3600'}});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('授权')?401:500)}
}
