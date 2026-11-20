import {bindings,failure,json,userId,validId} from '../../../../lib/canvas-store';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=userId(request),{id}=await params;if(!validId(id)||id==='main')return json({error:'无效图片'},400);
    const {bucket}=bindings();const asset=await bucket.get(`users/${encodeURIComponent(user)}/assets/${id}`);
    if(!asset)return json({error:'图片不存在'},404);
    return new Response(asset.body,{headers:{'Content-Type':asset.httpMetadata?.contentType||'image/png','Cache-Control':'private, max-age=3600'}});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:500)}
}
