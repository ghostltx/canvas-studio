import {env} from 'cloudflare:workers';

export function userId(request:Request){
  const id=request.headers.get('oai-authenticated-user-id');
  if(!id)throw new Error('请先登录后访问画布');
  return id;
}
export function bindings(){
  if(!env.DB||!env.BUCKET)throw new Error('云端数据库或图片存储未连接');
  return {db:env.DB,bucket:env.BUCKET};
}
export const docKey=(user:string,id:string)=>`users/${encodeURIComponent(user)}/projects/${encodeURIComponent(id)}.json`;
export const imageKey=(user:string,id:string)=>`users/${encodeURIComponent(user)}/tasks/${encodeURIComponent(id)}.image`;
export const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export const failure=(error:unknown,status=500)=>json({error:error instanceof Error?error.message:'云端服务发生错误'},status);
export function validId(id:string){return /^[0-9a-f-]{36}$/i.test(id)||id==='main'}
