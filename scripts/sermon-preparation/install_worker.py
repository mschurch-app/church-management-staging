#!/usr/bin/env python3
"""Install the existing, privately provisioned device worker on the Mini."""
import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
PRIVATE=Path('/Volumes/MPLUS-DATA/mplus-private/sermon-workspace')
TARGET=Path('/Volumes/MPLUS-DATA/mplus-ai/tools/sermon-preparation')
LABEL='com.mplus.sermon-preparation-worker'
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--restart',action='store_true');args=parser.parse_args();os.umask(0o077)
    credentials=PRIVATE/'credentials/worker.json'
    if not credentials.is_file() or credentials.stat().st_mode&0o077:raise RuntimeError('Provision a private 0600 worker credential first')
    agent=Path.home()/'Library/LaunchAgents'/(LABEL+'.plist');domain='gui/'+str(os.getuid())
    if agent.exists():
        if not args.restart:raise RuntimeError('Worker exists; inspect it before using --restart')
        old=plistlib.loads(agent.read_bytes())
        if old.get('Label')!=LABEL or old.get('ProgramArguments',[None])[0]!='/Volumes/MPLUS-DATA/mplus-ai/runtime/mlx/bin/python':raise RuntimeError('Unexpected existing service')
        subprocess.run(['/bin/launchctl','bootout',domain,str(agent)],check=True)
    TARGET.mkdir(parents=True,exist_ok=True,mode=0o700)
    for filename in ('worker.py','media.py','media_policy.py','archive_lane.py'):
        shutil.copy2(Path(__file__).with_name(filename),TARGET/filename);(TARGET/filename).chmod(0o700)
    archive=PRIVATE/'library-archive'
    if archive.is_dir():
        shutil.copy2(Path(__file__).with_name('archive_transcribe.py'),archive/'transcribe.py');(archive/'transcribe.py').chmod(0o700)
    logs=Path.home()/'Library/Logs/MPLUS/sermon-preparation';logs.mkdir(parents=True,exist_ok=True,mode=0o700)
    value={'Label':LABEL,'ProgramArguments':['/Volumes/MPLUS-DATA/mplus-ai/runtime/mlx/bin/python','-B',str(TARGET/'worker.py')],'RunAtLoad':True,'KeepAlive':{'SuccessfulExit':False},'ThrottleInterval':30,'ExitTimeOut':45,'ProcessType':'Background','Umask':63,'StandardOutPath':str(logs/'worker.log'),'StandardErrorPath':str(logs/'worker-error.log'),'EnvironmentVariables':{'PYTHONUNBUFFERED':'1','HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','TOKENIZERS_PARALLELISM':'false','HOME':str(Path.home())}}
    agent.parent.mkdir(exist_ok=True,mode=0o700);agent.write_bytes(plistlib.dumps(value));agent.chmod(0o600)
    subprocess.run(['/bin/launchctl','bootstrap',domain,str(agent)],check=True)
    print('Worker installed; confirm last_seen and actual queue results before reporting online.')
if __name__=='__main__':main()
