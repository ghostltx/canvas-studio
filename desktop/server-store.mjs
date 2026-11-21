import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';

const configPath=join(homedir(),'.canvas-studio','config.json');

export async function localConfig(){
  try{return JSON.parse(await readFile(configPath,'utf8'))}catch(error){if(error.code==='ENOENT')return {};throw error}
}

export async function dataDirectory(config){
  config??=await localConfig();
  if(process.env.CANVAS_DATA_DIR)return process.env.CANVAS_DATA_DIR;
  return typeof config.dataDir==='string'&&config.dataDir.trim()?config.dataDir:join(homedir(),'.canvas-studio','data');
}

export async function openProjectStore(root){
  await mkdir(root,{recursive:true});
  const db=new DatabaseSync(join(root,'canvas-studio.db'));
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=10000;');
  db.exec(`CREATE TABLE IF NOT EXISTS projects(
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    node_count INTEGER NOT NULL DEFAULT 0,
    preview TEXT,
    document TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS projects_recent ON projects(updated_at DESC);
  CREATE TABLE IF NOT EXISTS canvas_tasks(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,data TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS tasks_recent ON canvas_tasks(created_at DESC);`);
  const taskImages=join(root,'task-images');
  const project={
    list:()=>db.prepare('SELECT id,title,created_at AS createdAt,updated_at AS updatedAt,node_count AS nodeCount,preview FROM projects ORDER BY updated_at DESC').all(),
    get:id=>{const row=db.prepare('SELECT document FROM projects WHERE id=?').get(id);return row?JSON.parse(row.document):null},
    create:()=>{
      const id=crypto.randomUUID(),now=new Date().toISOString();
      const document={title:'未命名画布',nodes:[],edges:[],viewport:{x:0,y:0,zoom:1}};
      db.prepare('INSERT INTO projects(id,title,created_at,updated_at,node_count,preview,document) VALUES(?,?,?,?,?,?,?)').run(id,document.title,now,now,0,null,JSON.stringify(document));
      return id;
    },
    save:(id,document,{preview=null,touch=true}={})=>{
      const old=db.prepare('SELECT updated_at FROM projects WHERE id=?').get(id);
      if(!old)return false;
      db.prepare('UPDATE projects SET title=?,updated_at=?,node_count=?,preview=COALESCE(?,preview),document=? WHERE id=?').run(document.title.trim()||'未命名画布',touch?new Date().toISOString():old.updated_at,document.nodes.length,preview,JSON.stringify(document),id);
      return true;
    },
    migrate:({id,createdAt,updatedAt,preview,document,touch=true})=>{
      const old=db.prepare('SELECT updated_at AS updatedAt FROM projects WHERE id=?').get(id);
      const when=updatedAt||new Date().toISOString();
      if(old&&touch!==false&&old.updatedAt>=when)return false;
      const body=JSON.stringify(document),title=document.title?.trim()||'未命名画布';
      if(old)db.prepare('UPDATE projects SET title=?,updated_at=?,node_count=?,preview=COALESCE(?,preview),document=? WHERE id=?').run(title,touch===false?old.updatedAt:when,document.nodes.length,preview||null,body,id);
      else db.prepare('INSERT INTO projects(id,title,created_at,updated_at,node_count,preview,document) VALUES(?,?,?,?,?,?,?)').run(id,title,createdAt||when,when,document.nodes.length,preview||null,body);
      return true;
    },
    integrity:()=>db.prepare('PRAGMA integrity_check').get()?.integrity_check==='ok'
  };
  project.listTasks=()=>db.prepare('SELECT data FROM canvas_tasks ORDER BY created_at DESC LIMIT 500').all().map(row=>JSON.parse(row.data));
  project.upsertTask=task=>{
    const old=db.prepare('SELECT data FROM canvas_tasks WHERE id=?').get(task.id);
    if(old&&JSON.parse(old.data).status==='completed'&&task.status!=='completed')return false;
    db.prepare('INSERT INTO canvas_tasks(id,created_at,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(task.id,task.createdAt,JSON.stringify(task));
    return true;
  };
  project.putTaskImage=async(id,bytes)=>{await mkdir(taskImages,{recursive:true});await writeFile(join(taskImages,id+'.image'),bytes)};
  project.getTaskImage=id=>readFile(join(taskImages,id+'.image'));
  if(!project.integrity())throw new Error('NAS 画布数据库完整性检查失败');
  return project;
}
