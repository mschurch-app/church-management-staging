import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {bootstrap,stubs} from './closeout-fixture.mjs';
export async function startFixture(port=0){
 const root=path.resolve(import.meta.dirname,'..');
 const server=createServer(async(req,res)=>{try{const file=new URL(req.url,'http://fixture').pathname,target=path.resolve(root,'.'+file);if(!target.startsWith(root+path.sep))throw Error('Invalid path');let data=stubs[file]!==undefined?stubs[file]:await readFile(target);if(file.endsWith('.html'))data=data.toString().replace('</head>',bootstrap+'</head>');res.setHeader('Content-Security-Policy',"connect-src 'self'; form-action 'self'; frame-src 'none'");res.setHeader('content-type',file.endsWith('.html')?'text/html;charset=utf-8':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'image/svg+xml');res.end(data);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(port,'127.0.0.1',r));return {server,origin:'http://127.0.0.1:'+server.address().port};
}
if(process.argv[1]===import.meta.filename){const {origin}=await startFixture(Number(process.env.CLOSEOUT_PORT)||8778);console.log(origin);}
