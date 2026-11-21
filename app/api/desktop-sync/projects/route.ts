import {bindings,docKey,failure,json,validId} from '../../../../lib/canvas-store';
import {syncUser} from '../../../../lib/desktop-sync';

export async function GET(request:Request){
  try{const user=syncUser(request),{db}=bindings();const result=await db.prepare('SELECT id,title,created_at AS createdAt,updated_at AS updatedAt,node_count AS nodeCount,preview FROM canvas_projects WHERE user_id=? ORDER BY updated_at DESC').bind(user).all();return json({projects:result.results})}catch(error){return failure(error,401)}
}

export async function POST(request:Request){
  try{
    const user=syncUser(request),{db,bucket}=bindings();
    const input=await request.json() as any;
    const {id,document,createdAt,updatedAt,preview}=input;
    if(!validId(id)||!document||typeof document.title!=='string'||!Array.isArray(document.nodes)||!Array.isArray(document.edges))return json({error:'画布格式无效'},400);
    const body=JSON.stringify({title:document.title,nodes:document.nodes,edges:document.edges,viewport:document.viewport});
    if(body.length>90_000_000)return json({error:'画布超过 90 MB'},413);
    const old=await db.prepare('SELECT updated_at AS updatedAt FROM canvas_projects WHERE id=? AND user_id=?').bind(id,user).first<{updatedAt:string}>();
    if(old&&old.updatedAt>=updatedAt)return json({written:false});
    await bucket.put(docKey(user,id),body,{httpMetadata:{contentType:'application/json'}});
    const title=document.title.trim()||'未命名画布',now=new Date().toISOString();
    if(old)await db.prepare('UPDATE canvas_projects SET title=?,updated_at=?,node_count=?,preview=COALESCE(?,preview) WHERE id=? AND user_id=?').bind(title,updatedAt||now,document.nodes.length,preview||null,id,user).run();
    else await db.prepare('INSERT INTO canvas_projects(id,user_id,title,created_at,updated_at,node_count,preview) VALUES(?,?,?,?,?,?,?)').bind(id,user,title,createdAt||now,updatedAt||now,document.nodes.length,preview||null).run();
    return json({written:true});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('授权')?401:500)}
}
