importScripts('../vendor/jsqr-1.4.0.js');
onmessage=({data})=>{
 const pixels=new Uint8ClampedArray(data.pixels),codes=[];
 for(let i=0;i<4;i++){
  const found=jsQR(pixels,data.width,data.height,{inversionAttempts:'dontInvert'});if(!found)break;codes.push(found.data);
  const points=Object.values(found.location);const left=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x)))-4),right=Math.min(data.width,Math.ceil(Math.max(...points.map(p=>p.x)))+4),top=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y)))-4),bottom=Math.min(data.height,Math.ceil(Math.max(...points.map(p=>p.y)))+4);
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const n=(y*data.width+x)*4;pixels[n]=pixels[n+1]=pixels[n+2]=255;}
 }
 postMessage(codes);
};
