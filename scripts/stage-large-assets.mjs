import {readdir,readFile,writeFile,unlink,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../dist/client/',import.meta.url));
const staged=fileURLToPath(new URL('../.sites-runtime/runtime-assets/',import.meta.url));
await mkdir(staged,{recursive:true});
async function visit(dir){
  for(const item of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,item.name);
    if(item.isDirectory()){await visit(path);continue}
    if(!/\.(?:onnx|wasm)$/.test(item.name))continue;
    const bytes=await readFile(path);
    if(bytes.length<=25*1024*1024)continue;
    const name=item.name.endsWith('.onnx')?'model.onnx':'runtime.wasm';
    await writeFile(join(staged,name),bytes);
    await unlink(path);
    console.log(`Staged ${item.name} (${bytes.length} bytes) for R2 upload`);
  }
}
await visit(root);
