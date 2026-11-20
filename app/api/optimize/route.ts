import {failure,json,userId} from '../../../lib/canvas-store';
import {optimizePrompt} from '../../../lib/image-api';
export async function POST(request:Request){
  try{userId(request);const input=await request.json() as Parameters<typeof optimizePrompt>[0];return json({text:await optimizePrompt(input)})}
  catch(error){return failure(error,error instanceof Error&&error.message.includes('登录')?401:500)}
}
