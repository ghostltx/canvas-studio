import {bindings,failure,json,validId} from '../../../../lib/canvas-store';
import {syncUser} from '../../../../lib/desktop-sync';

export async function GET(request:Request){
  try{const user=syncUser(request),{db}=bindings();const result=await db.prepare('SELECT id,canvas_id AS canvasId,node_id AS nodeId,node_title AS nodeTitle,canvas_title AS canvasTitle,prompt_preview AS promptPreview,model,size,status,error,mime_type AS mimeType,created_at AS createdAt,finished_at AS finishedAt FROM canvas_tasks WHERE user_id=? ORDER BY created_at DESC LIMIT 500').bind(user).all();return json({tasks:result.results})}catch(error){return failure(error,error instanceof Error&&error.message.includes('授权')?401:500)}
}

export async function POST(request:Request){
  try{
    const user=syncUser(request),{db}=bindings(),task=await request.json() as any;
    if(!validId(task.id)||!validId(task.canvasId)||!['running','completed','error'].includes(task.status))return json({error:'任务格式无效'},400);
    const old=await db.prepare('SELECT status FROM canvas_tasks WHERE id=? AND user_id=?').bind(task.id,user).first<{status:string}>();
    if(old?.status==='completed'&&task.status!=='completed')return json({ok:true});
    if(old)await db.prepare('UPDATE canvas_tasks SET status=?,error=?,mime_type=?,finished_at=? WHERE id=? AND user_id=?').bind(task.status,task.error||null,task.mimeType||null,task.finishedAt||null,task.id,user).run();
    else await db.prepare('INSERT INTO canvas_tasks(id,user_id,canvas_id,node_id,node_title,canvas_title,prompt_preview,model,size,status,error,mime_type,created_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(task.id,user,task.canvasId,task.nodeId||'',task.nodeTitle||'生成图像',task.canvasTitle||'未命名画布',task.promptPreview||'',task.model||'',task.size||'',task.status,task.error||null,task.mimeType||null,task.createdAt||new Date().toISOString(),task.finishedAt||null).run();
    return json({ok:true});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('授权')?401:500)}
}
