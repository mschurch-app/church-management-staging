"""Small private transcript intake; preserve backup priority and existing catalog writer."""
import base64,contextlib,datetime as dt,fcntl,hashlib,importlib.util,json,os,re,sys,tempfile
from pathlib import Path
from types import SimpleNamespace
ROOT=Path('/share/homes/james/mplus-ai-workspace/sermon-library')
def module():
 spec=importlib.util.spec_from_file_location('library',ROOT/'bin/sermon-library.py');lib=importlib.util.module_from_spec(spec);spec.loader.exec_module(lib);return lib
def main():
 os.umask(0o077);body=json.loads(sys.stdin.buffer.read(3000000));lib=module()
 if os.getloadavg()[0]>3.5:return {'status':'deferred_nas_load'}
 guard=(ROOT/'state/library.lock').open('a')
 try:fcntl.flock(guard,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:return {'status':'deferred_backup_or_writer_active'}
 with contextlib.closing(lib.connect()) as con:
  rows=con.execute("SELECT s.id,a.asset_sha,p.payload_json FROM sermons s JOIN sermon_assets a ON a.sermon_id=s.id JOIN asset_provenance p ON p.asset_sha=a.asset_sha").fetchall()
  known=[]
  for row in rows:
   info=json.loads(row['payload_json']);match=re.search(r'(?:youtube\.com/watch\?v=|youtu\.be/)([A-Za-z0-9_-]{11})',info.get('source_url',''))
   if match:known.append({'video_id':match[1],'sermon_id':row['id'],'sha256':row['asset_sha'],'imported_at':info.get('imported_at'),'status':'extracted_needs_review'})
 if body['action']=='status':return {'status':'ready','known':known,'backup':json.loads((ROOT/'state/backup-status.json').read_text())}
 if body['action']!='import':raise ValueError('invalid_action')
 meta=body['manifest'];vid=meta['video_id']
 if not re.fullmatch('[A-Za-z0-9_-]{11}',vid) or meta['speaker_evidence_type'] not in ('official_episode_speaker_field','explicit_episode_title_speaker'):raise ValueError('invalid_source')
 if any(x['video_id']==vid for x in known):return {'status':'already_imported','item':next(x for x in known if x['video_id']==vid)}
 raw=base64.b64decode(body['text_base64'],validate=True)
 if not 0<len(raw)<=2000000 or hashlib.sha256(raw).hexdigest()!=body['text_sha256']:raise ValueError('invalid_text')
 with contextlib.closing(lib.connect()) as con:
  total=con.execute('SELECT coalesce(sum(bytes),0) FROM assets').fetchone()[0]
 if 2*(total+len(raw)+lib.DB.stat().st_size)>lib.MAX_SNAPSHOT-64*1024**2:return {'status':'deferred_backup_capacity_preserve_local'}
 path=ROOT/'inbox/transcripts'/(vid+'.raw.txt')
 if path.is_symlink():raise ValueError('symlink')
 if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest()!=body['text_sha256']:raise ValueError('existing_transcript_conflict')
 if not path.exists():
  fd,temp=tempfile.mkstemp(prefix='.air-transcript-',dir=str(path.parent))
  try:
   with os.fdopen(fd,'wb') as out:out.write(raw);out.flush();os.fsync(out.fileno())
   os.link(temp,str(path))
  finally:os.unlink(temp)
 # Release the preflight guard; import_file takes the same nonblocking lock itself.
 guard.close()
 date=meta.get('published_date','');date=(date[:4]+'-'+date[4:6]+'-'+date[6:8]) if re.fullmatch('[0-9]{8}',date) else ''
 scope='full_service_mixed_speakers' if meta.get('was_live') or meta.get('content_scope')=='full_service_mixed_speakers' else 'sermon_range_needs_review'
 receipt=lib.import_file(SimpleNamespace(input=str(path),title=meta['title'],speaker=meta['speaker'],date=date,scripture=meta.get('scripture',''),sermon_id=None,visibility='private',source_url='https://www.youtube.com/watch?v='+vid,content_scope=scope))
 return {'status':'imported','item':{'video_id':vid,**receipt,'imported_at':lib.now(),'speaker_scope_verified':False}}
if __name__=='__main__':
 try:print(json.dumps({'ok':True,**main()},ensure_ascii=False))
 except RuntimeError as e:print(json.dumps({'ok':False,'status':'deferred_preserve_local','error_class':type(e).__name__}));sys.exit(1)
 except Exception as e:print(json.dumps({'ok':False,'status':'failed_preserve_local','error_class':type(e).__name__}));sys.exit(1)
