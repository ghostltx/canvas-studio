import {bindings,failure,imageKey,json,userId} from '../../../lib/canvas-store';
import {generateImage,validateImage} from '../../../lib/image-api';

export async function GET(request:Request){
  try{
    const user=userId(request),{db}=bindings();
    const cutoff=new Date(Date.now()-25*60_000).toISOString();
    await db.prepare("UPDATE canvas_tasks SET status='error',error='任务超时或连接中断，图像 API 未提供可恢复的任务 ID。',finished_at=? WHERE user_id=? AND status='running' AND created_at<?").bind(new Date().toISOString(),user,cutoff).run();
    const result=await db.prepare('SELECT id,canvas_id AS canvasId,node_id AS nodeId,node_title AS nodeTitle,canvas_title AS canvasTitle,prompt_preview AS promptPreview,model,size,status,error,mime_type AS mimeType,created_at AS createdAt,finished_at AS finishedAt FROM canvas_tasks WHERE user_id=? ORDER BY created_at DESC LIMIT 200').bind(user).all();
    return json({tasks:result.results.map((task:any)=>({...task,imageUrl:task.status==='completed'?`/api/tasks/${task.id}/image`:null}))});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:500)}
}

export async function POST(request:Request){
  try{
    const user=userId(request),{db,bucket}=bindings();
    const input=await request.json() as any;validateImage(input);
    const canvasId=String(input.canvasId||'');
    const owner=await db.prepare('SELECT id FROM canvas_projects WHERE id=? AND user_id=?').bind(canvasId,user).first();
    if(!owner)return json({error:'画布不存在'},404);
    const task={id:crypto.randomUUID(),canvasId,nodeId:String(input.nodeId||''),nodeTitle:String(input.nodeTitle||'生成图像').slice(0,80),canvasTitle:String(input.canvasTitle||'未命名画布').slice(0,80),promptPreview:input.prompt.trim().slice(0,140),model:input.model,size:input.size||'1024x1024',status:'running',createdAt:new Date().toISOString(),imageUrl:null};
    await db.prepare('INSERT INTO canvas_tasks(id,user_id,canvas_id,node_id,node_title,canvas_title,prompt_preview,model,size,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(task.id,user,task.canvasId,task.nodeId,task.nodeTitle,task.canvasTitle,task.promptPreview,task.model,task.size,task.status,task.createdAt).run();
    const encoder=new TextEncoder();
    const stream=new ReadableStream<Uint8Array>({
      start(controller){
        controller.enqueue(encoder.encode(JSON.stringify({task})+'\n'));
        const heartbeat=setInterval(()=>{try{controller.enqueue(encoder.encode(JSON.stringify({status:'running'})+'\n'))}catch{}},15000);
        void (async()=>{
          try{
            const image=await generateImage(input);
            await bucket.put(imageKey(user,task.id),image.bytes,{httpMetadata:{contentType:image.mimeType}});
            await db.prepare("UPDATE canvas_tasks SET status='completed',mime_type=?,finished_at=? WHERE id=? AND user_id=?").bind(image.mimeType,new Date().toISOString(),task.id,user).run();
            controller.enqueue(encoder.encode(JSON.stringify({status:'completed'})+'\n'));
          }catch(error){
            const message=error instanceof Error?error.message:'生成失败';
            await db.prepare("UPDATE canvas_tasks SET status='error',error=?,finished_at=? WHERE id=? AND user_id=?").bind(message,new Date().toISOString(),task.id,user).run().catch(()=>{});
            controller.enqueue(encoder.encode(JSON.stringify({status:'error',error:message})+'\n'));
          }finally{clearInterval(heartbeat);controller.close()}
        })();
      }
    });
    return new Response(stream,{status:202,headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'}});
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:400)}
}
