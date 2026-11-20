import {bindings,docKey,failure,json,userId} from '../../../lib/canvas-store';

export async function GET(request:Request){
  try{
    const user=userId(request),{db}=bindings();
    const result=await db.prepare('SELECT id,title,created_at AS createdAt,updated_at AS updatedAt,node_count AS nodeCount,preview FROM canvas_projects WHERE user_id=? ORDER BY updated_at DESC').bind(user).all();
    return json({projects:result.results});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:500)}
}
export async function POST(request:Request){
  try{
    const user=userId(request),{db,bucket}=bindings();
    const id=crypto.randomUUID(),now=new Date().toISOString();
    const document={title:'未命名画布',nodes:[],edges:[],viewport:{x:0,y:0,zoom:1}};
    await bucket.put(docKey(user,id),JSON.stringify(document),{httpMetadata:{contentType:'application/json'}});
    await db.prepare('INSERT INTO canvas_projects(id,user_id,title,created_at,updated_at,node_count) VALUES(?,?,?,?,?,0)').bind(id,user,document.title,now,now).run();
    return json({id},201);
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:500)}
}
