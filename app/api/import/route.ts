import {bindings,docKey,failure,imageKey,json,userId,validId} from '../../../lib/canvas-store';

export async function POST(request:Request){
  try{
    const user=userId(request),{db,bucket}=bindings();
    const backup=await request.json() as any;
    if(backup?.format!=='canvas-studio-workspace'||backup.version!==1||!Array.isArray(backup.documents)||backup.documents.length>200) return json({error:'请选择 Canvas Studio 导出的工作区备份'},400);
    const mapping=new Map<string,string>();let imported=0;
    for(const item of backup.documents){
      const doc=item?.document;if(!doc||!Array.isArray(doc.nodes)||!Array.isArray(doc.edges))continue;
      const original=String(item.id||'');const id=validId(original)?original:crypto.randomUUID();
      const exists=await db.prepare('SELECT id FROM canvas_projects WHERE id=?').bind(id).first();
      const destination=exists?crypto.randomUUID():id;mapping.set(original,destination);
      const now=new Date().toISOString(),createdAt=typeof item.createdAt==='string'?item.createdAt:now,updatedAt=typeof item.updatedAt==='string'?item.updatedAt:now;
      await bucket.put(docKey(user,destination),JSON.stringify(doc),{httpMetadata:{contentType:'application/json'}});
      await db.prepare('INSERT INTO canvas_projects(id,user_id,title,created_at,updated_at,node_count,preview) VALUES(?,?,?,?,?,?,?)').bind(destination,user,String(doc.title||'未命名画布').slice(0,100),createdAt,updatedAt,doc.nodes.length,typeof item.preview==='string'&&item.preview.startsWith('data:image/')?item.preview:null).run();
      imported++;
    }
    let importedTasks=0;
    for(const task of Array.isArray(backup.tasks)?backup.tasks:[]){
      const canvasId=mapping.get(String(task.canvasId||''));if(!canvasId)continue;
      const id=crypto.randomUUID(),status=task.status==='completed'&&task.image?'completed':task.status==='error'?'error':'error';
      let mimeType:null|string=null;
      if(status==='completed'){
        const assetId=/^\/api\/assets\/([0-9a-f-]{36})$/i.exec(String(task.image||''))?.[1];
        if(!assetId)throw new Error('备份中的任务图片无效');
        const image=await bucket.get(`users/${encodeURIComponent(user)}/assets/${assetId}`);
        if(!image)throw new Error('找不到已上传的任务图片');
        mimeType=image.httpMetadata?.contentType||'image/png';
        await bucket.put(imageKey(user,id),image.body,{httpMetadata:{contentType:mimeType}});
      }
      await db.prepare('INSERT INTO canvas_tasks(id,user_id,canvas_id,node_id,node_title,canvas_title,prompt_preview,model,size,status,error,mime_type,created_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,user,canvasId,String(task.nodeId||''),String(task.nodeTitle||'生成图像'),String(task.canvasTitle||'未命名画布'),String(task.promptPreview||''),String(task.model||''),String(task.size||'auto'),status,status==='error'?String(task.error||'旧任务未完成'):null,mimeType,String(task.createdAt||new Date().toISOString()),String(task.finishedAt||new Date().toISOString())).run();
      importedTasks++;
    }
    return json({projects:imported,tasks:importedTasks},201);
  }catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:500)}
}
