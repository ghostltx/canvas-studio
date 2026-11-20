type ImageRequest={baseUrl:string,key:string,model:string,prompt:string,images?:string[],size?:string};
type TextRequest={baseUrl:string,key:string,model:string,images:string[]};
type OptimizeRequest={baseUrl:string,key:string,model:string,prompt:string};

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
  const response=await fetch(endpoint(baseUrl,images.length?'edits':'generations'),{method:'POST',headers,body,signal:AbortSignal.timeout(1200000)});
  let result:any;try{result=await response.json()}catch{throw new Error(`图像 API 返回了非 JSON 响应（HTTP ${response.status}）`)}
  if(!response.ok||result?.error)throw new Error(apiError(result)||`图像 API 请求失败（HTTP ${response.status}）`);
  const item=result?.data?.[0]||result?.images?.[0];
  let image=item?.b64_json?`data:image/png;base64,${item.b64_json}`:item?.url||item?.image_url;
  if(image?.startsWith('http')){
    const downloaded=await fetch(image,{signal:AbortSignal.timeout(180000)});
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
  const content=[{type:'text',text:'请按 5S 方法观察图片：先判断任务目标，再分析 Subject 主体、Style 风格、Shot 镜头与构图、Setting 场景环境、Scene lighting 光照与影调。只写可见事实；无法确认的细节不要当成事实，画面文字须准确保留。将分析整合成一段可直接生图的英文提示词；只输出提示词正文，不要标题、编号、分析或 Markdown 代码块。'},...images.map(src=>({type:'image_url',image_url:{url:src}}))];
  const response=await fetch(endpoint(baseUrl,'chat/completions'),{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content}]}),signal:AbortSignal.timeout(180000)});
  let result:any;try{result=await response.json()}catch{throw new Error(`文本 API 返回了非 JSON 响应（HTTP ${response.status}）`)}
  if(!response.ok||result?.error)throw new Error(apiError(result)||`文本 API 请求失败（HTTP ${response.status}）`);
  const answer=result?.choices?.[0]?.message?.content;
  const text=typeof answer==='string'?answer:Array.isArray(answer)?answer.filter(part=>part.type==='text').map(part=>part.text).join('\n'):'';
  if(!text.trim())throw new Error('文本 API 没有返回可用的提示词');
  return text.trim();
}
export async function optimizePrompt(value:OptimizeRequest){
  const {baseUrl,key,model,prompt}=value;
  if(!baseUrl||!key||!model)throw new Error('请先配置文本 API 地址、密钥和模型');
  if(typeof prompt!=='string'||!prompt.trim())throw new Error('请先在文字框写下想要的画面');
  if(prompt.length>4000)throw new Error('原始提示词请控制在 4000 字以内');
  const messages=[
    {role:'system',content:'你是图像生成提示词编辑。把用户的简短想法扩写成一段可直接用于生图的详细中文提示词。保留用户明确指定的主体、动作、风格、构图、颜色、文字和限制；围绕主体、风格、镜头构图、场景环境、光照影调补充具体可视细节，缺失项可做合理创作，但不要改变原意。只输出最终提示词，不加标题、分析、编号或代码块。'},
    {role:'user',content:prompt.trim()}
  ];
  const response=await fetch(endpoint(baseUrl,'chat/completions'),{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages}),signal:AbortSignal.timeout(180000)});
  let result:any;try{result=await response.json()}catch{throw new Error(`文本 API 返回了非 JSON 响应（HTTP ${response.status}）`)}
  if(!response.ok||result?.error)throw new Error(apiError(result)||`文本 API 请求失败（HTTP ${response.status}）`);
  const answer=result?.choices?.[0]?.message?.content;
  const text=typeof answer==='string'?answer:Array.isArray(answer)?answer.filter(part=>part.type==='text').map(part=>part.text).join('\n'):'';
  if(!text.trim())throw new Error('文本 API 没有返回可用的提示词');
  return text.trim();
}
