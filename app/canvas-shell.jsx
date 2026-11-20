"use client";
import dynamic from 'next/dynamic';
const ProjectApp=dynamic(()=>import('../src/main'),{ssr:false});
export default function CanvasShell(){return <ProjectApp/>}
