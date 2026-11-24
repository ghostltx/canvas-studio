import {failure,json,userId} from '../../../lib/canvas-store';
export async function POST(request:Request){
  try{
    userId(request);
    const {baseUrl,key}=await request.json() as {baseUrl?:string,key?:string};
    if(!baseUrl?.trim()||!key?.trim())throw new Error('请先填写 Base URL 和 API Key');
    const url=new URL(baseUrl);
    if(url.protocol!=='https:'||url.username||url.password)throw new Error('在线版 API 地址须使用 HTTPS');
    url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/(?:images\/(?:generations|edits)|chat\/completions|models)$/,'')+'/models';url.search='';url.hash='';
    const response=await fetch(url.toString(),{headers:{Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(30000)});
    let result:any;try{result=await response.json()}catch{throw new Error(`模型接口返回了非 JSON 响应（HTTP ${response.status}）`)}
    if(!response.ok||result?.error){const message=result?.error?.message||result?.message;throw new Error(typeof message==='string'?message:`获取模型失败（HTTP ${response.status}）`)}
    const items=Array.isArray(result?.data)?result.data:Array.isArray(result?.models)?result.models:null;
    if(!items)throw new Error('接口未返回兼容的模型列表');
    const models=[...new Set<string>(items.map((item:any)=>typeof item==='string'?item:item?.id).filter((id:unknown):id is string=>typeof id==='string'&&!!id.trim()))].sort((a,b)=>a.localeCompare(b));
    return json({models});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:400)}
}
