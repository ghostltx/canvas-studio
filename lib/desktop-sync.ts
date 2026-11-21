import {env} from 'cloudflare:workers';

export function syncUser(request:Request){
  const token=(env as any).CANVAS_SYNC_TOKEN as string|undefined;
  const user=(env as any).CANVAS_SYNC_USER_ID as string|undefined;
  if(!token||!user||request.headers.get('x-canvas-sync-token')!==token)throw new Error('桌面同步未授权');
  return user;
}
