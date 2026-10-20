"""Build an isolated Church OS view. Never changes standalone entries or business logic."""
from pathlib import Path
import re
import argparse,hashlib,json,subprocess,shutil
parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);args=parser.parse_args()
SOURCE=Path(args.source).resolve();ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'school';OUT.mkdir(exist_ok=True)
source=(SOURCE/'index.html').read_text()
source=source.replace('<html lang="zh-TW">','<html lang="zh-TW" data-church="M+" data-mplus-function-nav="true" data-school-entry="church-os">').replace('<title>M+ 大雅教會 課輔行政系統</title>','<title>課輔工作台｜M＋教會 OS</title>')
# Remove the old visual skins only from this new entry. Keep field/dialog/print behavior.
for sheet in ['church-palette.css','church-os-theme.css','school-ui.css']:
 source=re.sub(r'  <link rel="stylesheet" href="'+re.escape(sheet)+r'\?[^\"]+">\n','',source)
source=source.replace(' autofocus', '').replace('<head>', '<head>\n  <meta name="referrer" content="no-referrer">\n  <meta name="robots" content="noindex,nofollow">')
source=source.replace('<meta name="theme-color" content="#faf8f6">','<meta name="theme-color" content="#173f34">\n  <link rel="stylesheet" href="church-os-school.css?v=20261020-os1">\n  <link rel="stylesheet" href="church-os-dock.css?v=20261020-os1">')
source=source.replace('school-ui.js?v=20261009-stage3','church-os-ui.js?v=20261020-os1')
a=source.index('  <header class="glass-header');b=source.index('  </header>',a)+len('  </header>')
nav=re.search(r'      <nav id="school-desktop-nav".*?</nav>',source[a:b],re.S).group(0)
header='''  <header class="os-school-header">
    <div class="os-school-brand"><a href="https://mscos.mchurch.online/mplus-dashboard.html?church=M%2B" aria-label="M＋首頁"><img src="https://mscos.mchurch.online/assets/brands/mplus-logo-white.png" alt="M＋大雅教會"></a><div><p>教會 OS · 課輔</p><h1>M＋課輔工作台</h1><p id="clock-display">正在連線…</p></div></div>
    <div class="os-school-account"><a class="os-school-home" href="https://mscos.mchurch.online/mplus-dashboard.html?church=M%2B">首頁</a><div id="auth-logged" class="hidden items-center"><span id="logged-user-tag"></span><button type="button" onclick="doLogout()">登出課輔</button></div></div>
  </header>'''
source=source[:a]+header+source[b:]
# One local feature bar below the stable Church OS header; no second app header.
source=source.replace('    <div id="school-page-bar"',nav+'\n    <div id="school-page-bar"',1)
source=source.replace('功能收納盒</button></div>','全部課輔功能</button></div>',1)
source=source.replace('href="https://mscos.mchurch.online/admin-dashboard.html"','href="https://mscos.mchurch.online/mplus-dashboard.html?church=M%2B&amp;center=school"')
source=source.replace('使用教會 OS 的 LINE 或 Email 帳號登入，再選擇「課輔」，即可回到課輔系統。','請回到教會 OS 確認登入，再從「課輔」選擇需要的功能。')
# The dock markup lives in its own source so icons and routes remain reviewable.
source=source.replace('  <a href="#school-main"', (ROOT/'scripts/school/dock.html').read_text()+'\n  <a href="#school-main"',1)
source=source.replace('href="church-os-dock.css?v=20261020-os1"','href="../mplus-function-nav.css?v=20261020-dock1"').replace('src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"','src="../vendor/supabase-2.102.0.js"').replace('href="enrollment.html"','href="https://school.mchurch.online/enrollment.html"')
source=source.replace('{ global: { fetch: mschoolApiFetch } }','{ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: mschoolApiFetch } }')
(OUT/'index.html').write_text(source)
ui=(SOURCE/'school-ui.js').read_text().replace('launcher.hidden=!user;','launcher.hidden=true;')
ui=ui.replace("makeDialog('school-tools','功能收納盒')","makeDialog('school-tools','全部課輔功能')")
# Public enrollment workstation stays an independent original entry, not a Church OS task.
ui=ui.replace("catalog.filter(permitted).filter(item=>(item.title", "catalog.filter(permitted).filter(item=>!item.href).filter(item=>(item.title")
(OUT/'church-os-ui.js').write_text(ui)

(OUT/'church-os-school.css').write_text((SOURCE/'school-ui.css').read_text()+(ROOT/'scripts/school/layout.css').read_text())
for name in ['app-design-tokens.css','school-icons.js','school-mark.svg']:shutil.copyfile(SOURCE/name,OUT/name)
files=['index.html','index2.html','enrollment.html','school-ui.js','school-ui.css','church-os-theme.css']
manifest={'repository':'mschurch-app/m-shcool','commit':subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD'],text=True).strip(),'independent_files_unchanged':{f:hashlib.sha256((SOURCE/f).read_bytes()).hexdigest() for f in files}}
def core(text):
 i=text.index('const SUPABASE_URL');a=text.rfind('<script',0,i);return text[text.index('>',a)+1:text.index('</script>',i)]
manifest['original_business_script_sha256']=hashlib.sha256(core((SOURCE/'index.html').read_text()).encode()).hexdigest()
manifest['os_business_script_sha256']=hashlib.sha256(core(source).encode()).hexdigest()
(OUT/'source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
