"""Air candidates continue through the existing Mini worker, never a second transcriber."""
import base64,contextlib,datetime as dt,fcntl,hashlib,json,os,re,subprocess,time,uuid
from pathlib import Path
import media
from media_policy import allowed,limit,next_start,next_download_start
ROOT=Path('/Volumes/MPLUS-DATA/mplus-private/sermon-workspace/library-archive')
RELAY=Path('/Users/james-codex/mplus-air-relay')
VID=re.compile('[A-Za-z0-9_-]{11}')

def read(path,default=None):
 try:return json.loads(Path(path).read_text())
 except FileNotFoundError:return {} if default is None else default

def atomic(path,value):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True,mode=0o700);media.atomic(path,value)

def note(**values):
 atomic(ROOT/'progress.json',{'updated_at':dt.datetime.now(dt.timezone.utc).isoformat(),**values})

def intake(action,**data):
 runtime='/share/CACHEDEV1_DATA/homes/james/mplus-ai-workspace/runtime'
 command='exec '+runtime+'/glibc/ld-2.31.so --library-path '+runtime+'/glibc:'+runtime+'/lib:'+runtime+'/python/lib:/lib:/usr/lib '+runtime+'/python/bin/python3 -B /share/homes/james/mplus-ai-workspace/sermon-library/bin/mini-transcript-intake.py'
 p=subprocess.run(['/usr/bin/ssh','-o','ConnectTimeout=8','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2','-o','HostKeyAlgorithms=rsa-sha2-512','mplus-qnap',command],input=json.dumps({'action':action,**data},ensure_ascii=False).encode(),capture_output=True,timeout=90)
 result=json.loads(p.stdout)
 if not result.get('ok'):raise RuntimeError('nas_intake_retry')
 return result

def sync_known(extra=()):
 path=RELAY/'known-video-ids.json';known=set(read(path,[]))|set(extra)
 for p in ROOT.glob('speaker-*/*/manifest.json'):known.add(read(p)['video_id'])
 known|={x['video_id'] for x in read(ROOT/'queue.json',[])}
 if any(not VID.fullmatch(x) for x in known):raise ValueError('invalid_known_id')
 atomic(path,sorted(known));return known

def io_tick(worker):
 if not ROOT.is_dir():return False
 health=intake('status');atomic(ROOT/'nas-health.json',{'at':time.time(),**health})
 if health['status']!='ready':note(status=health['status'],retained_locally=True);return False
 sync_known(x['video_id'] for x in health['known'])
 pending=[]
 for p in sorted(ROOT.glob('speaker-*/*/manifest.json')):
  folder=p.parent;status=read(folder/'archive-status.json')
  if (folder/'transcript.timestamped.txt').exists() and not status.get('archive_bundle_backup'):pending.append(folder)
 if not pending:return False
 folder=pending[0];guard=(folder/'.episode.lock').open('a')
 try:fcntl.flock(guard,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:guard.close();return False
 with guard:
  meta=read(folder/'manifest.json');status=read(folder/'archive-status.json');raw=(folder/'transcript.timestamped.txt').read_bytes()
  if not status.get('private_library'):
   result=intake('import',manifest=meta,text_base64=base64.b64encode(raw).decode(),text_sha256=hashlib.sha256(raw).hexdigest())
   if result['status'] not in ('imported','already_imported'):note(status=result['status'],video_id=meta['video_id'],retained_locally=True);return False
   status['private_library']=result['item'];atomic(folder/'archive-status.json',status)
  project={'owner_id':read(ROOT/'config.json')['owner_id'],'id':str(uuid.uuid5(uuid.NAMESPACE_URL,'mplus-sermon-archive:'+meta['video_id']))}
  bundle={'format':'mplus-private-sermon-archive','manifest':meta,'private_library':status['private_library'],'human_reviewed':False,'files':{p.name:p.read_text() for p in folder.iterdir() if p.name in ('transcript.raw.json','transcript.raw.srt','transcript.timestamped.txt','transcription-config.json')}}
  bundle_file=folder/'archive-bundle.json';atomic(bundle_file,bundle)
  receipts={}
  for host in ('qnap','synology'):receipts[host]=worker.asset_copy(bundle_file,project,host)
  if receipts['qnap']['sha256']!=receipts['synology']['sha256']:raise RuntimeError('archive_bundle_hash_mismatch')
  status['archive_bundle_backup']={'verified':True,'qnap':receipts['qnap'],'synology':receipts['synology'],'audio_deleted':False,'human_reviewed':False};atomic(folder/'archive-status.json',status)
  sync_known([meta['video_id']]);note(status='imported_and_dual_nas_bundle_verified',video_id=meta['video_id'],human_reviewed=False)
  return True

def attribution(info,source,names_by_speaker):
 if info.get('channel_id') not in source['channel_ids']:return False
 title=str(info.get('title','')).casefold()
 found={sid for sid,names in names_by_speaker.items() if any(name.casefold() in title for name in names)}
 return found=={source['id']} and not info.get('is_live') and info.get('availability','public') in ('public','unlisted') and 60<=float(info.get('duration') or 0)<=14400

def metadata(row):
 p=subprocess.run([media.SERMON_PYTHON,'-B','-m','yt_dlp','--no-playlist','--skip-download','--dump-single-json','--no-warnings','--socket-timeout','10','--retries','0','https://www.youtube.com/watch?v='+row['video_id']],capture_output=True,text=True,timeout=45)
 if p.returncode:raise RuntimeError('metadata_retry')
 info=json.loads(p.stdout)
 if info.get('id')!=row['video_id']:raise ValueError('video_id_changed')
 return info

def revision():
 feed=read(RELAY/'incoming-air/candidates.json').get('candidates',[])
 data=[(r.get('video_id'),r.get('speaker_id'),r.get('title'),r.get('channel_id')) for r in feed]
 return hashlib.sha256(json.dumps({'candidates':data,'rules':read(ROOT/'config.json')},sort_keys=True,ensure_ascii=False).encode()).hexdigest()

def reserve_next():
 config=read(ROOT/'config.json');rotation=read(ROOT/'rotation-state.json');queue=read(ROOT/'queue.json',[])
 if queue:return queue[0]
 sid=rotation['next_speaker_id'];source=next(s for s in config['sources'] if s['id']==sid);known=sync_known();feed=read(RELAY/'incoming-air/candidates.json')
 rows=[r for r in feed.get('candidates',[]) if r['speaker_id']==sid and r['video_id'] not in known and VID.fullmatch(r['video_id']) and attribution({'availability':'public',**r},source,config['names_by_speaker'])]
 rows.sort(key=lambda r:float(r.get('duration') or 0)<600)
 if not rows:
  advance(sid,'skipped_no_verified_episode',None);note(status='source_verification_gap',speaker_id=sid,kept_in_air_candidates=True);return None
 row=rows[0];info=metadata(row)
 if not attribution(info,source,config['names_by_speaker']):note(status='metadata_attribution_changed',video_id=row['video_id']);return None
 job={'video_id':info['id'],'speaker_id':sid,'round':rotation['current_round'],'metadata':{k:info.get(k) for k in ('id','title','channel_id','channel','duration','upload_date','was_live','availability')},'verified_at':dt.datetime.now(dt.timezone.utc).isoformat()}
 atomic(ROOT/'queue.json',[job]);sync_known([job['video_id']]);note(status='verified_queued',video_id=job['video_id'],speaker_id=sid);return job

def advance(sid,status,vid):
 rotation=read(ROOT/'rotation-state.json');round_no=rotation['current_round'];speaker=next(s for s in rotation['speakers'] if s['speaker_id']==sid)
 speaker['round_'+str(round_no)]={'status':status,'video_id':vid,'at':dt.datetime.now(dt.timezone.utc).isoformat()}
 index=int(sid[-2:]);rotation['next_speaker_id']='speaker-%02d'%(index%11+1)
 if index==11:
  if not any(isinstance(s.get('round_'+str(round_no)),dict) and s['round_'+str(round_no)].get('video_id') for s in rotation['speakers']):rotation['exhausted_revision']=revision()
  rotation['current_round']+=1
 rotation['updated_at']=dt.datetime.now(dt.timezone.utc).isoformat();atomic(ROOT/'rotation-state.json',rotation)

def model_tick(worker,stop):
 if not ROOT.is_dir():return False
 rotation=read(ROOT/'rotation-state.json')
 if rotation.get('exhausted_revision')==revision():return False
 job=reserve_next()
 if not job:return False
 config=read(ROOT/'config.json');source=next(s for s in config['sources'] if s['id']==job['speaker_id']);folder=ROOT/job['speaker_id']/job['video_id'];folder.mkdir(parents=True,exist_ok=True,mode=0o700)
 rate_file=worker.HOME_ROOT/'download-rate.json';cap=limit(read(rate_file,{'samples':[]})['samples'])
 if not (folder/'download.json').exists() and (read(ROOT/'nas-health.json').get('status')!='ready' or time.time()-read(ROOT/'nas-health.json').get('at',0)>300):note(status='waiting_for_nas_backup_priority',video_id=job['video_id']);return False
 if not (folder/'download.json').exists() and not (folder/'download-policy.json').exists() and cap=='unmeasured':note(status='waiting_next_0000_no_measured_baseline',video_id=job['video_id'],next_at=next_download_start().isoformat());return False
 lease=(worker.HOME_ROOT/'transcriber.lock').open('a')
 try:fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:lease.close();note(status='single_transcriber_busy');return False
 guard=(folder/'.episode.lock').open('a')
 try:fcntl.flock(guard,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:lease.close();guard.close();return False
 with lease,guard:
  worker.MODEL_STATE=None
  import mlx.core as mx
  mx.clear_cache()
  def progress(message):note(status='processing',video_id=job['video_id'],speaker_id=job['speaker_id'],progress=message)
  verify={'source':source,'names_by_speaker':config['names_by_speaker']};atomic(folder/'verification.json',verify)
  try:
   while not (folder/'download.json').exists():
    if media.supervise([media.SERMON_PYTHON,'-B',media.__file__,'download','--directory',str(folder),'--url','https://www.youtube.com/watch?v='+job['video_id'],'--audio-only','--max-duration','14400','--file-stem','source','--verification-file',str(folder/'verification.json')],folder,progress,stop,'download',rate_file):break
   download=read(folder/'download.json');audio=folder/download['file']
   digest=hashlib.sha256()
   with audio.open('rb') as stream:
    for block in iter(lambda:stream.read(1024**2),b''):digest.update(block)
   if not (folder/'manifest.json').exists():
    atomic(folder/'manifest.json',{'video_id':job['video_id'],'speaker_id':source['id'],'speaker':source['name'],'title':download['title'],'source_url':download['url'],'speaker_evidence_url':download['url'],'speaker_evidence_type':'explicit_episode_title_speaker','publisher':job['metadata']['channel'],'channel_id':job['metadata']['channel_id'],'published_date':job['metadata']['upload_date'],'duration_seconds':int(download['duration']),'language':'en' if source['id']=='speaker-09' else 'zh','audio_file':audio.name,'audio_bytes':audio.stat().st_size,'audio_sha256':digest.hexdigest(),'retrieved_at':dt.datetime.now(dt.timezone.utc).isoformat(),'was_live':job['metadata']['was_live'],'download_rate_policy':download.get('rate_policy'),'content_scope':'sermon_range_needs_review','audio_retention':'temporary_until_review_and_verified_backup'})
   if not (folder/'archive-status.json').exists() or not (folder/'transcript.timestamped.txt').exists():
    media.supervise([media.MLX_PYTHON,'-B',str(ROOT/'transcribe.py'),str(folder),'--lock-fd',str(lease.fileno())],folder,progress,stop,'transcribe',rate_file,lock_fd=lease.fileno())
   advance(source['id'],'transcribed_local_import_backup_pending',job['video_id']);atomic(ROOT/'queue.json',[]);note(status='transcribed_waiting_nas_intake',video_id=job['video_id']);return True
  except media.Deferred as exc:note(status='waiting_next_window',video_id=job['video_id'],reason=exc.message,next_at=exc.next_at);return False
