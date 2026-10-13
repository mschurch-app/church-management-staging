"""Taipei media window; throughput is bytes divided by active download seconds."""
import datetime as dt
from zoneinfo import ZoneInfo
TAIPEI=ZoneInfo('Asia/Taipei')
POLICY={'timezone':'Asia/Taipei','start':'01:00','end':'12:00','unlimited_until':'06:00','limited_ratio':0.5,'average_window_minutes':30}
def local(now=None):return (now or dt.datetime.now(dt.timezone.utc)).astimezone(TAIPEI)
def allowed(now=None):return 1<=local(now).hour<12
def next_start(now=None):
    value=local(now);start=value.replace(hour=1,minute=0,second=0,microsecond=0)
    if value>=start:start+=dt.timedelta(days=1)
    return start.astimezone(dt.timezone.utc)
def average(samples,now=None):
    value=local(now);cutoff=value.replace(hour=6,minute=0,second=0,microsecond=0)
    if value.hour<6:cutoff=value
    # Most recent 30 minutes of unrestricted measurements; previous day's baseline expires.
    recent=[s for s in samples if cutoff.timestamp()-1800<=s['at']<=cutoff.timestamp() and 0<s['seconds']<=30 and s['bytes']>0]
    if not recent:return None
    return sum(s['bytes'] for s in recent)/sum(s['seconds'] for s in recent)
def limit(samples,now=None):
    if not allowed(now):return 'closed'
    if local(now).hour<6:return None
    speed=average(samples,now)
    return max(1,int(speed/2)) if speed else 'unmeasured'
