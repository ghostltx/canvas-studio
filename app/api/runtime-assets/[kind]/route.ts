import {bindings,failure,json} from '../../../../lib/canvas-store';
import {env} from 'cloudflare:workers';

export async function POST(request:Request,{params}:{params:Promise<{kind:string}>}){
  try{
    if(!env.CANVAS_RUNTIME_UPLOAD_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.CANVAS_RUNTIME_UPLOAD_TOKEN}`)return json({error:'无权上传运行资源'},403);
    const {kind}=await params;
    if(kind!=='model'&&kind!=='wasm')return json({error:'无效资源'},400);
    const {bucket}=bindings();
    const bytes=await request.arrayBuffer();
    if(!bytes.byteLength||bytes.byteLength>45*1024*1024)return json({error:'资源大小无效'},413);
    const key=kind==='model'?'runtime/model.onnx':'runtime/runtime.wasm';
    await bucket.put(key,bytes,{httpMetadata:{contentType:kind==='model'?'application/octet-stream':'application/wasm'}});
    return json({ok:true,bytes:bytes.byteLength});
  }catch(error){return failure(error)}
}
