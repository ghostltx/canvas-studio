import React from 'react';
import './generated-image.css';

export default function GeneratedImage({src,nodeId,resizeNode}){
  const fitImage=event=>{
    const image=event.currentTarget;
    const frame=image.parentElement;
    const card=frame?.closest('.canvas-node');
    if(!card||!image.naturalWidth||!image.naturalHeight)return;
    const fullHeight=Math.ceil(frame.clientWidth*image.naturalHeight/image.naturalWidth);
    const missing=fullHeight-frame.clientHeight;
    if(missing>2)resizeNode(nodeId,card.clientWidth,card.clientHeight+missing);
  };
  return <div className="generate-result"><img src={src} alt="生成结果" draggable="false" onLoad={fitImage}/></div>;
}
