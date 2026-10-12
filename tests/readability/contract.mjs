import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {readableTextMetrics} from './contrast.mjs';
const {default:puppeteer}=await import(process.env.PUPPETEER_MODULE||'puppeteer-core');
const root=new URL('../../',import.meta.url).pathname;
const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/church-palette.css"><link rel="stylesheet" href="/app-consistency.css"><style>.demo-custom{background:#214f45;color:#fff}.demo-custom strong{color:inherit}button{padding:12px}.dark{padding:20px}</style><button id="primary">儲存資料</button><button id="secondary" class="secondary">取消</button><button id="surface" data-app-control="surface" aria-pressed="false"><strong>教材標題</strong><small>清單說明</small></button><button id="custom" class="demo-custom" data-app-control="custom"><strong>場景控制</strong></button><section class="dark" data-app-surface="dark"><h1>深色區標題</h1><p>深色區說明</p></section>`;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const checks=[];
try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage();
 const color=selector=>page.$eval(selector,n=>{const s=getComputedStyle(n);return{color:s.color,background:s.backgroundColor,image:s.backgroundImage,height:n.getBoundingClientRect().height};});
 for(const width of [390,1440]){
  await page.setViewport({width,height:900});await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle0'});
  assert.match((await color('#primary')).image,/linear-gradient/);assert.equal((await color('#primary')).color,'rgb(255, 255, 255)');
  assert.equal((await color('#secondary')).background,'rgb(255, 255, 255)');
  assert.equal((await color('#surface')).image,'none');assert.notEqual((await color('#surface')).color,'rgb(255, 255, 255)');
  assert.equal((await color('#custom')).background,'rgb(33, 79, 69)');assert.equal((await color('#custom strong')).color,'rgb(255, 255, 255)');
  assert.equal((await color('[data-app-surface] h1')).color,'rgb(255, 255, 255)');assert.deepEqual((await page.evaluate(readableTextMetrics)).failures,[]);
  checks.push({width,state:'default',passed:true});
  await page.hover('#surface');assert.equal((await color('#surface')).image,'none');assert.deepEqual((await page.evaluate(readableTextMetrics)).failures,[]);checks.push({width,state:'hover',passed:true});
  await page.$eval('#surface',n=>n.setAttribute('aria-pressed','true'));assert.equal((await color('#surface')).background,'rgb(249, 228, 215)');assert.deepEqual((await page.evaluate(readableTextMetrics)).failures,[]);checks.push({width,state:'selected-hover',passed:true});
  await page.hover('#primary');assert.equal((await color('#surface')).background,'rgb(255, 240, 230)');assert.deepEqual((await page.evaluate(readableTextMetrics)).failures,[]);checks.push({width,state:'selected',passed:true});
 }
 console.log(JSON.stringify({passed:true,checks},null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
