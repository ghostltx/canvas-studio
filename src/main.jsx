"use client";
import React, {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {ReactFlow,ReactFlowProvider,Background,Controls,MiniMap,Handle,NodeResizer,Position,ConnectionLineType,addEdge,useNodesState,useEdgesState,useReactFlow,useUpdateNodeInternals} from '@xyflow/react';
import {Type, Image as ImageIcon, Sparkles, Settings, Palette, ChevronDown, ArrowLeft, Plus, Search, FolderOpen, Download, X, MousePointer2, Check, AlertCircle, LoaderCircle, Pencil, PenLine, Layers3} from 'lucide-react';
import '@xyflow/react/dist/style.css';
import './style.css';
import './themes.css';
import {loadDocument,saveDocument,listProjects,createProject,prepareBackup} from './db';

const CanvasContext=createContext(null);
const useCanvas=()=>useContext(CanvasContext);
const id=()=>crypto.randomUUID();
const starter=[
  {id:'welcome-text',type:'text',position:{x:180,y:170},data:{title:'你的第一个想法',text:'一座漂浮在云海之上的玻璃温室，清晨的金色阳光，电影感摄影'}},
  {id:'welcome-generate',type:'generate',position:{x:580,y:155},data:{title:'生成图像',size:'1024x1024'}},
];
const starterEdges=[{id:'welcome-link',source:'welcome-text',target:'welcome-generate',type:'default',animated:true}];
const GRID_SIZE=23;
const SNAP_GRID=[GRID_SIZE,GRID_SIZE];
const snapPosition=position=>({x:Math.round(position.x/GRID_SIZE)*GRID_SIZE,y:Math.round(position.y/GRID_SIZE)*GRID_SIZE});
const sameCanvasContent=(left,right)=>left?.title===right?.title&&left.nodes.length===right.nodes.length&&left.edges.length===right.edges.length&&left.nodes.every((node,index)=>{const other=right.nodes[index];return node.id===other.id&&node.type===other.type&&node.position.x===other.position.x&&node.position.y===other.position.y&&node.data===other.data&&node.style?.width===other.style?.width&&node.style?.height===other.style?.height})&&left.edges.every((edge,index)=>{const other=right.edges[index];return edge.id===other.id&&edge.source===other.source&&edge.target===other.target&&edge.sourceHandle===other.sourceHandle&&edge.targetHandle===other.targetHandle&&edge.type===other.type&&edge.label===other.label});
const THEMES=[
  {id:'violet',name:'清爽紫',description:'明亮 · 创作感',canvas:'#f8fafd',surface:'#ffffff',accent:'#7056df',grid:'#d7dce5',mask:'rgba(248,250,253,.75)'},
  {id:'sand',name:'奶油暖沙',description:'柔和 · 温暖',canvas:'#f5f0e8',surface:'#fffaf4',accent:'#b46a45',grid:'#dfd1c0',mask:'rgba(245,240,232,.78)'},
  {id:'ocean',name:'雾蓝海岸',description:'清透 · 沉静',canvas:'#edf5f8',surface:'#f8fcff',accent:'#277f9c',grid:'#cbdde6',mask:'rgba(237,245,248,.78)'},
  {id:'graphite',name:'石墨夜色',description:'深色 · 专注',canvas:'#161b26',surface:'#222a39',accent:'#9b8af7',grid:'#394556',mask:'rgba(22,27,38,.78)'}
];
const THEME_BY_ID=Object.fromEntries(THEMES.map(theme=>[theme.id,theme]));
const loadTheme=()=>{try{const saved=localStorage.getItem('canvas-theme');return THEMES.some(theme=>theme.id===saved)?saved:'violet'}catch{return 'violet'}};
const loadSettings=()=>{try{const old=JSON.parse(localStorage.getItem('canvas-api-settings')||'{}');return {image:old.image||{baseUrl:old.baseUrl||'',key:old.key||'',model:old.model||''},text:old.text||{baseUrl:'',key:'',model:''}}}catch{return {image:{},text:{}}}};
const saveSettings=s=>localStorage.setItem('canvas-api-settings',JSON.stringify(s));
const SIZE_PRESETS=[
  ['auto','自动'],['1024x1024','1K 正方形 · 1024 × 1024'],['1536x1024','1K 横向 3:2 · 1536 × 1024'],['1024x1536','1K 纵向 2:3 · 1024 × 1536'],
  ['2048x2048','2K 正方形 · 2048 × 2048'],['2048x1152','2K 横向 16:9 · 2048 × 1152'],['1152x2048','2K 纵向 9:16 · 1152 × 2048'],
  ['2880x2880','4K 正方形 1:1 · 2880 × 2880'],['3504x2336','4K 横向 3:2 · 3504 × 2336'],['2336x3504','4K 纵向 2:3 · 2336 × 3504'],
  ['3264x2448','4K 横向 4:3 · 3264 × 2448'],['2448x3264','4K 纵向 3:4 · 2448 × 3264'],['3840x2160','4K 横向 16:9 · 3840 × 2160'],['2160x3840','4K 纵向 9:16 · 2160 × 3840'],
  ['custom','自定义宽高…']
];
const validSize=size=>{if(size==='auto')return true;const match=/^(\d+)x(\d+)$/.exec(size||'');if(!match)return false;const w=Number(match[1]),h=Number(match[2]);return w%16===0&&h%16===0&&w<=3840&&h<=3840&&w/h>=1/3&&w/h<=3&&w*h>=655360&&w*h<=8294400};
const minGenerateHeight=data=>data.src?(data.size==='custom'?740:690):(data.size==='custom'?500:450);
const defaultNodeSize=(type,data={})=>({width:310,height:type==='text'?220:type==='image'?300:type==='lineart'||type==='depth'?460:minGenerateHeight(data)});
const isImageSource=node=>['image','generate','lineart','depth'].includes(node?.type)&&!!node.data?.src;
const isControlSource=node=>node?.type==='lineart'||node?.type==='depth';
const readFile=file=>new Promise((resolve,reject)=>{if(!file?.type?.startsWith('image/')) return reject(new Error('请选择图片文件'));const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('图片读取失败'));reader.readAsDataURL(file)});
const download=(src,name)=>{const a=document.createElement('a');a.href=src;a.download=name;a.click()};
const blobToDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('无法读取处理后的图像'));reader.readAsDataURL(blob)});
const inlineImage=async src=>{if(src?.startsWith('data:'))return src;const response=await fetch(src);if(!response.ok)throw new Error('无法读取参考图片');return blobToDataUrl(await response.blob())};
let processWorker;
const pendingProcesses=new Map();
function processLocally(mode,src) {
  if(!processWorker){
    processWorker=new Worker(new URL('./image-process.worker.js',import.meta.url),{type:'module'});
    processWorker.onmessage=async({data})=>{
      const pending=pendingProcesses.get(data.id);
      if(!pending)return;
      pendingProcesses.delete(data.id);
      if(data.error){pending.reject(new Error(data.error));return}
      try{pending.resolve(await blobToDataUrl(new Blob([data.bytes],{type:'image/png'})))}catch(error){pending.reject(error)}
    };
    processWorker.onerror=error=>{for(const pending of pendingProcesses.values())pending.reject(new Error(error.message||'本地处理程序加载失败'));pendingProcesses.clear();processWorker.terminate();processWorker=null};
  }
  return new Promise((resolve,reject)=>{const requestId=id();pendingProcesses.set(requestId,{resolve,reject});processWorker.postMessage({id:requestId,mode,src})});
}

function NodeError({message}){return message?<div className="node-error nodrag nowheel" role="alert"><AlertCircle size={15}/><span>{message}</span></div>:null}

function NodeHeader({icon,title,kind}){
  return <div className="node-header"><span className={`node-icon ${kind}`}>{icon}</span><span className="node-title" title={title||''}>{title||''}</span><span className="node-kind">{kind==='text'?'TEXT':kind==='image'?'IMAGE':kind==='lineart'?'LINE ART':kind==='depth'?'DEPTH':'GENERATE'}</span></div>;
}
function TextNode({id:nodeId,data,selected}){const {updateNode,resizeNode,reversePrompt,reversingIds,edges,nodes}=useCanvas();const textRef=useRef(null),lastInput=useRef(data.text||'');useEffect(()=>{const next=data.text||'';if(next!==lastInput.current){if(textRef.current)textRef.current.value=next;lastInput.current=next}},[data.text]);const sources=edges.filter(e=>e.target===nodeId).map(e=>nodes.find(n=>n.id===e.source)).filter(isImageSource);return <div className={`canvas-node text-node ${selected?'selected':''}`}><NodeResizer isVisible={selected} minWidth={240} minHeight={180} color="#7056df" onResizeEnd={(_,p)=>resizeNode(nodeId,p.width,p.height)}/><Handle type="target" position={Position.Left}/><NodeHeader icon={<Type size={16}/>} title={data.title} kind="text" id={nodeId}/><textarea ref={textRef} className="nodrag nowheel" placeholder={sources.length?'点击反推，根据连接的图片生成提示词…':'写下提示词…'} defaultValue={data.text||''} onChange={e=>{lastInput.current=e.target.value;updateNode(nodeId,{text:e.target.value})}}/>{sources.length>0&&<div className="reverse-actions"><span>{sources.length} 张图片已连接</span><button className="reverse-button nodrag" disabled={reversingIds.has(nodeId)} onClick={()=>reversePrompt(nodeId)}>{reversingIds.has(nodeId)?<LoaderCircle size={14} className="spin"/>:<Sparkles size={14}/>} {reversingIds.has(nodeId)?'反推中…':'反推'}</button></div>}<NodeError message={data.error}/><div className="node-footer"><span>{sources.length?'图像反推提示词':'提示词'}</span><span>拖动右侧圆点连接</span></div><Handle type="source" position={Position.Right}/></div>}
function ImageNode({id:nodeId,data,selected}){const {resizeNode}=useCanvas();return <div className={`canvas-node image-node ${selected?'selected':''}`}><NodeResizer isVisible={selected} minWidth={220} minHeight={180} color="#7056df" onResizeEnd={(_,p)=>resizeNode(nodeId,p.width,p.height)}/><Handle type="target" position={Position.Left}/><NodeHeader icon={<ImageIcon size={16}/>} title={data.title} kind="image" id={nodeId}/><div className="image-frame">{data.src?<img src={data.src} alt={data.title||'画布图片'} draggable="false"/>:<span>暂无图片</span>}</div><div className="node-footer"><span>{data.origin==='generated'?'生成结果':'参考图片'}</span><button className="icon-button nodrag" title="保存图片" onClick={()=>download(data.src,`${(data.title||'image').replace(/[\\/:*?"<>|]/g,'-')}.png`)}><Download size={15}/></button></div><Handle type="source" position={Position.Right}/></div>}
function GenerateNode({id:nodeId,data,selected}){const {updateNode,resizeNode,runGeneration,runningIds,edges,nodes}=useCanvas();const inputs=edges.filter(e=>e.target===nodeId).map(e=>nodes.find(n=>n.id===e.source)).filter(Boolean);const imageCount=inputs.filter(isImageSource).length;const hasTextInput=inputs.some(n=>n.type==='text');return <div className={`canvas-node generate-node ${data.src?'with-result':''} ${selected?'selected':''}`} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.repeat&&!e.nativeEvent.isComposing){e.preventDefault();e.stopPropagation();if(!runningIds.has(nodeId))runGeneration(nodeId)}}}><NodeResizer isVisible={selected} minWidth={300} minHeight={minGenerateHeight(data)} color="#7056df" onResizeEnd={(_,p)=>resizeNode(nodeId,p.width,p.height)}/><Handle type="target" position={Position.Left}/><NodeHeader icon={<Sparkles size={16}/>} title={data.title} kind="generate" id={nodeId}/><div className="generate-body"><label className="field-label" htmlFor={`prompt-${nodeId}`}>画面描述</label><textarea className="generate-prompt nodrag nowheel" id={`prompt-${nodeId}`} placeholder={imageCount?'描述希望如何修改参考图片…':hasTextInput?'可在这里补充左侧文字；两处内容会一起用于生成…':'描述你想生成的画面…'} value={data.prompt||''} onChange={e=>updateNode(nodeId,{prompt:e.target.value})}/><label className="field-label" htmlFor={`size-${nodeId}`}>输出尺寸</label><select className="nodrag" id={`size-${nodeId}`} value={data.size||'1024x1024'} onChange={e=>updateNode(nodeId,{size:e.target.value})}>{SIZE_PRESETS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{data.size==='custom'&&<div className="custom-size"><input className="nodrag" type="number" min="16" max="3840" step="16" value={data.customWidth||2880} aria-label="自定义宽度" onChange={e=>updateNode(nodeId,{customWidth:e.target.value})}/><span>×</span><input className="nodrag" type="number" min="16" max="3840" step="16" value={data.customHeight||2880} aria-label="自定义高度" onChange={e=>updateNode(nodeId,{customHeight:e.target.value})}/></div>}<button className="run-button nodrag" title="生成图像（Ctrl+Enter）" disabled={runningIds.has(nodeId)} onClick={()=>runGeneration(nodeId)}>{runningIds.has(nodeId)?<><LoaderCircle size={16} className="spin"/>生成中…</>:<><Sparkles size={16}/>开始生成</>}</button></div>{data.src&&<div className="generate-result"><img src={data.src} alt="生成结果" draggable="false"/></div>}<NodeError message={data.error}/><div className="node-footer"><span>{data.src?'生成结果已保存在当前节点':hasTextInput?'连接文字与本框描述会一起用于生成':'填写画面描述或连接文字后生成'}</span>{data.src&&<button className="icon-button nodrag" title="保存生成图片" onClick={()=>download(data.src,`${(data.title||'generated').replace(/[\\/:*?"<>|]/g,'-')}.png`)}><Download size={15}/></button>}</div><Handle type="source" position={Position.Right}/></div>}
function ProcessNode({id:nodeId,data,selected,mode}){
  const {resizeNode,runProcess,runningIds,edges,nodes}=useCanvas();
  const title=mode==='lineart'?'线稿':'深度图';
  const source=edges.filter(e=>e.target===nodeId).map(e=>nodes.find(n=>n.id===e.source)).filter(isImageSource).at(-1);
  const icon=mode==='lineart'?<PenLine size={16}/>:<Layers3 size={16}/>;
  return <div className={'canvas-node process-node '+(selected?'selected':'')} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.repeat&&!e.nativeEvent.isComposing){e.preventDefault();e.stopPropagation();if(!runningIds.has(nodeId))runProcess(nodeId)}}}>
    <NodeResizer isVisible={selected} minWidth={280} minHeight={300} color="#7056df" onResizeEnd={(_,p)=>resizeNode(nodeId,p.width,p.height)}/>
    <Handle type="target" position={Position.Left}/>
    <NodeHeader icon={icon} title={data.title||title} kind={mode}/>
    <div className="process-body"><p>{mode==='lineart'?'本地提取图片轮廓，生成黑白线稿':'本地模型估计远近，生成灰度深度图'}</p><button className="run-button nodrag" disabled={runningIds.has(nodeId)} onClick={()=>runProcess(nodeId)}>{runningIds.has(nodeId)?<><LoaderCircle size={16} className="spin"/>处理中…</>:<>{icon}生成{title}</>}</button></div>
    <div className="process-result">{data.src?<img src={data.src} alt={title} draggable="false"/>:<span>{source?'点击上方按钮开始处理':'请从图片框连线到这里'}</span>}</div>
    <NodeError message={data.error}/>
    <div className="node-footer"><span>{data.src?title+'已保存在当前节点':'结果可继续连接到生图框'}</span>{data.src&&<button className="icon-button nodrag" title={'保存'+title} onClick={()=>download(data.src,mode+'.png')}><Download size={15}/></button>}</div>
    <Handle type="source" position={Position.Right}/>
  </div>;
}
const LineartNode=props=><ProcessNode {...props} mode="lineart"/>;
const DepthNode=props=><ProcessNode {...props} mode="depth"/>;
const nodeTypes={text:TextNode,image:ImageNode,generate:GenerateNode,lineart:LineartNode,depth:DepthNode};

function TaskSidebar({tasks,onLocate,serviceError}){
  return <aside className="task-sidebar"><div className="task-sidebar-head"><strong>生成任务</strong><span>{tasks.length}</span></div><div className="task-list">{serviceError&&<div className="task-error">{serviceError}</div>}{tasks.length?tasks.map(task=><article className="task-card" key={task.id}><div className="task-card-top"><strong>{task.nodeTitle}</strong><span className={'task-status '+task.status}>{task.status==='running'?<><LoaderCircle size={12} className="spin"/>生成中</>:task.status==='completed'?<><Check size={12}/>已完成</>:<><AlertCircle size={12}/>错误</>}</span></div><div className="task-time">{new Date(task.createdAt).toLocaleString('zh-CN',{hour12:false})} · {task.size}</div><p className="task-prompt">{task.promptPreview}</p>{task.status==='completed'&&<img className="task-preview" src={task.imageUrl} alt="任务结果" loading="lazy"/>}{task.error&&<div className="task-error">{task.error}</div>}<div className="task-actions"><button onClick={()=>onLocate(task)}>定位框</button>{task.status==='completed'&&<button onClick={()=>download(task.imageUrl,'生成任务-'+task.id+'.png')}>保存图片</button>}</div></article>):<div className="task-empty">提交生图任务后，会在这里显示进度和结果。</div>}</div><div className="task-sidebar-foot">任务与结果保存在你的云端画布中</div></aside>;
}

function ThemePicker({theme,onSelect}){
  const [open,setOpen]=useState(false),menuRef=useRef(null);
  useEffect(()=>{if(!open)return;const close=event=>{if(event.type==='keydown'){if(event.key==='Escape')setOpen(false)}else if(!menuRef.current?.contains(event.target))setOpen(false)};document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close)}},[open]);
  return <div className="theme-picker" ref={menuRef}><button className="top-button theme-trigger" type="button" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><Palette size={17}/> 配色方案 <ChevronDown size={14} className={open?'chevron-open':''}/></button>{open&&<div className="theme-menu" role="menu" aria-label="配色方案"><div className="theme-menu-heading">选择画布配色</div>{THEMES.map(option=><button key={option.id} className={'theme-option '+(theme===option.id?'active':'')} type="button" role="menuitemradio" aria-checked={theme===option.id} onClick={()=>{onSelect(option.id);setOpen(false)}}><span className="theme-preview" style={{'--preview-canvas':option.canvas,'--preview-surface':option.surface,'--preview-accent':option.accent}}><i/><i/></span><span className="theme-option-label"><strong>{option.name}</strong><small>{option.description}</small></span>{theme===option.id&&<Check size={15} className="theme-selected"/>}</button>)}</div>}</div>;
}

function projectTime(value){
  const elapsed=Date.now()-Date.parse(value);
  if(!Number.isFinite(elapsed))return '修改时间未知';
  if(elapsed<60000)return '刚刚修改';
  if(elapsed<3600000)return `${Math.floor(elapsed/60000)} 分钟前修改`;
  if(elapsed<86400000)return `${Math.floor(elapsed/3600000)} 小时前修改`;
  return new Date(value).toLocaleDateString('zh-CN',{year:'numeric',month:'short',day:'numeric'})+' 修改';
}

function ProjectPage({projects,loading,error,creating,onCreate,onOpen,onRetry,onImport,theme,setTheme}){
  const [query,setQuery]=useState('');
  const importInput=useRef(null);
  const visible=projects.filter(project=>project.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="app projects-page" data-theme={theme}>
    <header className="topbar projects-topbar"><div className="brand"><div className="brand-mark"><Sparkles size={19}/></div><div><b>Canvas Studio</b><span>你的创意空间</span></div></div><ThemePicker theme={theme} onSelect={setTheme}/></header>
    <main className="projects-main"><div className="projects-content">
      <div className="projects-heading"><div><span className="projects-eyebrow">PRIVATE CLOUD WORKSPACE</span><h1>我的项目</h1><p>从这里打开画布，接着上次的内容继续创作。</p></div><div className="project-heading-actions"><button className="workspace-transfer" type="button" onClick={()=>importInput.current?.click()}><FolderOpen size={16}/> 导入本地备份</button><input ref={importInput} type="file" accept=".json,application/json" hidden onChange={event=>{const file=event.target.files?.[0];if(file)onImport(file);event.target.value=''}}/><label className="project-search"><Search size={17}/><input aria-label="搜索项目" placeholder="搜索项目名称" value={query} onChange={event=>setQuery(event.target.value)}/></label></div></div>
      <div className="projects-section-title"><strong>全部画布</strong><span>{projects.length} 个项目 · 最近修改优先</span></div>
      {error&&<div className="projects-error" role="alert">{error}<button onClick={onRetry}>重试</button></div>}
      <div className="project-grid">
        <button className="project-card new-project-card" type="button" disabled={creating} onClick={onCreate} aria-label="新建空白画布"><span className="project-thumbnail new-project-thumbnail">{creating?<LoaderCircle size={39} className="spin"/>:<Plus size={43} strokeWidth={1.6}/>}</span><span className="project-card-info"><strong>新建空白画布</strong><small>从零开始创作</small></span></button>
        {visible.map(project=><button className="project-card" type="button" key={project.id} onClick={()=>onOpen(project.id)} aria-label={`打开项目：${project.title}`}><span className="project-thumbnail">{project.preview?<img src={project.preview} alt=""/>:<span className="project-placeholder"><FolderOpen size={35} strokeWidth={1.5}/></span>}<span className="project-node-count">{project.nodeCount} 个节点</span></span><span className="project-card-info"><strong title={project.title}>{project.title}</strong><small>{projectTime(project.updatedAt)}</small></span></button>)}
      </div>
      {!loading&&query&&visible.length===0&&<p className="projects-no-results">没有找到匹配的项目</p>}
      {loading&&<div className="projects-loading"><LoaderCircle size={20} className="spin"/> 正在读取本地项目…</div>}
    </div></main>
  </div>;
}

function CanvasEditor({projectId,onBack,theme,setTheme}){
  const [nodes,setNodes,onNodesChange]=useNodesState([]),[edges,setEdges,onEdgesChange]=useEdgesState([]);
  const [ready,setReady]=useState(false),[saveState,setSaveState]=useState('loading');
  const [canvasTitle,setCanvasTitle]=useState('未命名画布'),[draftTitle,setDraftTitle]=useState(''),[renaming,setRenaming]=useState(false);
  const [settings,setSettings]=useState(loadSettings),[draftSettings,setDraftSettings]=useState(null),[settingsOpen,setSettingsOpen]=useState(false);
  const [toast,setToast]=useState(null),[runningIds,setRunningIds]=useState(()=>new Set()),[reversingIds,setReversingIds]=useState(()=>new Set()),[tasks,setTasks]=useState([]),[taskServiceError,setTaskServiceError]=useState('');
  const [connectionMenu,setConnectionMenu]=useState(null);
  const flow=useReactFlow(),updateNodeInternals=useUpdateNodeInternals(),fileInput=useRef(null),pendingImage=useRef(null),saveTimer=useRef(null),viewportSaveTimer=useRef(null),saveQueue=useRef(Promise.resolve()),toastTimer=useRef(null),canvasWrap=useRef(null),loadFailed=useRef(false),skipInitialSave=useRef(true),lastCanvasContent=useRef(null),contentDirty=useRef(false),cancelRename=useRef(false),activeRuns=useRef(new Set()),serverRuns=useRef(new Set()),activeReversals=useRef(new Set()),lastHandleZoom=useRef(null);
  const updateHandleSize=useCallback(zoom=>{if(Math.abs((lastHandleZoom.current??-1)-zoom)<0.001)return;lastHandleZoom.current=zoom;const size=13/Math.max(0.2,zoom);canvasWrap.current?.style.setProperty('--connection-handle-size',size+'px');canvasWrap.current?.style.setProperty('--connection-handle-border',2/Math.max(0.2,zoom)+'px');updateNodeInternals(flow.getNodes().map(node=>node.id))},[flow,updateNodeInternals]);
  useEffect(()=>{if(ready)updateHandleSize(flow.getZoom())},[ready,flow,updateHandleSize]);
  const openSettings=useCallback(()=>{setDraftSettings({image:{...settings.image},text:{...settings.text}});setSettingsOpen(true)},[settings]);
  const refreshRunState=useCallback(()=>setRunningIds(previous=>{const next=new Set([...activeRuns.current,...serverRuns.current]);return previous.size===next.size&&[...next].every(id=>previous.has(id))?previous:next}),[]);
  const beginRun=useCallback(nodeId=>{if(activeRuns.current.has(nodeId)||serverRuns.current.has(nodeId))return false;activeRuns.current.add(nodeId);refreshRunState();return true},[refreshRunState]);
  const endRun=useCallback(nodeId=>{activeRuns.current.delete(nodeId);refreshRunState()},[refreshRunState]);
  const showToast=useCallback((message,error=false)=>{setToast({message,error});clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(null),4500)},[]);
  const syncTasks=useCallback(async()=>{
    try{
      const response=await fetch('/api/tasks',{cache:'no-store'});
      if(!response.ok)throw new Error('云端任务服务暂不可用');
      const {tasks:list}=await response.json();
      if(!Array.isArray(list))throw new Error('任务列表格式错误');
      const scoped=list.filter(task=>task.canvasId===projectId||(projectId==='main'&&!task.canvasId));
      setTaskServiceError('');
      setTasks(previous=>JSON.stringify(previous)===JSON.stringify(scoped)?previous:scoped);
      serverRuns.current=new Set(scoped.filter(task=>task.status==='running').map(task=>task.nodeId));
      refreshRunState();
      const latest=new Map();
      for(const task of scoped)if(!latest.has(task.nodeId))latest.set(task.nodeId,task);
      setNodes(current=>{
        let changed=false;
        const next=current.map(node=>{
          if(node.type!=='generate')return node;
          const task=latest.get(node.id);
          if(!task)return node;
          const patch={taskId:task.id};
          if(task.status==='completed'){patch.src=task.imageUrl;patch.error=null}
          else if(task.status==='error')patch.error=task.error||'生成失败';
          else patch.error=null;
          if(Object.entries(patch).every(([key,value])=>node.data[key]===value))return node;
          changed=true;
          return {...node,data:{...node.data,...patch},style:task.status==='completed'?{...node.style,height:Math.max(Number(node.style?.height)||0,minGenerateHeight({...node.data,src:task.imageUrl}))}:node.style};
        });
        return changed?next:current;
      });
    }catch(error){setTaskServiceError(error.message||'云端任务服务无法连接')}
  },[projectId,setNodes,refreshRunState]);
  useEffect(()=>{if(!ready)return;syncTasks();const timer=setInterval(syncTasks,2500);return()=>clearInterval(timer)},[ready,syncTasks]);
  useEffect(()=>{let live=true;loadDocument(projectId).then(doc=>{if(!live)return;if(!doc){onBack();return}loadFailed.current=false;let restoredNodes=doc?.nodes||starter;let restoredEdges=doc?.edges||starterEdges;const singleInputIds=new Set(restoredNodes.filter(isControlSource).map(n=>n.id));const generateIds=new Set(restoredNodes.filter(n=>n.type==='generate').map(n=>n.id));restoredEdges=restoredEdges.filter((edge,index,all)=>(!singleInputIds.has(edge.target)||index===all.findLastIndex(item=>item.target===edge.target))&&(!generateIds.has(edge.target)||!singleInputIds.has(edge.source)||index===all.findLastIndex(item=>item.target===edge.target&&singleInputIds.has(item.source))));const oldResults=restoredNodes.filter(n=>n.type==='image'&&n.data.origin==='generated');const generators=restoredNodes.filter(n=>n.type==='generate');if(oldResults.length===1&&generators.length===1&&!generators[0].data.src&&!restoredEdges.some(e=>e.source===oldResults[0].id||e.target===oldResults[0].id)){restoredNodes=restoredNodes.filter(n=>n.id!==oldResults[0].id).map(n=>n.id===generators[0].id?{...n,data:{...n.data,src:oldResults[0].data.src}}:n)}restoredNodes=restoredNodes.map(n=>({id:n.id,type:n.type,position:n.position,data:n.data,style:{...n.style,width:n.style?.width||n.width||defaultNodeSize(n.type,n.data).width,height:n.type==='generate'?Math.max(parseFloat(n.style?.height)||n.height||0,minGenerateHeight(n.data)):n.style?.height||n.height||defaultNodeSize(n.type,n.data).height}}));setCanvasTitle(typeof doc?.title==='string'&&doc.title.trim()?doc.title:'未命名画布');setNodes(restoredNodes);setEdges(restoredEdges.map(edge=>({...edge,type:'default'})));if(doc?.viewport)setTimeout(()=>flow.setViewport(doc.viewport),0);setReady(true);setSaveState('saved')}).catch(()=>{if(!live)return;loadFailed.current=true;setReady(true);setSaveState('error');showToast('无法读取云端画布，请稍后重试',true)});return()=>{live=false}},[]);
  const snapshot=useCallback(()=>({title:canvasTitle,nodes:nodes.map(({id,type,position,data,style})=>({id,type,position,data,style})),edges,viewport:flow.getViewport()}),[canvasTitle,nodes,edges,flow]);
  const queueSave=useCallback((document,touch=true)=>{const next=saveQueue.current.catch(()=>{}).then(()=>saveDocument(projectId,document,{touch}));saveQueue.current=next;return next},[projectId]);
  useEffect(()=>{if(!ready||loadFailed.current)return;const content={title:canvasTitle,nodes,edges};if(skipInitialSave.current){skipInitialSave.current=false;lastCanvasContent.current=content;return}if(sameCanvasContent(content,lastCanvasContent.current))return;lastCanvasContent.current=content;contentDirty.current=true;setSaveState('saving');clearTimeout(saveTimer.current);saveTimer.current=setTimeout(async()=>{try{await queueSave(snapshot());setSaveState('saved')}catch(error){setSaveState('error');showToast(error.message||'云端保存失败',true)}},500)},[canvasTitle,nodes,edges,ready,snapshot,queueSave,showToast]);
  const saveViewport=useCallback(()=>{if(!ready||loadFailed.current)return;clearTimeout(viewportSaveTimer.current);viewportSaveTimer.current=setTimeout(async()=>{try{await queueSave(snapshot(),false);setSaveState('saved')}catch{setSaveState('error')}},500)},[ready,snapshot,queueSave]);
  const exitToProjects=useCallback(async()=>{if(!ready||loadFailed.current){onBack();return}clearTimeout(saveTimer.current);clearTimeout(viewportSaveTimer.current);try{setSaveState('saving');await queueSave(snapshot(),contentDirty.current);setSaveState('saved');onBack()}catch{setSaveState('error');showToast('保存失败，已留在当前画布',true)}},[ready,onBack,queueSave,snapshot,showToast]);
  const startRename=()=>{cancelRename.current=false;setDraftTitle(canvasTitle);setRenaming(true)};
  const finishRename=()=>{if(!cancelRename.current){const next=draftTitle.trim();if(next)setCanvasTitle(next)}setRenaming(false)};
  const updateNode=useCallback((nodeId,patch)=>setNodes(ns=>ns.map(n=>n.id===nodeId?{...n,data:{...n.data,...patch}}:n)),[setNodes]);
  const resizeNode=useCallback((nodeId,width,height)=>setNodes(ns=>ns.map(n=>n.id===nodeId?{...n,style:{...n.style,width,height}}:n)),[setNodes]);
  const positionForNew=useCallback(()=>{const rect=canvasWrap.current?.getBoundingClientRect();if(!rect)return{x:0,y:0};const center=flow.screenToFlowPosition({x:rect.left+rect.width/2,y:rect.top+rect.height/2});return{x:center.x-155+Math.random()*55,y:center.y-110+Math.random()*55}},[flow]);
  const locateTask=useCallback(task=>{const node=nodes.find(item=>item.id===task.nodeId);if(!node){showToast('对应框已删除，结果仍可在任务列表中查看',true);return}flow.setCenter(node.position.x+(Number(node.style?.width)||310)/2,node.position.y+(Number(node.style?.height)||450)/2,{zoom:Math.max(flow.getZoom(),.75),duration:400})},[nodes,flow,showToast]);
  const addNode=useCallback((type,extra={},position)=>{const data=type==='text'?{title:'文字提示',text:'',...extra}:type==='image'?{title:'参考图片',...extra}:type==='lineart'?{title:'线稿',...extra}:type==='depth'?{title:'深度图',...extra}:{title:'生成图像',size:'1024x1024',prompt:'',...extra};const n={id:id(),type,position:snapPosition(position||positionForNew()),data,style:defaultNodeSize(type,data)};setNodes(ns=>[...ns,n]);return n.id},[setNodes,positionForNew]);
  const addImages=useCallback(async(files,position)=>{const selected=[...files].filter(f=>f.type.startsWith('image/'));if(!selected.length){showToast('请选择图片文件',true);return []}const images=[];for(const file of selected){try{images.push({id:id(),type:'image',position:snapPosition(position?{x:position.x+images.length*35,y:position.y+images.length*35}:positionForNew()),data:{title:file.name.replace(/\.[^.]+$/,''),src:await readFile(file),origin:'imported'},style:defaultNodeSize('image')})}catch(e){showToast(e.message,true)}}setNodes(ns=>[...ns,...images]);if(images.length)showToast(`已导入 ${images.length} 张图片`);return images},[setNodes,positionForNew,showToast]);
  const connectNodes=useCallback((sourceId,targetId,targetType)=>{
    if(sourceId===targetId)return;
    const source=nodes.find(n=>n.id===sourceId),target=nodes.find(n=>n.id===targetId);
    const kind=targetType||target?.type;
    const singleInput=kind==='lineart'||kind==='depth';
    const singleControl=kind==='generate'&&isControlSource(source);
    const controlIds=new Set(nodes.filter(isControlSource).map(n=>n.id));
    if(singleInput&&!isImageSource(source))return;
    const reverse=isImageSource(source)&&kind==='text';
    setEdges(es=>{
      const remaining=es.filter(e=>!(singleInput&&e.target===targetId)&&!(singleControl&&e.target===targetId&&controlIds.has(e.source)&&e.source!==sourceId));
      if(remaining.some(e=>e.source===sourceId&&e.target===targetId))return remaining;
      return addEdge({source:sourceId,target:targetId,type:'default',animated:true,...(reverse?{label:'反推'}:{})},remaining);
    });
  },[nodes,setEdges]);
  const onConnect=useCallback(connection=>{if(connection.source===connection.target)return;connectNodes(connection.source,connection.target)},[connectNodes]);
  const onConnectEnd=useCallback((event,state)=>{if(state.isValid||state.toNode||!state.fromNode||state.fromHandle?.type!=='source')return;const rect=canvasWrap.current?.getBoundingClientRect();if(!rect)return;const point='changedTouches'in event?event.changedTouches[0]:event;if(!point||!Number.isFinite(point.clientX)||!Number.isFinite(point.clientY))return;const localX=point.clientX-rect.left,localY=point.clientY-rect.top;setConnectionMenu({sourceId:state.fromNode.id,position:flow.screenToFlowPosition({x:point.clientX,y:point.clientY}),x:Math.max(8,Math.min(localX,rect.width-208)),y:Math.max(8,Math.min(localY,rect.height-300))})},[flow]);
  const onPaneClick=useCallback(event=>{if(event.detail!==2)return;const rect=canvasWrap.current?.getBoundingClientRect();if(!rect)return;const localX=event.clientX-rect.left,localY=event.clientY-rect.top;setConnectionMenu({sourceId:null,position:flow.screenToFlowPosition({x:event.clientX,y:event.clientY}),x:Math.max(8,Math.min(localX,rect.width-208)),y:Math.max(8,Math.min(localY,rect.height-188))})},[flow]);
  const chooseNextNode=useCallback(type=>{if(!connectionMenu)return;const {sourceId,position}=connectionMenu;setConnectionMenu(null);if(type==='image'){if(sourceId)return;pendingImage.current={sourceId,position};fileInput.current?.click();return}const nextId=addNode(type,{},position);if(sourceId)connectNodes(sourceId,nextId,type)},[connectionMenu,nodes,addNode,connectNodes]);
  useEffect(()=>{const close=e=>{if(e.key==='Escape')setConnectionMenu(null)};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[]);
  const runGeneration=useCallback(async nodeId=>{
    const target=nodes.find(n=>n.id===nodeId);if(!target)return;
    const found=new Set(),sources=[];
    const collect=currentId=>{for(const edge of edges.filter(e=>e.target===currentId)){if(found.has(edge.source)||edge.source===nodeId)continue;found.add(edge.source);const node=nodes.find(n=>n.id===edge.source);if(!node)continue;sources.push(node);if(!['generate','lineart','depth'].includes(node.type))collect(node.id)}};
    collect(nodeId);
    const prompt=[...sources.filter(n=>n.type==='text').map(n=>n.data.text?.trim()),target.data.prompt?.trim()].filter(Boolean).join('\n\n');
    const selectedControl=sources.filter(isControlSource).at(-1);
    const images=sources.filter(n=>isImageSource(n)&&(!isControlSource(n)||n.id===selectedControl?.id)).map(n=>n.data.src);
    if(!prompt){updateNode(nodeId,{error:'请在生图框填写画面描述，或连接一个写有内容的文字框'});return}
    const imageApi=settings.image||{};const size=target.data.size==='custom'?`${target.data.customWidth||2880}x${target.data.customHeight||2880}`:target.data.size||'1024x1024';
    if(!validSize(size)){updateNode(nodeId,{error:'尺寸无效：宽高须为 16 的倍数、比例 1:3 至 3:1、总像素不超过 829 万'});return}
    if(!imageApi.baseUrl||!imageApi.key||!imageApi.model){openSettings();updateNode(nodeId,{error:'请先填写图像 API 地址、密钥和模型'});return}
    updateNode(nodeId,{error:null});
    if(!beginRun(nodeId))return;
    try{
      const inlineImages=await Promise.all(images.map(inlineImage));
      const res=await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:imageApi.baseUrl,key:imageApi.key,model:imageApi.model,prompt,images:inlineImages,size,canvasId:projectId,nodeId,nodeTitle:target.data.title,canvasTitle})});
      if(!res.ok){const failure=await res.json();throw new Error(failure.error||'提交失败（HTTP '+res.status+'）')}
      if(!res.body)throw new Error('任务服务未返回结果流');
      const reader=res.body.getReader(),decoder=new TextDecoder();let line='';
      while(!line.includes('\n')){const part=await reader.read();if(part.done)throw new Error('任务服务提前断开');line+=decoder.decode(part.value,{stream:true})}
      const result=JSON.parse(line.slice(0,line.indexOf('\n')));
      void (async()=>{try{while(!(await reader.read()).done){} await syncTasks()}catch{await syncTasks()}})();
      serverRuns.current.add(nodeId);
      refreshRunState();
      updateNode(nodeId,{taskId:result.task.id,error:null});
      setTasks(previous=>[result.task,...previous.filter(task=>task.id!==result.task.id)]);
      showToast('任务已提交，结果会显示在右侧列表');
    }catch(e){updateNode(nodeId,{error:e.message||'生成失败'})}finally{endRun(nodeId)}
  },[nodes,edges,settings,canvasTitle,projectId,updateNode,showToast,beginRun,endRun,refreshRunState,openSettings,syncTasks]);
  const runProcess=useCallback(async nodeId=>{
    const target=nodes.find(n=>n.id===nodeId);
    if(!target||!['lineart','depth'].includes(target.type))return;
    const source=edges.filter(e=>e.target===nodeId).map(e=>nodes.find(n=>n.id===e.source)).filter(isImageSource).at(-1);
    if(!source){updateNode(nodeId,{error:'请先从有图片的框连线到这里'});return}
    updateNode(nodeId,{error:null});
    if(!beginRun(nodeId))return;
    try{
      const src=await processLocally(target.type,source.data.src);
      updateNode(nodeId,{src,error:null});
      showToast(target.type==='lineart'?'线稿已生成':'深度图已生成');
    }catch(error){updateNode(nodeId,{error:error.message||'本地处理失败'})}
    finally{endRun(nodeId)}
  },[nodes,edges,updateNode,showToast,beginRun,endRun]);
  const reversePrompt=useCallback(async nodeId=>{
    const imageSources=edges.filter(e=>e.target===nodeId).map(e=>nodes.find(n=>n.id===e.source)).filter(isImageSource).map(n=>n.data.src);
    if(!imageSources.length){updateNode(nodeId,{error:'请先从有图片的框连线到文字框'});return}
    const textApi=settings.text||{};
    if(!textApi.baseUrl||!textApi.key||!textApi.model){openSettings();updateNode(nodeId,{error:'请先填写文本 API 地址、密钥和模型'});return}
    updateNode(nodeId,{error:null});
    if(activeReversals.current.has(nodeId))return;
    activeReversals.current.add(nodeId);
    setReversingIds(new Set(activeReversals.current));
    try{
      const inlineImages=await Promise.all(imageSources.map(inlineImage));
      const res=await fetch('/api/reverse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:textApi.baseUrl,key:textApi.key,model:textApi.model,images:inlineImages})});
      const result=await res.json();
      if(!res.ok)throw new Error(result.error||'反推失败（HTTP '+res.status+'）');
      updateNode(nodeId,{text:result.text,error:null});
      showToast('已将反推提示词写入文字框');
    }catch(error){updateNode(nodeId,{error:error.message||'反推失败'})}
    finally{activeReversals.current.delete(nodeId);setReversingIds(new Set(activeReversals.current))}
  },[nodes,edges,settings,updateNode,showToast,openSettings]);
  const context=useMemo(()=>({updateNode,resizeNode,runGeneration,runProcess,reversePrompt,runningIds,reversingIds,edges,nodes}),[updateNode,resizeNode,runGeneration,runProcess,reversePrompt,runningIds,reversingIds,edges,nodes]);
  return <CanvasContext.Provider value={context}><div className="app" data-theme={theme}><header className="topbar"><div className="editor-brand"><button className="back-to-projects" type="button" onClick={exitToProjects} title="返回我的项目"><ArrowLeft size={17}/><span>项目</span></button><div className="brand"><div className="brand-mark"><Sparkles size={19}/></div><div><b>Canvas Studio</b><span>你的创意空间</span></div></div></div><div className="top-center"><span className="document-dot"/>{renaming?<input className="canvas-name-input" aria-label="画布名称" autoFocus maxLength={60} value={draftTitle} onFocus={e=>e.target.select()} onChange={e=>setDraftTitle(e.target.value)} onBlur={finishRename} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur()}else if(e.key==='Escape'){cancelRename.current=true;setRenaming(false)}}}/>:<><span className="canvas-name" title={canvasTitle}>{canvasTitle}</span><button className="rename-button" aria-label="重命名画布" title="修改画布名" onClick={startRename}><Pencil size={13}/></button></>}<span className="top-separator">/</span><span className={`save-status ${saveState}`}>{saveState==='saved'?<><Check size={12}/> 已保存</>:saveState==='saving'?<><LoaderCircle size={12} className="spin"/> 保存中</>:saveState==='error'?<><AlertCircle size={12}/> 保存失败</>:'加载中'}</span></div><div className="top-actions"><button className="top-button" onClick={openSettings}><Settings size={17}/> API 设置</button><ThemePicker theme={theme} onSelect={setTheme}/></div></header><main className="main"><div className="canvas-wrap" ref={canvasWrap} onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault()}} onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();addImages(e.dataTransfer.files,flow.screenToFlowPosition({x:e.clientX,y:e.clientY}))}}}><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} connectionLineType={ConnectionLineType.Bezier} onConnectEnd={onConnectEnd} onPaneClick={onPaneClick} snapToGrid snapGrid={SNAP_GRID} zoomOnDoubleClick={false} onMove={(_,viewport)=>updateHandleSize(viewport.zoom)} onMoveEnd={saveViewport} minZoom={0.2} maxZoom={2} fitView fitViewOptions={{padding:0.28}} deleteKeyCode={['Backspace','Delete']} proOptions={{hideAttribution:true}}><Background color={THEME_BY_ID[theme].grid} gap={GRID_SIZE} size={1.2}/><Controls showInteractive={false}/><MiniMap pannable zoomable nodeColor={n=>n.type==='generate'?THEME_BY_ID[theme].accent:n.type==='image'?'#56b49a':'#e0ae6b'} maskColor={THEME_BY_ID[theme].mask}/></ReactFlow>{connectionMenu&&<><div className="connection-menu-dismiss" onClick={()=>setConnectionMenu(null)}/><div className="connection-menu" style={{left:connectionMenu.x,top:connectionMenu.y}}><div className="connection-menu-title">{connectionMenu.sourceId?'下一步添加':'添加节点'}</div><button onClick={()=>chooseNextNode('text')}><span className="connection-menu-icon text"><Type size={16}/></span><span>文字框<small>继续编写提示词</small></span></button>{!connectionMenu.sourceId&&<button onClick={()=>chooseNextNode('image')}><span className="connection-menu-icon image"><ImageIcon size={16}/></span><span>图片框<small>从本地导入图片</small></span></button>}<button onClick={()=>chooseNextNode('generate')}><span className="connection-menu-icon generate"><Sparkles size={16}/></span><span>生图框<small>汇总输入并生成</small></span></button>{connectionMenu.sourceId&&isImageSource(nodes.find(n=>n.id===connectionMenu.sourceId))&&<><button onClick={()=>chooseNextNode('lineart')}><span className="connection-menu-icon lineart"><PenLine size={16}/></span><span>线稿框<small>本地提取黑白线稿</small></span></button><button onClick={()=>chooseNextNode('depth')}><span className="connection-menu-icon depth"><Layers3 size={16}/></span><span>深度框<small>本地估计灰度深度图</small></span></button></>}</div></>}<div className="floating-toolbar"><button onClick={()=>addNode('text')} title="添加文字"><Type size={19}/><span>文字</span></button><div className="toolbar-rule"/><button onClick={()=>{pendingImage.current=null;fileInput.current?.click()}} title="导入图片"><ImageIcon size={19}/><span>图片</span></button><div className="toolbar-rule"/><button onClick={()=>addNode('generate')} title="添加生成节点"><Sparkles size={19}/><span>生图</span></button></div><div className="canvas-hint"><MousePointer2 size={14}/> 双击空白处添加节点 · 拖动边角缩放节点 · 滚轮缩放画布</div><input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={async e=>{const pending=pendingImage.current;pendingImage.current=null;const images=await addImages(e.target.files,pending?.position);if(pending?.sourceId)images.forEach(image=>connectNodes(pending.sourceId,image.id));e.target.value=''}}/></div><TaskSidebar tasks={tasks} onLocate={locateTask} serviceError={taskServiceError}/></main>{toast&&<div className={`toast ${toast.error?'error':''}`}>{toast.error?<AlertCircle size={17}/>:<Check size={17}/>}<span>{toast.message}</span><button onClick={()=>setToast(null)}><X size={15}/></button></div>}{settingsOpen&&draftSettings&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSettingsOpen(false)}}><div className="settings-modal"><div className="modal-head"><div className="modal-icon"><Settings size={20}/></div><div><h2>API 设置</h2><p>图像生成与图像反推分别连接服务</p></div><button className="icon-button" onClick={()=>setSettingsOpen(false)}><X size={20}/></button></div><div className="modal-body"><div className="api-section-title"><ImageIcon size={16}/> 图像 API <span>用于生图与改图</span></div><label>Base URL<input value={draftSettings.image?.baseUrl||''} onChange={e=>setDraftSettings(v=>({...v,image:{...v.image,baseUrl:e.target.value}}))} placeholder="https://example.com/v1"/></label><label>API Key<input type="password" value={draftSettings.image?.key||''} onChange={e=>setDraftSettings(v=>({...v,image:{...v.image,key:e.target.value}}))} placeholder="图像 API Key"/></label><label>模型名称<input value={draftSettings.image?.model||''} onChange={e=>setDraftSettings(v=>({...v,image:{...v.image,model:e.target.value}}))} placeholder="例如 gpt-image-2.6-sunburst"/></label><div className="api-section-title text-api-title"><Type size={16}/> 文本 API <span>用于图像反推</span></div><label>Base URL<input value={draftSettings.text?.baseUrl||''} onChange={e=>setDraftSettings(v=>({...v,text:{...v.text,baseUrl:e.target.value}}))} placeholder="https://example.com/v1"/></label><label>API Key<input type="password" value={draftSettings.text?.key||''} onChange={e=>setDraftSettings(v=>({...v,text:{...v.text,key:e.target.value}}))} placeholder="文本 API Key"/></label><label>视觉模型名称<input value={draftSettings.text?.model||''} onChange={e=>setDraftSettings(v=>({...v,text:{...v.text,model:e.target.value}}))} placeholder="例如 gpt-4.1-mini"/></label><div className="settings-note">文本服务需支持 OpenAI 兼容的 /chat/completions 图像输入。API 设置仅保存在当前浏览器；换设备使用时需重新填写。</div></div><div className="modal-footer"><button className="secondary-button" onClick={()=>setSettingsOpen(false)}>取消</button><button className="primary-button" onClick={()=>{setSettings(draftSettings);saveSettings(draftSettings);setSettingsOpen(false);showToast('API 设置已保存')}}>保存设置</button></div></div></div>}</div></CanvasContext.Provider>
}
function ProjectApp(){
  const [projectId,setProjectId]=useState(()=>new URLSearchParams(location.search).get('project'));
  const [projects,setProjects]=useState([]),[loading,setLoading]=useState(true),[creating,setCreating]=useState(false),[error,setError]=useState('');
  const [theme,setTheme]=useState(loadTheme);
  useEffect(()=>{try{localStorage.setItem('canvas-theme',theme)}catch{}},[theme]);
  useEffect(()=>{const onPopState=()=>setProjectId(new URLSearchParams(location.search).get('project'));window.addEventListener('popstate',onPopState);return()=>window.removeEventListener('popstate',onPopState)},[]);
  const refresh=useCallback(async()=>{setLoading(true);try{setProjects(await listProjects());setError('')}catch(e){setError(e.message||'读取项目失败')}finally{setLoading(false)}},[]);
  useEffect(()=>{if(!projectId)refresh()},[projectId,refresh]);
  const openProject=useCallback(id=>{const url=new URL(location.href);url.searchParams.set('project',id);history.pushState(null,'',url);setProjectId(id)},[]);
  const backToProjects=useCallback(()=>{const url=new URL(location.href);url.searchParams.delete('project');history.replaceState(null,'',url);setProjectId(null)},[]);
  const newProject=useCallback(async()=>{if(creating)return;setCreating(true);try{openProject(await createProject())}catch(e){setError(e.message||'新建画布失败')}finally{setCreating(false)}},[creating,openProject]);
  const importBackup=useCallback(async file=>{setLoading(true);try{const backup=await prepareBackup(JSON.parse(await file.text()));const response=await fetch('/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(backup)});const result=await response.json();if(!response.ok)throw new Error(result.error||'导入失败');await refresh();setError('')}catch(error){setError(error.message||'导入失败')}finally{setLoading(false)}},[refresh]);
  return projectId?<ReactFlowProvider key={projectId}><CanvasEditor projectId={projectId} onBack={backToProjects} theme={theme} setTheme={setTheme}/></ReactFlowProvider>:<ProjectPage projects={projects} loading={loading} error={error} creating={creating} onCreate={newProject} onOpen={openProject} onRetry={refresh} onImport={importBackup} theme={theme} setTheme={setTheme}/>;
}

export default ProjectApp;

