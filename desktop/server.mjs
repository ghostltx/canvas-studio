import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,writeFile,readdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {constants as fsConstants} from 'node:fs';
import {dataDirectory,localConfig,openProjectStore} from './server-store.mjs';

const legacyTaskDir=join(fileURLToPath(new URL('.', import.meta.url)), 'data', 'tasks');
const config=await localConfig();
const dataRoot=await dataDirectory(config);
let projectStore=null;
const getProjectStore=async()=>projectStore||(projectStore=await openProjectStore(dataRoot));
const taskDir = process.env.CANVAS_TASK_DIR || join(homedir(),'.canvas-studio','data','tasks');
const taskIndex = join(taskDir, 'index.json');
await mkdir(taskDir,{recursive:true});
if(!process.env.CANVAS_TASK_DIR){
  for(const source of [legacyTaskDir]){
    if(source===taskDir)continue;
    for(const name of await readdir(source).catch(()=>[])){
      if(!/^(index\.json|[0-9a-f-]{36}\.image)$/.test(name))continue;
      await copyFile(join(source,name),join(taskDir,name),fsConstants.COPYFILE_EXCL).catch(error=>{if(error.code!=='EEXIST')throw error});
    }
  }
}
let tasks = [];
try { tasks = JSON.parse(await readFile(taskIndex,'utf8')); } catch {}
tasks = tasks.map(task=>task.status==='running'?{...task,status:'error',error:'本地服务重启时任务仍在运行，无法从该图像 API 找回结果。',finishedAt:new Date().toISOString()}:task);
let writeQueue = Promise.resolve();
function persistTasks() {
  const snapshot = JSON.stringify(tasks);
  writeQueue = writeQueue.catch(()=>{}).then(async()=>{
    const temporary = taskIndex+'.tmp';
    await writeFile(temporary,snapshot);
    await rename(temporary,taskIndex);
  });
  return writeQueue;
}
await persistTasks();
const publicTask = task => ({...task,imageUrl:task.status==='completed'?'/api/tasks/'+task.id+'/image':null});

const MAX_BODY = 45 * 1024 * 1024;
const assetDir=join(dataRoot,'assets');
const availableEnvNames=()=>Object.keys(process.env).filter(name=>/(?:KEY|TOKEN|SECRET|API|OPENAI|GROK|LUX)/i.test(name)&&typeof process.env[name]==='string'&&process.env[name].length>0).sort();
const localOrigin=req=>(!req.headers.origin||/^http:\/\/(?:127\.0\.0\.1|localhost):(?:5173|4174)$/.test(req.headers.origin))&&(!req.headers['sec-fetch-site']||['same-origin','none'].includes(req.headers['sec-fetch-site']));
function resolveRequestKey(request){
  if(!request.keyEnv)return request;
  const name=String(request.keyEnv);
  if(!availableEnvNames().includes(name))throw new Error(`本地环境变量 ${name} 未找到；设置后请重启本地服务`);
  return {...request,key:process.env[name]};
}
const send = (res, status, body) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); };
const apiError = result => {
  const value = result?.error?.message || result?.error || result?.message || result?.detail;
  return typeof value === 'string' ? value : value ? JSON.stringify(value) : null;
};
const readBody = async req => {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new Error('图片过大，请使用小于 45 MB 的输入'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};
const readBinary=async req=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw new Error('图片过大，请使用小于 45 MB 的输入');chunks.push(chunk)}return Buffer.concat(chunks)};
async function cloudProxy(req,res){
  const cloud=config.cloud;
  if(!cloud?.baseUrl||!cloud?.bypassToken||!cloud?.syncToken)return send(res,503,{error:'Cloudflare 同步尚未在本机配置'});
  const path=req.url.slice('/api/cloud'.length);
  if(!/^\/(?:status|projects(?:\/(?:[0-9a-f-]{36}|main))?|assets(?:\/[0-9a-f-]{36})?|tasks(?:\/[0-9a-f-]{36}\/image)?)$/i.test(path))return send(res,404,{error:'云端接口不存在'});
  if(!localOrigin(req))return send(res,403,{error:'只允许本地画布使用云端同步'});
  try{
    const headers={'OAI-Sites-Authorization':`Bearer ${cloud.bypassToken}`,'X-Canvas-Sync-Token':cloud.syncToken};
    let body;
    if(req.method==='POST'){body=await readBinary(req);headers['Content-Type']=req.headers['content-type']||'application/json'}
    const remote=await fetch(new URL(`/api/desktop-sync${path}`,cloud.baseUrl),{method:req.method,headers,body,signal:AbortSignal.timeout(120000)});
    const bytes=Buffer.from(await remote.arrayBuffer());
    res.writeHead(remote.status,{'Content-Type':remote.headers.get('content-type')||'application/json','Content-Length':bytes.length,'Cache-Control':'no-store'});
    return res.end(bytes);
  }catch(error){return send(res,502,{error:error.message||'无法连接 Cloudflare 画布'})}
}
async function cloudApi(path,{method='GET',body,type='application/json'}={}){
  const cloud=config.cloud;
  if(!cloud?.baseUrl||!cloud?.bypassToken||!cloud?.syncToken)throw new Error('Cloudflare 同步尚未在本机配置');
  const response=await fetch(new URL(`/api/desktop-sync${path}`,cloud.baseUrl),{method,headers:{'OAI-Sites-Authorization':`Bearer ${cloud.bypassToken}`,'X-Canvas-Sync-Token':cloud.syncToken,...(body?{'Content-Type':type}:{})},body,signal:AbortSignal.timeout(120000)});
  if(!response.ok){let error;try{error=(await response.json()).error}catch{}throw new Error(error||`Cloudflare 同步失败（HTTP ${response.status}）`)}
  return response;
}
const imageBlob = dataUrl => {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.*)$/s.exec(dataUrl || '');
  if (!match) throw new Error('参考图格式须为 PNG、JPEG 或 WebP');
  return new Blob([Buffer.from(match[2], 'base64')], {type:match[1]});
};
function targetUrl(baseUrl, kind) {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API 地址只支持 HTTP 或 HTTPS');
  let path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/images/generations') || path.endsWith('/images/edits')) path = path.replace(/\/images\/(generations|edits)$/, '');
  url.pathname = `${path}/images/${kind}`.replace(/\/+/g, '/');
  url.search = '';
  return url;
}
function chatUrl(baseUrl) {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('文本 API 地址只支持 HTTP 或 HTTPS');
  let path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/chat/completions')) path = path.slice(0, -'/chat/completions'.length);
  url.pathname = `${path}/chat/completions`.replace(/\/+/g, '/');
  url.search = '';
  return url;
}
function validImageSize(value) {
  if (value === 'auto') return true;
  if (value === '1920x1080') return true;
  const match = /^(\d+)x(\d+)$/.exec(value || '');
  if (!match) return false;
  const w = Number(match[1]), h = Number(match[2]);
  return w % 16 === 0 && h % 16 === 0 && w <= 3840 && h <= 3840 && w / h >= 1 / 3 && w / h <= 3 && w * h >= 655360 && w * h <= 8294400;
}
function validateImageRequest({baseUrl,key,model,prompt,images=[],mask,size='1024x1024'}) {
  if (!baseUrl || !key || !model || !prompt?.trim()) throw new Error('请填写 API 地址、密钥、模型和提示词');
  if (!Array.isArray(images) || images.length > 8) throw new Error('参考图最多 8 张');
  if (!validImageSize(size)) throw new Error('图像尺寸不符合 4K 像素与比例限制');
  images.forEach(imageBlob);
  if(mask){if(!images.length||!mask.startsWith('data:image/png;base64,'))throw new Error('蒙版必须是与原图同尺寸的 PNG');imageBlob(mask)}
  targetUrl(baseUrl,images.length?'edits':'generations');
}
async function generateImage({baseUrl,key,model,prompt,images=[],mask,size='1024x1024'}) {
  validateImageRequest({baseUrl,key,model,prompt,images,mask,size});
  const edited = images.length > 0;
  const headers = {Authorization:'Bearer '+key};
  let body;
  if (edited) {
    const form = new FormData();
    form.append('model',model); form.append('prompt',prompt); form.append('size',size);
    images.forEach((src,i) => form.append('image[]',imageBlob(src),'reference-'+(i+1)+'.png'));
    if(mask)form.append('mask',imageBlob(mask),'mask.png');
    body = form;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({model,prompt,size,n:1});
  }
  const upstream = await fetch(targetUrl(baseUrl,edited?'edits':'generations'),{method:'POST',headers,body,signal:AbortSignal.timeout(1200000)});
  const raw = await upstream.text();
  let result; try { result = JSON.parse(raw); } catch { throw new Error('API 返回了非 JSON 响应（HTTP '+upstream.status+'）'); }
  if (!upstream.ok || result?.error) throw new Error(apiError(result) || 'API 请求失败（HTTP '+upstream.status+'）');
  const item = result?.data?.[0] || result?.images?.[0];
  let src = item?.b64_json ? 'data:image/png;base64,'+item.b64_json : item?.url || item?.image_url;
  if (src?.startsWith('http')) {
    const fetched = await fetch(src,{signal:AbortSignal.timeout(180000)});
    if (!fetched.ok) throw new Error('生成成功，但图片下载失败');
    const bytes = Buffer.from(await fetched.arrayBuffer());
    src = 'data:'+(fetched.headers.get('content-type') || 'image/png')+';base64,'+bytes.toString('base64');
  }
  if (!src?.startsWith('data:image/')) throw new Error(apiError(result) || 'API 响应中没有可用图片');
  return src;
}
async function runTask(task,request) {
  try {
    const src = await generateImage(request);
    const match = /^data:(image\/(?:png|jpeg|webp));base64,(.*)$/s.exec(src);
    if (!match) throw new Error('API 返回的图片格式不受支持');
    await writeFile(join(taskDir,task.id+'.image'),Buffer.from(match[2],'base64'));
    task.mimeType = match[1];
    task.status = 'completed';
    task.finishedAt = new Date().toISOString();
  } catch (error) {
    task.status = 'error';
    task.error = error.message || '生成失败';
    task.finishedAt = new Date().toISOString();
  }
  try { await persistTasks(); } catch (error) { console.error('Failed to save task state:',error); }
  try{await syncTask(task,request.storageMode||{},task.status==='completed'?await readFile(join(taskDir,task.id+'.image')):null)}catch(error){console.error('Task sync failed:',error.message)}
}
async function syncTask(task,mode,bytes){
  const record={...task,canvasId:task.canvasId||'main'};
  if(mode.nas){const store=await getProjectStore();store.upsertTask(record);if(bytes)await store.putTaskImage(task.id,bytes)}
  if(mode.cloud){await cloudApi('/tasks',{method:'POST',body:JSON.stringify(record)});if(bytes)await cloudApi(`/tasks/${task.id}/image`,{method:'POST',body:bytes,type:task.mimeType||'image/png'})}
}
async function combinedTasks(mode){
  const merged=new Map(tasks.map(task=>[task.id,{...task,imageUrl:task.status==='completed'?`/api/tasks/${task.id}/image`:null}]));
  const add=(task,url)=>{const old=merged.get(task.id);if(!old||old.status==='running'&&task.status!=='running'||Date.parse(task.finishedAt||0)>Date.parse(old.finishedAt||0))merged.set(task.id,{...task,imageUrl:task.status==='completed'?url:null})};
  if(mode.nas){for(const task of (await getProjectStore()).listTasks())add(task,`/api/nas/tasks/${task.id}/image`)}
  if(mode.cloud){const {tasks:remote}=await(await cloudApi('/tasks')).json();for(const task of remote)add(task,`/api/cloud/tasks/${task.id}/image`)}
  return [...merged.values()].sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0));
}
async function syncTaskHistory(mode){
  const local=new Map(tasks.map(task=>[task.id,{source:'local',task}]));
  const nasTasks=mode.nas?(await getProjectStore()).listTasks():[];
  const cloudTasks=mode.cloud?(await(await cloudApi('/tasks')).json()).tasks:[];
  const newest=new Map(local);
  for(const [source,items] of [['nas',nasTasks],['cloud',cloudTasks]])for(const task of items){const old=newest.get(task.id)?.task;if(!old||old.status==='running'&&task.status!=='running'||Date.parse(task.finishedAt||0)>Date.parse(old.finishedAt||0))newest.set(task.id,{source,task})}
  const bySource={nas:new Map(nasTasks.map(task=>[task.id,task])),cloud:new Map(cloudTasks.map(task=>[task.id,task]))};
  let localChanged=false;
  for(const {source,task} of newest.values()){
    const localTask=local.get(task.id)?.task;
    const needsLocal=!localTask||localTask.status!==task.status&&task.status!=='running';
    const needsNas=mode.nas&&(!bySource.nas.has(task.id)||bySource.nas.get(task.id).status!==task.status);
    const needsCloud=mode.cloud&&(!bySource.cloud.has(task.id)||bySource.cloud.get(task.id).status!==task.status);
    if(!needsLocal&&!needsNas&&!needsCloud)continue;
    let bytes=null;
    if(task.status==='completed'){
      if(source==='local')bytes=await readFile(join(taskDir,task.id+'.image'));
      else if(source==='nas')bytes=await(await getProjectStore()).getTaskImage(task.id);
      else bytes=Buffer.from(await(await cloudApi(`/tasks/${task.id}/image`)).arrayBuffer());
    }
    if(needsNas)await syncTask(task,{nas:true},bytes);
    if(needsCloud)await syncTask(task,{cloud:true},bytes);
    if(needsLocal){const index=tasks.findIndex(item=>item.id===task.id);if(index>=0)tasks[index]=task;else tasks.push(task);if(bytes)await writeFile(join(taskDir,task.id+'.image'),bytes);localChanged=true}
  }
  if(localChanged)await persistTasks();
}
http.createServer(async (req,res) => {
  if (req.url === '/api/health') return send(res,200,{ok:true});
  if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&!localOrigin(req))return send(res,403,{error:'只允许从本地画布提交 API 请求'});
  if(req.url?.startsWith('/api/cloud/'))return cloudProxy(req,res);
  if(req.method==='GET'&&req.url==='/api/storage'){try{const projects=await getProjectStore();return send(res,200,{kind:'sqlite',location:dataRoot,integrity:projects.integrity()?'ok':'error'})}catch(error){return send(res,503,{error:error.message||'NAS 不可用'})}}
  if(req.method==='GET'&&req.url==='/api/projects'){try{return send(res,200,{projects:(await getProjectStore()).list()})}catch(error){return send(res,503,{error:error.message||'NAS 不可用'})}}
  if(req.method==='POST'&&req.url==='/api/projects'){try{return send(res,201,{id:(await getProjectStore()).create()})}catch(error){return send(res,503,{error:error.message||'NAS 不可用'})}}
  if(req.method==='POST'&&req.url==='/api/projects/migrate'){
    try{const input=await readBody(req),{id,document}=input;if(!/^(?:[0-9a-f-]{36}|main)$/i.test(id||'')||!document||!Array.isArray(document.edges)||!Array.isArray(document.nodes)||typeof document.title!=='string')throw new Error('迁移画布格式无效');return send(res,200,{written:(await getProjectStore()).migrate(input)})}catch(error){return send(res,400,{error:error.message||'迁移失败'})}
  }
  const projectMatch=/^\/api\/projects\/([0-9a-f-]{36}|main)$/i.exec(req.url||'');
  if(projectMatch&&req.method==='DELETE'){try{(await getProjectStore()).delete(projectMatch[1]);return send(res,200,{ok:true})}catch(error){return send(res,503,{error:error.message||'删除画布失败'})}}
  if(projectMatch&&req.method==='GET'){try{const document=(await getProjectStore()).get(projectMatch[1]);return document?send(res,200,document):send(res,404,{error:'画布不存在'})}catch(error){return send(res,503,{error:error.message||'NAS 不可用'})}}
  if(projectMatch&&req.method==='PUT'){
    try{const input=await readBody(req);if(!Array.isArray(input.nodes)||!Array.isArray(input.edges)||typeof input.title!=='string')throw new Error('画布数据格式无效');const {preview,touch,...document}=input;return (await getProjectStore()).save(projectMatch[1],document,{preview,touch})?send(res,200,{ok:true}):send(res,404,{error:'画布不存在'})}catch(error){return send(res,400,{error:error.message||'保存画布失败'})}
  }
  if(req.method==='POST'&&req.url==='/api/assets'){
    try{const type=(req.headers['content-type']||'').split(';')[0],ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'})[type];if(!ext)throw new Error('只支持 PNG、JPEG 或 WebP 图片');const bytes=await readBinary(req);if(!bytes.length)throw new Error('图片为空');await mkdir(assetDir,{recursive:true});const id=randomUUID(),filename=`${id}.${ext}`;await writeFile(join(assetDir,filename),bytes,{flag:'wx'});return send(res,201,{url:`/api/assets/${filename}`})}catch(error){return send(res,400,{error:error.message||'保存图片失败'})}
  }
  const assetMatch=/^\/api\/assets\/([0-9a-f-]{36})\.(png|jpg|webp)$/i.exec(req.url||'');
  if(req.method==='GET'&&assetMatch){try{const bytes=await readFile(join(assetDir,`${assetMatch[1]}.${assetMatch[2]}`));res.writeHead(200,{'Content-Type':({'png':'image/png','jpg':'image/jpeg','webp':'image/webp'})[assetMatch[2].toLowerCase()],'Content-Length':bytes.length,'Cache-Control':'public,max-age=31536000,immutable'});return res.end(bytes)}catch{return send(res,404,{error:'图片不存在'})}}
  if(req.method==='GET'&&req.url==='/api/env-keys')return localOrigin(req)?send(res,200,{names:availableEnvNames()}):send(res,403,{error:'只允许从本地画布读取环境变量名称'});
  if(req.method==='POST'&&req.url==='/api/env-keys/resolve'){
    if(!localOrigin(req))return send(res,403,{error:'只允许从本地画布导出环境变量'});
    try{const {names}=await readBody(req);if(!Array.isArray(names)||names.length>30)throw new Error('环境变量列表无效');const available=new Set(availableEnvNames()),values={};for(const name of names){if(!available.has(name))throw new Error(`本地环境变量 ${name} 未找到；设置后请重启本地服务`);values[name]=process.env[name]}return send(res,200,{values})}catch(error){return send(res,400,{error:error.message||'读取环境变量失败'})}
  }
  if (req.method === 'GET' && /^\/api\/tasks(?:\?(?:nas|cloud)=[01].*)?$/.test(req.url||'')){
    try{const query=new URL(req.url,'http://localhost').searchParams;return send(res,200,{tasks:await combinedTasks({nas:query.get('nas')==='1',cloud:query.get('cloud')==='1'})})}catch(error){return send(res,503,{error:error.message||'任务记录读取失败'})}
  }
  if(req.method==='POST'&&req.url==='/api/tasks/sync'){
    try{const mode=await readBody(req);await syncTaskHistory({nas:mode.nas===true,cloud:mode.cloud===true});return send(res,200,{ok:true})}catch(error){return send(res,503,{error:error.message||'任务同步失败'})}
  }
  const nasImageMatch=/^\/api\/nas\/tasks\/([0-9a-f-]{36})\/image$/i.exec(req.url||'');
  if(req.method==='GET'&&nasImageMatch){try{const store=await getProjectStore(),task=store.listTasks().find(item=>item.id===nasImageMatch[1]);if(!task)return send(res,404,{error:'任务不存在'});const image=await store.getTaskImage(task.id);res.writeHead(200,{'Content-Type':task.mimeType||'image/png','Content-Length':image.length});return res.end(image)}catch{return send(res,404,{error:'任务图片不存在'})}}
  const imageMatch = /^\/api\/tasks\/([0-9a-f-]{36})\/image$/.exec(req.url || '');
  if (req.method === 'GET' && imageMatch) {
    const task = tasks.find(item=>item.id===imageMatch[1]);
    if (!task || task.status!=='completed') return send(res,404,{error:'任务图片不存在'});
    try {
      const image = await readFile(join(taskDir,task.id+'.image'));
      res.writeHead(200,{'Content-Type':task.mimeType||'image/png','Content-Length':image.length,'Cache-Control':'public, max-age=31536000, immutable'});
      return res.end(image);
    } catch { return send(res,404,{error:'任务图片文件不存在'}); }
  }
  if (req.method === 'POST' && req.url === '/api/tasks') {
    try {
      const request = resolveRequestKey(await readBody(req));
      validateImageRequest(request);
      const task = {
        id:randomUUID(),canvasId:String(request.canvasId||'main'),nodeId:String(request.nodeId||''),nodeTitle:String(request.nodeTitle||'生成图像').slice(0,80),
        canvasTitle:String(request.canvasTitle||'未命名画布').slice(0,80),promptPreview:request.prompt.trim().slice(0,140),
        model:request.model,size:request.size||'1024x1024',operation:String(request.operation||'generate'),status:'running',createdAt:new Date().toISOString()
      };
      tasks.push(task);
      await persistTasks();
      send(res,202,{task:publicTask(task)});
      void syncTask(task,request.storageMode||{},null).catch(error=>console.error('Task submission sync failed:',error.message));
      void runTask(task,request);
      return;
    } catch (error) { return send(res,400,{error:error.message||'提交任务失败'}); }
  }
  if (req.url === '/api/reverse' && req.method === 'POST') {
    try {
      const {baseUrl,key,model,images=[]} = resolveRequestKey(await readBody(req));
      if (!baseUrl || !key || !model || !Array.isArray(images) || !images.length || images.length > 8) return send(res,400,{error:'请配置文本 API，并连接 1 至 8 张图片'});
      images.forEach(imageBlob);
      const content = [{type:'text',text:'请按 5S 方法观察图片：先判断任务目标，再分析 Subject 主体、Style 风格、Shot 镜头与构图、Setting 场景环境、Scene lighting 光照与影调。只写可见事实；无法确认的细节不要当成事实，画面文字须准确保留。将分析整合成一段可直接生图的英文提示词；只输出提示词正文，不要标题、编号、分析或 Markdown 代码块。'},...images.map(src=>({type:'image_url',image_url:{url:src}}))];
      const upstream = await fetch(chatUrl(baseUrl),{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content}]}),signal:AbortSignal.timeout(180000)});
      const raw = await upstream.text();
      let result; try { result = JSON.parse(raw); } catch { throw new Error(`文本 API 返回了非 JSON 响应（HTTP ${upstream.status}）`); }
      if (!upstream.ok || result?.error) return send(res,upstream.ok?502:upstream.status,{error:apiError(result) || `文本 API 请求失败（HTTP ${upstream.status}）`});
      const answer = result?.choices?.[0]?.message?.content;
      const text = typeof answer === 'string' ? answer : Array.isArray(answer) ? answer.filter(part=>part.type==='text').map(part=>part.text).join('\n') : '';
      if (!text.trim()) throw new Error('文本 API 没有返回可用的提示词');
      return send(res,200,{text:text.trim()});
    } catch (error) { return send(res,500,{error:error.message || '反推失败'}); }
  }
  if (req.url === '/api/optimize' && req.method === 'POST') {
    try {
      const {baseUrl,key,model,prompt} = resolveRequestKey(await readBody(req));
      if (!baseUrl || !key || !model) return send(res,400,{error:'请先配置文本 API 地址、密钥和模型'});
      if (typeof prompt !== 'string' || !prompt.trim()) return send(res,400,{error:'请先在文字框写下想要的画面'});
      if (prompt.length > 4000) return send(res,400,{error:'原始提示词请控制在 4000 字以内'});
      const messages = [
        {role:'system',content:'你是图像生成提示词编辑。把用户的简短想法扩写成一段可直接用于生图的详细中文提示词。保留用户明确指定的主体、动作、风格、构图、颜色、文字和限制；围绕主体、风格、镜头构图、场景环境、光照影调补充具体可视细节，缺失项可做合理创作，但不要改变原意。只输出最终提示词，不加标题、分析、编号或代码块。'},
        {role:'user',content:prompt.trim()}
      ];
      const upstream = await fetch(chatUrl(baseUrl),{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages}),signal:AbortSignal.timeout(180000)});
      const raw = await upstream.text();
      let result; try { result = JSON.parse(raw); } catch { throw new Error(`文本 API 返回了非 JSON 响应（HTTP ${upstream.status}）`); }
      if (!upstream.ok || result?.error) return send(res,upstream.ok?502:upstream.status,{error:apiError(result) || `文本 API 请求失败（HTTP ${upstream.status}）`});
      const answer = result?.choices?.[0]?.message?.content;
      const text = typeof answer === 'string' ? answer : Array.isArray(answer) ? answer.filter(part=>part.type==='text').map(part=>part.text).join('\n') : '';
      if (!text.trim()) throw new Error('文本 API 没有返回可用的提示词');
      return send(res,200,{text:text.trim()});
    } catch (error) { return send(res,500,{error:error.message || '优化提示词失败'}); }
  }
  if (req.url !== '/api/generate' || req.method !== 'POST') return send(res,404,{error:'Not found'});
  try {
    const image = await generateImage(resolveRequestKey(await readBody(req)));
    return send(res,200,{image});
  } catch (error) { return send(res,500,{error:error.message || '生成失败'}); }
}).listen(Number(process.env.CANVAS_API_PORT || 4174),'127.0.0.1',()=>console.log('API proxy ready'));
