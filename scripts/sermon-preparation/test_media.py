import datetime as dt
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch,MagicMock
import media_policy as policy
import media
import nas_bridge as bridge
import hashlib
import uuid
class Policy(unittest.TestCase):
 def at(self,value):return dt.datetime.fromisoformat('2026-10-14T'+value).replace(tzinfo=policy.TAIPEI)
 def test_all_day_boundaries(self):
  for clock,expected in [('00:00:00','unlimited'),('07:59:59','unlimited'),('08:00:00','half'),('14:59:59','half'),('15:00:00','third'),('23:59:59','third')]:
   self.assertEqual(policy.band(self.at(clock)),expected);self.assertTrue(policy.allowed(self.at(clock)))
  self.assertEqual(policy.next_download_start(self.at('15:00:00')).astimezone(policy.TAIPEI).isoformat(),'2026-10-15T00:00:00+08:00')
 def samples(self):return [{'at':self.at('07:40:00').timestamp(),'seconds':2,'bytes':2000},{'at':self.at('07:41:00').timestamp(),'seconds':8,'bytes':18000}]
 def test_weighted_average_half_and_third(self):
  samples=self.samples();self.assertEqual(policy.average(samples,self.at('08:00:00')),2000)
  self.assertIsNone(policy.limit(samples,self.at('07:59:59')))
  self.assertEqual(policy.limit(samples,self.at('08:00:00')),1000)
  self.assertEqual(policy.limit(samples,self.at('15:00:00')),666)
  self.assertEqual(policy.limit([],self.at('15:00:00')),'unmeasured')
  stale=[{'at':self.at('07:00:00').timestamp(),'seconds':10,'bytes':1000}]
  self.assertEqual(policy.limit(stale,self.at('08:00:00')),'unmeasured')
 def test_existing_video_cap_survives_every_boundary_and_restart(self):
  for cap in (None,1000,666):
   with tempfile.TemporaryDirectory() as d:
    root=Path(d);selected={'selected_at_utc':'2026-10-13T23:59:59+00:00','band':'unlimited' if cap is None else 'half','rate_bytes_per_second':cap,'locked_until_video_complete':True}
    media.atomic(root/'download-policy.json',selected)
    for clock in ('08:00:00','15:00:00','00:00:00'):
     proc=MagicMock();proc.poll.side_effect=[None,0];proc.returncode=0
     with patch.object(policy,'local',return_value=self.at(clock)),patch.object(media,'selection',side_effect=AssertionError('Must reuse saved cap')),patch.object(media.subprocess,'Popen',return_value=proc) as start,patch.object(media,'terminate'),patch.object(media.time,'sleep'):
      self.assertTrue(media.supervise(['downloader'],root,lambda _:None,MagicMock(is_set=lambda:False),'download',root/'rates.json'))
      self.assertEqual(start.call_count,1);argv=start.call_args.args[0];self.assertEqual(argv[argv.index('--rate')+1],str(cap or 0))
     self.assertEqual(media.load(root/'download-policy.json',None),selected)
 def test_new_video_uses_current_band_and_no_baseline_does_not_start(self):
  for clock,cap in [('07:59:59',None),('08:00:00',1000),('15:00:00',666)]:
   with tempfile.TemporaryDirectory() as d:
    root=Path(d);media.atomic(root/'rates.json',{'samples':self.samples()});proc=MagicMock();proc.poll.return_value=0;proc.returncode=0
    with patch.object(policy,'local',return_value=self.at(clock)),patch.object(media.subprocess,'Popen',return_value=proc),patch.object(media,'terminate'):
     media.supervise(['downloader'],root,lambda _:None,MagicMock(is_set=lambda:False),'download',root/'rates.json')
    self.assertEqual(media.load(root/'download-policy.json',None)['rate_bytes_per_second'],cap)
  with tempfile.TemporaryDirectory() as d,patch.object(policy,'local',return_value=self.at('08:00:00')),patch.object(media.subprocess,'Popen') as start:
   root=Path(d)
   with self.assertRaises(media.Deferred) as error:media.supervise(['downloader'],root,lambda _:None,MagicMock(is_set=lambda:False),'download',root/'rates.json')
   self.assertEqual(error.exception.stage,'baseline');start.assert_not_called();self.assertFalse((root/'download-policy.json').exists())
 def test_canonical_public_youtube_only(self):
  self.assertEqual(media.canonical('https://youtu.be/abcdefghijk'),'https://www.youtube.com/watch?v=abcdefghijk')
  for url in ('http://192.168.0.112/test','https://youtube.com.evil.test/watch?v=abcdefghijk','https://youtube.com/playlist?list=abc','https://youtube.com:443/watch?v=abcdefghijk'):
   # Explicit :443 is normalized by some URL parsers, but Python rejects ports deliberately.
   with self.assertRaises(ValueError):media.canonical(url)
 def test_active_stop_keeps_transcription_checkpoints(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'chunks.json').write_text('[[{"content":"保留"}]]');proc=MagicMock();proc.poll.return_value=None
   with patch.object(media.subprocess,'Popen',return_value=proc),patch.object(media,'terminate') as stop:
    with self.assertRaises(media.Deferred):media.supervise(['test'],root,lambda _:None,MagicMock(is_set=lambda:True),'transcribe',root/'rate.json')
    stop.assert_called_once_with(proc)
   self.assertTrue((root/'chunks.json').exists())
 def test_asset_stream_is_immutable_and_checks_hash(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);data=b'private fixture';header={'owner_id':str(uuid.uuid4()),'project_id':str(uuid.uuid4()),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'extension':'json'}
   with patch.object(bridge.shutil,'disk_usage',return_value=MagicMock(free=100*1024**3,total=200*1024**3)):
    receipt=bridge.asset(root/'assets',header,io.BytesIO(data));self.assertEqual(receipt['sha256'],header['sha256'])
    self.assertEqual(bridge.asset(root/'assets',header,io.BytesIO(data))['bytes'],len(data))
    with self.assertRaisesRegex(ValueError,'hash_mismatch'):bridge.asset(root/'assets',header,io.BytesIO(b'x'*len(data)))
   self.assertFalse(list(root.rglob('.pending-*')))
if __name__=='__main__':unittest.main()
