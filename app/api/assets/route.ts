import {bindings,failure,json,userId} from '../../../lib/canvas-store';

export async function POST(request:Request){
  try{
    const user=userId(request),{bucket}=bindings();
    const type=request.headers.get('content-type')||'';
    if(!['image/png','image/jpeg','image/webp'].includes(type))return json({error:'只支持 PNG、JPEG、WebP 图片'},400);
    const bytes=await request.arrayBuffer();
    if(!bytes.byteLength||bytes.byteLength>45*1024*1024)return json({error:'图片须小于 45 MB'},413);
    const id=crypto.randomUUID();
    await bucket.put(`users/${encodeURIComponent(user)}/assets/${id}`,bytes,{httpMetadata:{contentType:type}});
    return json({url:`/api/assets/${id}`},201);
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:500)}
}
