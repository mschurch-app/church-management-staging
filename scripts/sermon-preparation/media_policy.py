"""Taipei per-video WAN cap; local ASR and LAN backups have no WAN rate limit."""
import datetime as dt
from zoneinfo import ZoneInfo
TAIPEI=ZoneInfo('Asia/Taipei')
POLICY={'timezone':'Asia/Taipei','download_bands':[{'start':'00:00','end':'08:00','ratio':None},{'start':'08:00','end':'15:00','ratio':0.5},{'start':'15:00','end':'24:00','ratio':1/3}],'average_window_minutes':30,'baseline_window':'07:30–08:00','cap_locked_per_video':True,'transcription_window':None,'lan_backup_limited':False}
def local(now=None):return (now or dt.datetime.now(dt.timezone.utc)).astimezone(TAIPEI)
def allowed(now=None):return True

def band(now=None):
 hour=local(now).hour
 return 'unlimited' if hour<8 else 'half' if hour<15 else 'third'
def next_download_start(now=None):
 value=local(now);return (value.replace(hour=0,minute=0,second=0,microsecond=0)+dt.timedelta(days=1)).astimezone(dt.timezone.utc)
def next_start(now=None):return (local(now)+dt.timedelta(minutes=1)).astimezone(dt.timezone.utc)
def average(samples,now=None):
 value=local(now);cutoff=value.replace(hour=8,minute=0,second=0,microsecond=0)
 if value.hour<8:cutoff=value
 recent=[s for s in samples if cutoff.timestamp()-1800<=s['at']<=cutoff.timestamp() and 0<s['seconds']<=30 and s['bytes']>0]
 if not recent:return None
 return sum(s['bytes'] for s in recent)/sum(s['seconds'] for s in recent)
def limit(samples,now=None):
 period=band(now)
 if period=='unlimited':return None
 speed=average(samples,now)
 if not speed:return 'unmeasured'
 return max(1,int(speed/(2 if period=='half' else 3)))
def selection(samples,now=None):
 cap=limit(samples,now)
 if cap=='unmeasured':return None
 period=band(now)
 return {'selected_at_utc':local(now).astimezone(dt.timezone.utc).isoformat(),'timezone':'Asia/Taipei','band':period,'rate_bytes_per_second':cap,'average_bytes_per_second':average(samples,now),'ratio':None if period=='unlimited' else 0.5 if period=='half' else 1/3,'locked_until_video_complete':True}
