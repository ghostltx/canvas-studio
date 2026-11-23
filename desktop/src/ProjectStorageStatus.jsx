import React from 'react';
import {Cloud,HardDrive} from 'lucide-react';
import './project-storage-status.css';

export default function ProjectStorageStatus({mode,hosted=false,busy=false}){
  const locations=[
    {key:'nas',name:'NAS',Icon:HardDrive,detail:hosted?'在线版未连接 NAS；可在本地版启用 NAS 存储':mode.nas?'画布保存到 NAS': 'NAS 存储未启用'},
    {key:'cloud',name:'Cloudflare',Icon:Cloud,detail:mode.cloud?'画布保存到云端，数据库由 ChatGPT Sites 托管':'Cloudflare 存储未启用'}
  ];
  return <div className="project-storage-status" role="group" aria-label="数据存储位置" aria-busy={busy}>
    {locations.map(({key,name,Icon,detail})=>{
      const active=mode[key],label=`${name}：${busy?'正在切换存储':active?'已启用':'未启用'}`;
      return <span key={key} className={`storage-location ${key} ${active?'active':'inactive'}`} role="img" aria-label={`${label}。${detail}`} tabIndex={0} data-active={active}>
        <span className="storage-location-icon" aria-hidden="true"><Icon size={19}/></span>
        <span className="storage-location-label" aria-hidden="true">{name}</span>
        <span className="storage-location-tooltip" aria-hidden="true"><strong>{label}</strong>{detail}</span>
      </span>;
    })}
    {!mode.nas&&!mode.cloud&&<span className="storage-browser-label">浏览器本地</span>}
  </div>;
}
