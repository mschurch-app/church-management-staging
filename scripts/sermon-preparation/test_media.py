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
 def test_boundaries_and_next_window(self):
  for clock,expected in [('00:59:59',False),('01:00:00',True),('05:59:59',True),('06:00:00',True),('11:59:59',True),('12:00:00',False)]:self.assertEqual(policy.allowed(self.at(clock)),expected)
  self.assertEqual(policy.next_start(self.at('00:59:59')).astimezone(policy.TAIPEI).day,14)
  self.assertEqual(policy.next_start(self.at('12:00:00')).astimezone(policy.TAIPEI).day,15)
 def test_weighted_average_and_half_limit(self):
  samples=[{'at':self.at('05:40:00').timestamp(),'seconds':2,'bytes':2000},{'at':self.at('05:41:00').timestamp(),'seconds':8,'bytes':18000}]
  self.assertEqual(policy.limit(samples,self.at('05:59:59')),None)
  self.assertEqual(policy.limit(samples,self.at('06:00:00')),1000)
  self.assertEqual(policy.limit(samples,self.at('11:59:59')),1000)
  self.assertEqual(policy.limit(samples,self.at('12:00:00')),'closed')
  self.assertEqual(policy.limit([],self.at('06:00:00')),'unmeasured')
  self.assertEqual(policy.limit([{'at':self.at('05:00:00').timestamp(),'seconds':10,'bytes':1000}],self.at('06:00:00')),'unmeasured')
 def test_canonical_public_youtube_only(self):
  self.assertEqual(media.canonical('https://youtu.be/abcdefghijk'),'https://www.youtube.com/watch?v=abcdefghijk')
  for url in ('http://192.168.0.112/test','https://youtube.com.evil.test/watch?v=abcdefghijk','https://youtube.com/playlist?list=abc','https://youtube.com:443/watch?v=abcdefghijk'):
   # Explicit :443 is normalized by some URL parsers, but Python rejects ports deliberately.
   with self.assertRaises(ValueError):media.canonical(url)
 def test_window_closure_stops_process_and_keeps_checkpoints(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'chunks.json').write_text('[[{"content":"保留"}]]');proc=MagicMock();proc.poll.return_value=None;proc.pid=123
   with patch.object(media,'allowed',side_effect=[True,False]),patch.object(media,'limit',return_value=None),patch.object(media.subprocess,'Popen',return_value=proc),patch.object(media,'terminate') as stop:
    with self.assertRaises(media.Deferred):media.supervise(['test'],root,lambda _:None,MagicMock(is_set=lambda:False),'transcribe',root/'rate.json')
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
