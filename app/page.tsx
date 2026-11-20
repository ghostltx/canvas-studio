import {requireChatGPTUser} from './chatgpt-auth';
import CanvasShell from './canvas-shell';

export const dynamic='force-dynamic';
export default async function Home(){
  await requireChatGPTUser('/');
  return <CanvasShell/>;
}
