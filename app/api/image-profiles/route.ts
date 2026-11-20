import {bindings,failure,json,userId} from '../../../lib/canvas-store';

const key=(user:string)=>`users/${encodeURIComponent(user)}/image-profiles.json`;
const clean=(items:any)=>{
  if(!Array.isArray(items)||items.length>30)throw new Error('图像 API 配置数量无效');
  return items.map((item:any)=>({id:String(item.id||'').slice(0,80),name:String(item.name||'').slice(0,80),baseUrl:String(item.baseUrl||'').slice(0,500),model:String(item.model||'').slice(0,120)}));
};
export async function GET(request:Request){
  try{const user=userId(request),{bucket}=bindings(),object=await bucket.get(key(user));return json({profiles:object?clean(await object.json()):[]})}
  catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:500)}
}
export async function PUT(request:Request){
  try{const user=userId(request),{bucket}=bindings(),input=await request.json() as any,profiles=clean(input.profiles);await bucket.put(key(user),JSON.stringify(profiles),{httpMetadata:{contentType:'application/json'}});return json({profiles})}
  catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:400)}
}
