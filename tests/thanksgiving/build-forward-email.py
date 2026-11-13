# -*- coding: utf-8 -*-
from pathlib import Path
import re,base64,hashlib,json,html
root=Path(__file__).resolve().parents[2]
source=(root/'thanksgiving-2026.html').read_text()
out=root/'assets/thanksgiving-2026';out.mkdir(parents=True,exist_ok=True)
photos=[]
for index,(mime,value)in enumerate(re.findall(r'data:(image/[^;]+);base64,([A-Za-z0-9+/=]+)',source),1):
    ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime]
    path=out/f'ministry-{index}.{ext}';data=base64.b64decode(value);path.write_bytes(data)
    photos.append({'path':str(path.relative_to(root)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
assert len(photos)==3
report=root/'docs/reports/2026-11-13-thanksgiving-offering'
(report/'photo-integrity.json').write_text(json.dumps(photos,indent=2))
body='''<p>親愛的弟兄姊妹、朋友們，平安！</p>
<p>今年，我們一同見證上帝帶領 M+Church／M+大雅教會成長、生命更新，下一代被建造。成人主日聚會由 20–30 人成長至近 60 人；15 位弟兄姊妹即將完成一年的門徒培育，兩位全職同工開始神學裝備，預備成為傳道人。</p>
<p>夢想加油站課輔持續陪伴社區孩子；不老俱樂部關心長輩，青少年團契持續朝門徒建造邁進。2026 熱火籃球營連結 22 間教會、約 100 位青少年，約半數尚未信主、約三成決志；截至十一月，已有 10 位年輕人受洗！</p>
<p>「耶和華果然為我們行了大事，我們就歡喜。」——詩篇 126:3</p>
<h2>邀請您與我們同心代禱</h2>
<ul><li>為弟兄姊妹的屬靈生命、門徒培育及兩位全職同工的神學裝備代禱。</li><li>為課輔、長輩、青少年與籃球營後續關懷代禱。</li><li>為年底仍有缺口的事工經費，求主供應，使福音與社區關懷持續發展。</li></ul>
<p>每一份奉獻與守望，都成為教會持續牧養、陪伴與關懷的力量。歡迎與我們同行，也歡迎將這封代禱信轉寄給願意關心與支持的朋友。</p>
<p><strong>銀行匯款：玉山銀行・大雅分行<br>帳號：0358940009109</strong></p>
<p>匯款後請開啟網頁，填寫奉獻人姓名、日期、金額及您自己匯款帳號的末五碼，方便財務核對。回報不代表款項已確認入帳。</p>
<p style="margin:28px 0"><a style="display:inline-block;padding:16px 24px;background:#123e35;color:white;border-radius:12px;text-decoration:none" href="https://mscos.mchurch.online/thanksgiving-2026.html#giving">開啟感恩代禱信與奉獻回應 →</a></p>
<p><a href="https://tcsc.eoffering.org.tw/contents/project_ct?page=2&amp;p_id=3">前往線上奉獻</a></p>'''
for photo in photos:
    body+='<p><img style="display:block;width:100%;max-width:640px;border-radius:12px" src="https://mscos.mchurch.online/'+photo['path']+'" alt="M+大雅教會2026事工真實照片"></p>'
body+='''<p><a href="https://mscos.mchurch.online/thanksgiving-2026-line.html">開啟 LINE 分享版・下載轉傳圖卡</a></p><p>2027 年，讓我們一同帶著信心向前：<br><strong>從 M+ 開始，成為點亮世界的光！</strong></p><p>感恩節快樂！<br>M+Church／M+大雅教會<br>主任牧師 吳俊璋 暨全體同工 敬上</p>'''
email='<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><body style="margin:0;background:#f7f7f0;font-family:Arial,sans-serif;color:#233a33"><div style="max-width:680px;margin:auto;padding:28px;background:white;line-height:1.9"><img width="140" style="background:#123e35;padding:12px" src="https://mscos.mchurch.online/assets/brands/mplus-logo-white.png" alt="M+Church"><h1 style="font-size:30px;line-height:1.45;color:#123e35">恩典，仍在繼續。<br>2026 感恩代禱信</h1><img style="display:block;width:100%;height:auto;border-radius:12px;margin:20px 0" src="https://mscos.mchurch.online/assets/thanksgiving-2026/line-cover.png" alt="2026感恩代禱信・M+大雅教會">'+body+'</div></body></html>'
(report/'forward-email.html').write_text(email)
print(json.dumps({'photos':photos,'forward_email_local_draft':True,'sent':False},ensure_ascii=False))
