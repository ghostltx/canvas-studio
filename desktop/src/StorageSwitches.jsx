import React from 'react';

export default function StorageSwitches({mode,busy,onToggle}){
  return <div className="storage-switches" aria-label="画布存储位置">
    {[['nas','NAS'],['cloud','Cloudflare']].map(([key,label])=><label className="storage-switch" key={key} title={`${label} 存储${mode[key]?'已开启':'已关闭'}`}>
      <span>{label}</span><input type="checkbox" role="switch" aria-label={`${label} 存储`} checked={mode[key]} disabled={busy} onChange={()=>onToggle(key)}/><span className="storage-switch-track" aria-hidden="true"><i/></span>
    </label>)}
    {busy&&<span className="storage-switch-busy">同步中…</span>}
  </div>;
}
