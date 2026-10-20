"""OS-only workspace templates. Slice original controls verbatim to preserve wiring."""
from html.parser import HTMLParser
from html import escape
import re
VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
class Node:
 def __init__(self,tag,attrs,start,openend):self.tag=tag;self.attrs=dict(attrs);self.start=start;self.openend=openend;self.end=openend;self.close=openend;self.children=[]
class Tree(HTMLParser):
 def __init__(self,s):
  super().__init__(convert_charrefs=False);self.s=s;self.offsets=[0];self.nodes=[];self.stack=[]
  for m in re.finditer('\n',s):self.offsets.append(m.end())
  self.feed(s)
 def pos(self):l,c=self.getpos();return self.offsets[l-1]+c
 def handle_starttag(self,t,a):
  p=self.pos();n=Node(t,a,p,p+len(self.get_starttag_text()));self.nodes.append(n)
  if self.stack:self.stack[-1].children.append(n)
  if t not in VOID:self.stack.append(n)
 def handle_startendtag(self,t,a):self.handle_starttag(t,a);self.stack.pop() if t not in VOID else None
 def handle_endtag(self,t):
  if not self.stack:return
  n=self.stack.pop();assert n.tag==t,(n.tag,t)
  n.close=self.pos();n.end=self.s.index('>',n.close)+1
 def find(self,id):return next(n for n in self.nodes if n.attrs.get('id')==id)
 def outer(self,n):return self.s[n.start:n.end]
 def inner(self,n):return self.s[n.openend:n.close]
LABELS={'schedule-worker-filter':'查看同工','rollcall-date-picker':'點名日期','user-role-scope':'人員類別','user-status-filter':'在班狀態','user-filter':'搜尋名冊','counsel-filter-student':'輔導學童','counsel-filter-category':'輔導向度','print-report-type':'報表種類','print-class-filter':'班級','print-month-filter':'報表月份'}
def toolbar(t,n):
 filters=[];actions=[]
 for c in n.children:
  raw=t.outer(c)
  if c.tag in ('select','input'):
   label=LABELS.get(c.attrs.get('id'),'篩選條件');raw='<label class="os-field"><span>'+label+'</span>'+raw+'</label>'
  (actions if c.tag=='button' else filters).append(raw)
 return '<div class="os-toolbar"><div class="os-filters">'+''.join(filters)+'</div><div class="os-actions">'+''.join(actions)+'</div></div>'
def metrics(t,n):
 return '<section class="os-metrics" aria-label="資料摘要">'+''.join('<div class="os-metric">'+t.inner(c)+'</div>' for c in n.children)+'</section>'
def redesign(source):
 # Parse only main: scripts and SVG do not enter this template transformation.
 a=source.index('  <main ');b=source.index('  </main>',a)+len('  </main>');s=source[a:b];t=Tree(s);changes=[]
 for key in ['schedules','rollcall','students','counseling']:
  panel=t.find('tab-'+key);card=next(c for c in panel.children if 'clean-card' in c.attrs.get('class',''))
  head=card.children[0];intro=head.children[0];controls=head.children[1]
  title=next(c for c in intro.children if c.tag=='h2');desc=next(c for c in intro.children if c.tag=='p')
  description=re.sub('<[^>]+>','',t.inner(desc))
  if key=='rollcall':description='選擇日期，逐位記錄出席、作業與聯絡簿；確認後儲存。'
  body='<section class="os-workspace" data-os-workspace="'+key+'"><div class="os-workspace-intro"><h2 class="sr-only">'+re.sub('<[^>]+>','',t.inner(title))+'</h2><p>'+description+'</p></div>'+toolbar(t,controls)
  for c in card.children[1:]:
   raw=t.outer(c)
   if 'grid-cols-2' in c.attrs.get('class',''):raw=metrics(t,c)
   elif c.tag=='div' and 'overflow-x-auto' in c.attrs.get('class',''):raw='<section class="os-results">'+raw+'</section>'
   body+=raw
  body+='</section>';changes.append((card.start,card.end,body))
 panel=t.find('tab-checkin');children=panel.children
 stat=next(c for c in children if 'grid-cols-2' in c.attrs.get('class',''))
 station,logs=[c for c in children if 'clean-card' in c.attrs.get('class','')]
 changes.append((stat.start,logs.end,metrics(t,stat)+'<div class="os-checkin-grid"><section class="os-station"><div class="os-block-heading"><span class="os-step">01</span><div><h2>到班簽到</h2><p>選擇人臉、QR 或條碼簽到</p></div></div>'+t.inner(station)+'</section><section class="os-live-feed">'+t.inner(logs)+'</section></div>'))
 panel=t.find('tab-print-center');card=t.find('print-controls-bar');intro,controls=card.children
 changes.append((card.start,card.end,'<section id="print-controls-bar" class="os-workspace os-report-controls" data-os-workspace="reports"><div class="os-workspace-intro"><h2 class="sr-only">報表與列印</h2><p>選擇報表、班級與月份，確認預覽後輸出 PDF 或列印。</p></div>'+toolbar(t,controls)+'</section>'))
 for start,end,new in sorted(changes,reverse=True):s=s[:start]+new+s[end:]
 # Explicit accessible names for the manual scan and calendar navigation.
 s=s.replace('id="scan-code-input"','aria-label="條碼或學號" id="scan-code-input"').replace('onclick="prevMonth()"','aria-label="上一個月" onclick="prevMonth()"').replace('onclick="nextMonth()"','aria-label="下一個月" onclick="nextMonth()"')
 return source[:a]+s+source[b:]
