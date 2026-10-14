import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,MagicMock
import archive_lane as archive
class Archive(unittest.TestCase):
 def test_episode_attribution_requires_known_channel_and_one_explicit_speaker(self):
  names={'speaker-01':['張茂松','张茂松'],'speaker-05':['張光偉','张光伟']};source={'id':'speaker-01','channel_ids':['approved']}
  info={'channel_id':'approved','title':'恩典｜張茂松牧師','duration':3000,'availability':'public'}
  self.assertTrue(archive.attribution(info,source,names))
  for changed in ({'channel_id':'unknown'},{'title':'恩典','description':'張茂松'},{'title':'張茂松與張光偉的訪談'},{'is_live':True}):self.assertFalse(archive.attribution({**info,**changed},source,names))
 def test_known_ids_union_existing_manifest_and_reserved_queue(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);relay=root/'relay';relay.mkdir();lib=root/'library';lib.mkdir();folder=lib/'speaker-01'/'abcdefghijk';folder.mkdir(parents=True)
   (folder/'manifest.json').write_text(json.dumps({'video_id':'abcdefghijk'}));(lib/'queue.json').write_text(json.dumps([{'video_id':'12345678901'}]));(relay/'known-video-ids.json').write_text(json.dumps(['ABCDEFGHIJK']))
   with patch.object(archive,'ROOT',lib),patch.object(archive,'RELAY',relay):known=archive.sync_known(['zyxwvutsrqp'])
   self.assertEqual(known,{'abcdefghijk','12345678901','ABCDEFGHIJK','zyxwvutsrqp'});self.assertEqual(json.loads((relay/'known-video-ids.json').read_text()),sorted(known))
 def test_busy_backup_preserves_spool_and_does_not_import_or_copy(self):
  with tempfile.TemporaryDirectory() as d,patch.object(archive,'ROOT',Path(d)),patch.object(archive,'intake',return_value={'status':'deferred_backup_or_writer_active'}) as intake:
   worker=MagicMock();self.assertFalse(archive.io_tick(worker));intake.assert_called_once_with('status');worker.asset_copy.assert_not_called()
 def test_completed_speaker_advances_only_once_per_round(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);rotation={'current_round':2,'next_speaker_id':'speaker-11','speakers':[{'speaker_id':'speaker-%02d'%i} for i in range(1,12)]};(root/'rotation-state.json').write_text(json.dumps(rotation))
   with patch.object(archive,'ROOT',root):archive.advance('speaker-11','transcribed_local_import_backup_pending','abcdefghijk')
   saved=json.loads((root/'rotation-state.json').read_text());self.assertEqual(saved['current_round'],3);self.assertEqual(saved['next_speaker_id'],'speaker-01');self.assertEqual(saved['speakers'][-1]['round_2']['video_id'],'abcdefghijk')
if __name__=='__main__':unittest.main()
