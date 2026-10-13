#!/usr/bin/env python3
"""Resumable public YouTube download and chunked local ASR. Supervisor enforces clock."""
import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import shutil
import subprocess
import sys
import time
from urllib.parse import urlparse,parse_qs
from media_policy import allowed,local,limit,next_start,POLICY
SERMON_PYTHON='/Volumes/MPLUS-DATA/mplus-ai/runtime/sermon/bin/python'
MLX_PYTHON='/Volumes/MPLUS-DATA/mplus-ai/runtime/mlx/bin/python'
FFMPEG='/Volumes/MPLUS-DATA/mplus-ai/runtime/sermon/lib/python3.12/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1'
WHISPER='/Volumes/MPLUS-DATA/mplus-ai/models/whisper-large-v3-turbo'
MAX_BYTES=1024**3
class Deferred(Exception):
    def __init__(self,message):self.message=message;self.next_at=next_start().isoformat()
def atomic(path,value):
    path=Path(path);tmp=path.with_name('.'+path.name+'.pending');tmp.write_text(json.dumps(value,ensure_ascii=False));os.chmod(tmp,0o600);os.replace(tmp,path)
def load(path,default):
    try:return json.loads(Path(path).read_text())
    except FileNotFoundError:return default
def canonical(url):
    p=urlparse(url)
    if p.scheme!='https' or p.username or p.password or p.port or p.fragment:raise ValueError('invalid_video_url')
    if p.hostname in ('youtube.com','www.youtube.com','m.youtube.com') and p.path=='/watch':vid=parse_qs(p.query).get('v',[''])[0]
    elif p.hostname=='youtu.be' and len(p.path.split('/'))==2:vid=p.path[1:]
    else:raise ValueError('invalid_video_url')
    import re
    if not re.fullmatch('[A-Za-z0-9_-]{11}',vid):raise ValueError('invalid_video_url')
    return 'https://www.youtube.com/watch?v='+vid

def terminate(proc):
    if proc.poll() is not None:return
    os.killpg(proc.pid,signal.SIGTERM)
    try:proc.wait(timeout=8)
    except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()

def supervise(command,directory,progress,stop,phase,rate_file):
    rate_state=load(rate_file,{'samples':[]});cap=limit(rate_state['samples'])
    if not allowed():raise Deferred('已到時段外，將於台北時間 01:00 接續。')
    if phase=='download' and cap=='unmeasured':raise Deferred('06:00 後缺少今天凌晨的實測均速；等待下個 01:00 測量後接續下載。')
    args=list(command)
    if phase=='download':args+=['--rate',str(cap or 0),'--rate-file',str(rate_file)]
    proc=subprocess.Popen(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
    last=0
    try:
        while proc.poll() is None:
            if stop.is_set():raise Deferred('Mini 暫停，已完成進度保留；下個時段接續。')
            if not allowed():raise Deferred('已到中午 12:00，下載與轉錄暫停；明日 01:00 接續。')
            if phase=='download' and local().hour>=6 and cap is None:
                terminate(proc);return False # restart with a new rate budget exactly at 06:00
            if time.monotonic()-last>=10:
                state=load(directory/'progress.json',{})
                policy='06:00 前不額外限速' if local().hour<6 else ('限速 %.2f MiB/s'%(cap/1024**2) if isinstance(cap,int) else '轉錄時段內')
                progress(state.get('message','正在處理影片…')+' · '+policy);last=time.monotonic()
            time.sleep(0.5)
        if proc.returncode:raise RuntimeError('media_process_failed')
        return True
    finally:terminate(proc)

def run(directory,url,rate_file,progress,stop):
    directory=Path(directory);url=canonical(url)
    if shutil.disk_usage(directory).free<6*1024**3:raise RuntimeError('ssd_capacity_low')
    receipt=directory/'download.json'
    while not receipt.exists():
        if supervise([SERMON_PYTHON,'-B',__file__,'download','--directory',str(directory),'--url',url],directory,progress,stop,'download',rate_file):break
    info=load(receipt,{})
    if not (directory/'transcript.json').exists():
        supervise([MLX_PYTHON,'-B',__file__,'transcribe','--directory',str(directory)],directory,progress,stop,'transcribe',rate_file)
    result=load(directory/'transcript.json',{});result.update({'url':url,'title':info['title'],'policy':POLICY,'speaker':'講員與範圍待確認','reviewed':False})
    return result,directory/info['file']

def download(args):
    import yt_dlp
    root=args.directory;rate_file=args.rate_file;state=load(rate_file,{'samples':[]});last=[None,None,0]
    def hook(event):
        if not allowed():raise RuntimeError('window_closed')
        total=event.get('downloaded_bytes',0)
        if total>MAX_BYTES:raise ValueError('video_too_large')
        now=time.monotonic()
        if last[0] is None or total<last[1]:last[0],last[1]=now,total
        elif now-last[0]>=0.25:
            if args.rate==0 and now-last[0]<=30:state['samples'].append({'at':dt.datetime.now(dt.timezone.utc).timestamp(),'seconds':now-last[0],'bytes':total-last[1]})
            last[0],last[1]=now,total
        if now-last[2]>=2 or event['status']=='finished':
            cutoff=time.time()-86400;state['samples']=[s for s in state['samples'] if s['at']>cutoff]
            atomic(rate_file,state);atomic(root/'progress.json',{'message':'下載影片 %.1f MiB'%(total/1024**2)});last[2]=now
    def match(info,*,incomplete=False):
        if info.get('is_live'):return '請於直播結束後加入'
        if (info.get('duration') or 0)>7200:return '第一版每支影片上限兩小時'
        if not incomplete and not info.get('duration'):return '缺少影片長度'
    options={'format':'best[height<=720][ext=mp4]/best[height<=720]','outtmpl':str(root/'video.%(ext)s'),'noplaylist':True,'continuedl':True,'concurrent_fragment_downloads':1,'max_filesize':MAX_BYTES,'match_filter':match,'ffmpeg_location':FFMPEG,'progress_hooks':[hook],'quiet':True,'no_warnings':True,'retries':3,'fragment_retries':3,'socket_timeout':20,'overwrites':False}
    if args.rate:options['ratelimit']=args.rate
    with yt_dlp.YoutubeDL(options) as downloader:
        info=downloader.extract_info(canonical(args.url),download=True)
        if not info:raise ValueError('video_unavailable')
        path=Path(downloader.prepare_filename(info))
    if not path.is_file() or path.stat().st_size>MAX_BYTES:raise ValueError('video_missing')
    atomic(root/'download.json',{'file':path.name,'title':str(info.get('title',''))[:500],'duration':info['duration'],'url':canonical(args.url)})

def transcribe(args):
    import mlx_whisper
    import mlx.core as mx
    # mlx_whisper uses ffmpeg from PATH. No system package or network model download.
    os.environ['PATH']=str(Path(FFMPEG).parent)+os.pathsep+os.environ.get('PATH','')
    root=args.directory;info=load(root/'download.json',{});source=root/info['file'];chunks=load(root/'chunks.json',[])
    for index in range(math.ceil(info['duration']/120)):
        if index<len(chunks):continue
        if not allowed():raise RuntimeError('window_closed')
        atomic(root/'progress.json',{'message':'本機轉錄第 %d／%d 段'%(index+1,math.ceil(info['duration']/120))})
        wave=root/'chunk.wav'
        subprocess.run([FFMPEG,'-nostdin','-v','error','-y','-ss',str(index*120),'-i',str(source),'-t','120','-ar','16000','-ac','1',str(wave)],check=True)
        # Pass decoded numpy audio, avoiding a second ffmpeg lookup inside mlx_whisper.
        import wave as wav
        import numpy as np
        with wav.open(str(wave),'rb') as audio:samples=np.frombuffer(audio.readframes(audio.getnframes()),np.int16).astype(np.float32)/32768.0
        result=mlx_whisper.transcribe(samples,path_or_hf_repo=WHISPER,language='zh',verbose=False,condition_on_previous_text=False,initial_prompt='以下為繁體中文的教會講道逐字稿。')
        segments=[{'start':round(index*120+s['start'],2),'end':round(index*120+s['end'],2),'content':s['text'].strip()} for s in result.get('segments',[]) if s['text'].strip()]
        chunks.append(segments);atomic(root/'chunks.json',chunks);wave.unlink(missing_ok=True);mx.clear_cache()
    segments=[s for chunk in chunks for s in chunk]
    if not segments:raise ValueError('empty_transcript')
    # Full transcript stays on SSD/NAS; bounded preview is enough for the coworker picker.
    digest=hashlib.sha256()
    with source.open('rb') as original:
        for block in iter(lambda:original.read(1024**2),b''):digest.update(block)
    atomic(root/'transcript.json',{'segments':segments,'model':'whisper-large-v3-turbo','url':info.get('url',''),'title':info.get('title',''),'duration':info['duration'],'video_sha256':digest.hexdigest(),'speaker':'講員與範圍待確認','reviewed':False,'policy':POLICY})

if __name__=='__main__':
    os.umask(0o077);p=argparse.ArgumentParser();p.add_argument('mode',choices=['download','transcribe']);p.add_argument('--directory',type=Path,required=True);p.add_argument('--url');p.add_argument('--rate',type=int,default=0);p.add_argument('--rate-file',type=Path);args=p.parse_args()
    if args.mode=='download':download(args)
    else:transcribe(args)
