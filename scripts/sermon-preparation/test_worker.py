import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
import uuid
from unittest.mock import patch

def module(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
bridge=module('bridge','nas_bridge.py')
worker=module('worker','worker.py')

class NAS(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);(self.root/'state').mkdir()
        con=sqlite3.connect(self.root/'state/catalog.sqlite3')
        con.executescript('create table web_paragraphs(text_sha text,ordinal integer,content text,verified integer);create table web_documents(url text,title text,speaker_candidates_json text,attribution_status text,text_sha text);')
        con.execute('insert into web_paragraphs values(?,?,?,?)',('abc',1,'盼望與 100% 愛：驗收資料。',0))
        con.execute('insert into web_documents values(?,?,?,?,?)',('https://example.test/source','來源標題','["候選講員"]','needs_review','abc'));con.commit();con.close()
        self.payload={'project':{'owner_id':str(uuid.uuid4()),'id':str(uuid.uuid4())},'version':1,'payload':{'format':'mplus-sermon-workspace'}}
    def tearDown(self):self.temp.cleanup()
    def test_search_escape_and_read_only(self):
        self.assertEqual(len(bridge.query(self.root,'search',{'query':'100%'})['items']),1)
        self.assertEqual(bridge.query(self.root,'search',{'query':"' OR 1=1 --"})['items'],[])
        con=bridge.open_db(self.root)
        with self.assertRaises(sqlite3.OperationalError):con.execute('delete from web_documents')
        con.close()
    def test_source_identity_and_candidate_are_preserved(self):
        item=bridge.query(self.root,'search',{'query':'盼望'})['items'][0]
        full=bridge.query(self.root,'detail',item)['item'];self.assertFalse(full['reviewed']);self.assertFalse(full['verified']);self.assertEqual(full['speaker'],'候選講員')
        item['content_sha']='0'*64
        with self.assertRaisesRegex(ValueError,'source_changed'):bridge.query(self.root,'detail',item)
    def test_store_idempotent_and_conflict_preserved(self):
        receipt=bridge.store(self.root/'exports',self.payload)
        self.assertEqual(receipt['sha256'],bridge.store(self.root/'exports',self.payload)['sha256'])
        changed=json.loads(json.dumps(self.payload));changed['payload']['notes']='不可覆寫'
        with self.assertRaisesRegex(ValueError,'version_conflict'):bridge.store(self.root/'exports',changed)
        path=next((self.root/'exports').rglob('version-*.json'));self.assertEqual(path.stat().st_mode&0o777,0o600)
    def test_uuid_traversal_and_symlink_rejected(self):
        self.payload['project']['id']='../../outside'
        with self.assertRaisesRegex(ValueError,'invalid_project'):bridge.store(self.root/'exports',self.payload)
        (self.root/'link').symlink_to(self.root/'state',target_is_directory=True)
        self.payload['project']['id']=str(uuid.uuid4())
        with self.assertRaisesRegex(ValueError,'symlink_rejected'):bridge.store(self.root/'link',self.payload)

class Generation(unittest.TestCase):
    def job(self):
        return {'kind':'manuscript','input':{'project':{'id':str(uuid.uuid4()),'title':'驗收','speaker':'驗收講員','scripture':'測試範圍'},'payload':{'materials':[],'notes':'測試筆記','outline':['第一段','第二段','第三段'],'outline_confirmed':True,'target_characters':5000}}}
    def test_body_measurement_matches_browser(self):
        self.assertEqual(worker.body_count('## 標題\n正文 [素材 1]\n## 來源\n'+'字'*5000),2)
    def test_section_checkpoints_recover_without_repeating_finished_sections(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory);job=self.job();progress=[]
            calls=[]
            def infer(*args,**kwargs):
                calls.append(1)
                if len(calls)>1:raise RuntimeError('interrupted')
                return '甲'*1000
            with patch.object(worker,'infer',side_effect=infer):
                with self.assertRaises(RuntimeError):worker.generate(job,progress.append,path)
            self.assertEqual(len(json.loads((path/'sections.json').read_text())),1)
            with patch.object(worker,'infer',return_value='乙'*1000) as resumed:
                result=worker.generate(job,progress.append,path)
                self.assertEqual(resumed.call_count,5);self.assertGreaterEqual(result['body_characters'],5000)
    def test_unconfirmed_outline_or_material_is_rejected(self):
        job=self.job();job['input']['payload']['outline_confirmed']=False
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'outline_required'):worker.generate(job,lambda _:None,Path(d))
    def test_short_generated_deck_is_completed_before_delivery(self):
        job=self.job();job['kind']='slides';job['input']['payload']['manuscript']='文'*5000
        slide={'title':'頁','content':'畫面文字','notes':'備註'}
        with tempfile.TemporaryDirectory() as d,patch.object(worker,'infer',side_effect=[json.dumps({'slides':[slide]*9}),json.dumps({'slides':[slide]*3})]) as inference:
            result=worker.generate(job,lambda _:None,Path(d));self.assertEqual(len(result['slides']),12);self.assertEqual(inference.call_count,2)
    def test_slides_over_limit_are_not_delivered(self):
        job=self.job();job['kind']='slides';job['input']['payload']['manuscript']='文'*5000
        with tempfile.TemporaryDirectory() as d,patch.object(worker,'infer',return_value=json.dumps({'slides':[{'title':'頁','content':'','notes':''}]*21})):
            with self.assertRaisesRegex(ValueError,'slides_invalid'):worker.generate(job,lambda _:None,Path(d))

if __name__=='__main__':unittest.main()

