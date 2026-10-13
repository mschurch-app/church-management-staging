#!/usr/bin/env python3
"""Bounded private NAS search and immutable workspace receipts. JSON stdin only."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import shutil

UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', re.I)
MAX_BODY = 600000

def sha(data):
    return hashlib.sha256(data).hexdigest()

def protected(path):
    path = Path(path)
    if path.is_symlink():
        raise ValueError('symlink_rejected')
    if path.exists() and (not path.is_dir() or path.stat().st_mode & 0o022 or path.stat().st_uid != os.geteuid()):
        raise ValueError('unprotected_directory')
    return path

def store(root, payload):
    project = payload.get('project', {})
    owner, project_id, version = project.get('owner_id', ''), project.get('id', ''), payload.get('version')
    if not UUID.fullmatch(owner) or not UUID.fullmatch(project_id) or type(version) is not int or not 1 <= version <= 1000000:
        raise ValueError('invalid_project')
    if payload.get('payload', {}).get('format') != 'mplus-sermon-workspace':
        raise ValueError('invalid_draft')
    data = (json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode()
    if len(data) > MAX_BODY:
        raise ValueError('too_large')
    path = protected(root)
    if not path.exists():
        path.mkdir(mode=0o700, parents=False)
    for component in (owner, project_id):
        path = protected(path / component)
        path.mkdir(mode=0o700, exist_ok=True)
    target = path / ('version-%06d.json' % version)
    if target.is_symlink():
        raise ValueError('symlink_rejected')
    expected = sha(data)
    if target.exists():
        if not target.is_file() or target.stat().st_size != len(data) or sha(target.read_bytes()) != expected:
            raise ValueError('version_conflict')
    else:
        fd, temp = tempfile.mkstemp(prefix='.pending-', dir=str(path))
        try:
            with os.fdopen(fd, 'wb') as stream:
                os.fchmod(stream.fileno(), 0o600)
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            try:
                os.link(temp, str(target))
            except FileExistsError:
                if target.is_symlink() or sha(target.read_bytes()) != expected:
                    raise ValueError('version_conflict')
        finally:
            os.unlink(temp)
        directory = os.open(str(path), os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    return {'stored': True, 'sha256': expected, 'bytes': len(data), 'project_id': project_id,
            'version': version, 'received_at_utc': dt.datetime.now(dt.timezone.utc).isoformat()}

def asset(root,header,stream):
    owner,project_id,digest=header.get('owner_id',''),header.get('project_id',''),header.get('sha256','')
    size,extension=header.get('bytes'),header.get('extension')
    if not UUID.fullmatch(owner) or not UUID.fullmatch(project_id) or not re.fullmatch('[a-f0-9]{64}',digest) or type(size) is not int or not 0<size<=1024**3 or extension not in ('mp4','webm','mkv','json'):
        raise ValueError('invalid_asset')
    path=protected(root);path.mkdir(mode=0o700,exist_ok=True)
    for component in (owner,project_id,'media'):
        path=protected(path/component);path.mkdir(mode=0o700,exist_ok=True)
    space=shutil.disk_usage(str(path))
    if space.free-size<max(5*1024**3,space.total//5):raise ValueError('nas_capacity_low')
    target=path/(digest+'.'+extension)
    if target.is_symlink():raise ValueError('symlink_rejected')
    fd,temp=tempfile.mkstemp(prefix='.pending-',dir=str(path));hasher=hashlib.sha256();received=0
    try:
        with os.fdopen(fd,'wb') as out:
            os.fchmod(out.fileno(),0o600)
            while received<size:
                block=stream.read(min(1024**2,size-received))
                if not block:raise ValueError('asset_incomplete')
                hasher.update(block);out.write(block);received+=len(block)
            if stream.read(1) or hasher.hexdigest()!=digest:raise ValueError('asset_hash_mismatch')
            out.flush();os.fsync(out.fileno())
        try:os.link(temp,str(target))
        except FileExistsError:
            if target.is_symlink() or target.stat().st_size!=size:raise ValueError('asset_conflict')
            verify=hashlib.sha256()
            with target.open('rb') as old:
                for block in iter(lambda:old.read(1024**2),b''):verify.update(block)
            if verify.hexdigest()!=digest:raise ValueError('asset_conflict')
    finally:os.unlink(temp)
    directory=os.open(str(path),os.O_RDONLY)
    try:os.fsync(directory)
    finally:os.close(directory)
    return {'stored':True,'sha256':digest,'bytes':received,'extension':extension,'project_id':project_id}

def open_db(root):
    con = sqlite3.connect((Path(root) / 'state/catalog.sqlite3').as_uri() + '?mode=ro', uri=True, timeout=8)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA query_only=ON')
    return con

def material(row, detail=False):
    content = row['content']
    try:
        candidates = json.loads(row['speaker_candidates_json'])
    except (ValueError, TypeError):
        candidates = []
    if not isinstance(candidates, list):
        candidates = []
    digest = sha(content.encode())
    return {'kind':'archive', 'id':sha((row['url']+'#'+str(row['ordinal'])).encode()),
            'url':row['url'], 'title':str(row['title'] or '')[:500],
            'speaker':'、'.join(str(x) for x in candidates)[:500], 'ordinal':row['ordinal'],
            'content_sha':digest, 'content':content[:6000 if detail else 650],
            'truncated':len(content)>6000 if detail else False, 'reviewed':False, 'note':'',
            'attribution_status':row['attribution_status'], 'verified':bool(row['verified'])}

def query(root, action, value):
    con = open_db(root)
    try:
        columns = 'd.url,d.title,d.speaker_candidates_json,d.attribution_status,p.ordinal,p.content,p.verified'
        if action == 'status':
            result = {table:con.execute('SELECT count(*) FROM '+table).fetchone()[0]
                      for table in ('sources','sermons','web_documents','web_paragraphs','testimony_documents','projects')}
            return {'counts':result}
        if action == 'search':
            term = value.get('query', '').strip()
            if not 1 <= len(term) <= 80:
                raise ValueError('invalid_query')
            escaped = term.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')
            rows = con.execute("SELECT "+columns+" FROM web_paragraphs p JOIN web_documents d ON d.text_sha=p.text_sha "
                               "WHERE p.content LIKE ? ESCAPE '\\' ORDER BY d.url,p.ordinal LIMIT 24", ('%'+escaped+'%',)).fetchall()
            return {'items':[material(r) for r in rows], 'query':term}
        if action == 'detail':
            url, ordinal = value.get('url', ''), value.get('ordinal')
            if not isinstance(url,str) or len(url)>2000 or type(ordinal) is not int or ordinal<0:
                raise ValueError('invalid_source')
            row = con.execute('SELECT '+columns+' FROM web_paragraphs p JOIN web_documents d ON d.text_sha=p.text_sha '
                              'WHERE d.url=? AND p.ordinal=?', (url,ordinal)).fetchone()
            if not row:
                raise ValueError('source_missing')
            result = material(row,True)
            if result['content_sha'] != value.get('content_sha'):
                raise ValueError('source_changed')
            return {'item':result}
        raise ValueError('invalid_action')
    finally:
        con.close()

def main():
    os.umask(0o077)
    if '--asset' in sys.argv:
        line=sys.stdin.buffer.readline(4097)
        if len(line)>4096 or not line.endswith(b'\n'):raise ValueError('invalid_asset')
        storage=Path(os.environ.get('MPLUS_SERMON_STORE_ROOT','/share/homes/james/mplus-ai-workspace/sermon-library/projects/os-workspace'))
        result=asset(storage,json.loads(line),sys.stdin.buffer)
        print(json.dumps({'ok':True,**result}));return
    raw = sys.stdin.buffer.read(MAX_BODY + 1)
    if len(raw)>MAX_BODY:
        raise ValueError('too_large')
    body=json.loads(raw)
    action=body.get('action')
    library=Path(os.environ.get('MPLUS_SERMON_LIBRARY_ROOT','/share/homes/james/mplus-ai-workspace/sermon-library')).resolve()
    if action == 'store':
        storage=Path(os.environ.get('MPLUS_SERMON_STORE_ROOT',str(library / 'projects/os-workspace')))
        result=store(storage,body.get('payload',{}))
    else:
        result=query(library,action,body.get('input',{}))
    print(json.dumps({'ok':True,**result},ensure_ascii=False))

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # No source contents, filenames, tokens, or SQL values in error output.
        print(json.dumps({'ok':False,'error':str(exc) if isinstance(exc,ValueError) else type(exc).__name__}))
        sys.exit(1)

