type ImageRequest={baseUrl:string,key:string,model:string,prompt:string,images?:string[],size?:string};
type TextRequest={baseUrl:string,key:string,model:string,images:string[]};

function endpoint(base:string,kind:'generations'|'edits'|'chat/completions'){
  const url=new URL(base);
  if(!['https:','http:'].includes(url.protocol))throw new Error('API 地址只支持 HTTP 或 HTTPS');
  let path=url.pathname.replace(/\/+$/,'').replace(/\/(images\/(generations|edits)|chat\/completions)$/,'');
  url.pathname=`${path}/${kind==='chat/completions'?kind:`images/${kind}`}`.replace(/\/+/g,'/');url.search='';
  return url.toString();
}
function imageBlob(data:string){
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]*)$/.exec(data||'');
  if(!match)throw new Error('参考图须为 PNG、JPEG 或 WebP');
  const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:match[1]});
}
function apiError(result:any){
  const value=result?.error?.message||result?.error||result?.message||result?.detail;
  return typeof value==='string'?value:value?JSON.stringify(value):null;
}
function validSize(size:string){
  if(size==='auto')return true;
  if(size==='1920x1080')return true;
  const match=/^(\d+)x(\d+)$/.exec(size);
  if(!match)return false;
  const w=+match[1],h=+match[2];
  return w%16===0&&h%16===0&&w<=3840&&h<=3840&&w/h>=1/3&&w/h<=3&&w*h>=655360&&w*h<=8294400;
}
export function validateImage(value:ImageRequest){
  const {baseUrl,key,model,prompt,images=[],size='1024x1024'}=value;
  if(!baseUrl||!key||!model||!prompt?.trim())throw new Error('请填写 API 地址、密钥、模型和提示词');
  if(!Array.isArray(images)||images.length>8)throw new Error('参考图最多 8 张');
  if(!validSize(size))throw new Error('图像尺寸不符合限制');
  images.forEach(imageBlob);endpoint(baseUrl,images.length?'edits':'generations');
}
export async function generateImage(value:ImageRequest){
  validateImage(value);
  const {baseUrl,key,model,prompt,images=[],size='1024x1024'}=value;
  const headers:Record<string,string>={Authorization:`Bearer ${key}`};
  let body:BodyInit;
  if(images.length){
    const form=new FormData();form.append('model',model);form.append('prompt',prompt);form.append('size',size);
    images.forEach((src,i)=>form.append('image[]',imageBlob(src),`reference-${i+1}.png`));body=form;
  }else{headers['Content-Type']='application/json';body=JSON.stringify({model,prompt,size,n:1})}
  const response=await fetch(endpoint(baseUrl,images.length?'edits':'generations'),{method:'POST',headers,body,signal:AbortSignal.timeout(300000)});
  let result:any;try{result=await response.json()}catch{throw new Error(`图像 API 返回了非 JSON 响应（HTTP ${response.status}）`)}
  if(!response.ok||result?.error)throw new Error(apiError(result)||`图像 API 请求失败（HTTP ${response.status}）`);
  const item=result?.data?.[0]||result?.images?.[0];
  let image=item?.b64_json?`data:image/png;base64,${item.b64_json}`:item?.url||item?.image_url;
  if(image?.startsWith('http')){
    const downloaded=await fetch(image,{signal:AbortSignal.timeout(60000)});
    if(!downloaded.ok)throw new Error('生成成功，但图片下载失败');
    return {bytes:await downloaded.arrayBuffer(),mimeType:downloaded.headers.get('content-type')||'image/png'};
  }
  if(!image?.startsWith('data:image/'))throw new Error(apiError(result)||'API 响应中没有可用图片');
  const blob=imageBlob(image);return {bytes:await blob.arrayBuffer(),mimeType:blob.type};
}
export async function reversePrompt(value:TextRequest){
  const {baseUrl,key,model,images=[]}=value;
  if(!baseUrl||!key||!model||!Array.isArray(images)||!images.length||images.length>8)throw new Error('请配置文本 API，并连接 1 至 8 张图片');
  images.forEach(imageBlob);
  const content=[{type:'text',text:'请根据所给图片反推可用于图像生成的详细中文提示词。描述主体、构图、视角、材质、环境、光照、色彩和整体风格；如有多张图，综合它们共同呈现的视觉信息。只输出可直接使用的提示词，不要说明分析过程。'},...images.map(src=>({type:'image_url',image_url:{url:src}}))];
  const response=await fetch(endpoint(baseUrl,'chat/completions'),{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content}]}),signal:AbortSignal.timeout(180000)});
  let result:any;try{result=await response.json()}catch{throw new Error(`文本 API 返回了非 JSON 响应（HTTP ${response.status}）`)}
  if(!response.ok||result?.error)throw new Error(apiError(result)||`文本 API 请求失败（HTTP ${response.status}）`);
  const answer=result?.choices?.[0]?.message?.content;
  const text=typeof answer==='string'?answer:Array.isArray(answer)?answer.filter(part=>part.type==='text').map(part=>part.text).join('\n'):'';
  if(!text.trim())throw new Error('文本 API 没有返回可用的提示词');
  return text.trim();
}
