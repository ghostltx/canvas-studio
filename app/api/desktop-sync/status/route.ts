import {bindings,failure,json} from '../../../../lib/canvas-store';
import {syncUser} from '../../../../lib/desktop-sync';

export async function GET(request:Request){try{syncUser(request);bindings();return json({ok:true})}catch(error){return failure(error,401)}}
