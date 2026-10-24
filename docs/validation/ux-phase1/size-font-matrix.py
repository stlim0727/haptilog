import subprocess, pathlib, time, json, re, xml.etree.ElementTree as E
ADB='/opt/android-sdk/platform-tools/adb';PKG='com.haptilog.watch'
OUT=pathlib.Path(__file__).resolve().parent / 'final';OUT.mkdir(parents=True,exist_ok=True)
def cmd(*a):return subprocess.check_output([ADB,*a],text=True,timeout=30).strip()
def sh(*a):return cmd('shell',*a)
def nodes():
 sh('uiautomator','dump','/sdcard/ux-phase1.xml')
 return E.fromstring(cmd('exec-out','cat','/sdcard/ux-phase1.xml'))
def labels(t):return [n.get('text') for n in t.iter('node') if n.get('text')]
def bounds(n):return list(map(int,re.findall(r'\d+',n.get('bounds'))))
def click(label,exact=True,scroll=True):
 for _ in range(16 if scroll else 1):
  tree=nodes(); parents={c:p for p in tree.iter() for c in p}
  for n in tree.iter('node'):
   text=n.get('text',''); desc=n.get('content-desc','')
   if (text==label or desc==label) if exact else (label in text or label in desc):
    target=n
    while target.get('clickable')!='true' and target in parents:target=parents[target]
    if target.get('clickable')!='true':continue
    x1,y1,x2,y2=bounds(target)
    if y2-y1<28:continue
    sh('input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(1);return
  if scroll:swipe()
 raise AssertionError('Cannot find action '+label+'; '+str(labels(tree)))
def swipe(up=True):
 size=sh('wm','size');nums=re.findall(r'(\d+)x(\d+)',size);w,h=map(int,nums[-1])
 sh('input','swipe',str(w//2),str(int(h*(.78 if up else .25))),str(w//2),str(int(h*(.25 if up else .78))),'500');time.sleep(.4)
def cap(name):
 time.sleep(2)
 with (OUT/(name+'.png')).open('wb') as f:subprocess.run([ADB,'exec-out','screencap','-p'],stdout=f,timeout=30,check=True)
 t=nodes();(OUT/(name+'.xml')).write_text(E.tostring(t,encoding='unicode'));print(name,labels(t),flush=True);return t

def launch():sh('input','keyevent','KEYCODE_WAKEUP');sh('am','start','-n',PKG+'/.presentation.MainActivity');time.sleep(2)

OUT=pathlib.Path(__file__).resolve().parent / 'matrix';OUT.mkdir(parents=True,exist_ok=True)
for dp,px in [(192,384),(227,454)]:
 for font in [1,2]:
  sh('wm','size',str(px)+'x'+str(px));sh('settings','put','system','font_scale',str(font));sh('cmd','locale','set-app-locales',PKG,'--locales','en-US');sh('am','force-stop',PKG);time.sleep(2);launch()
  suffix=f'{dp}dp-en-font{font}'
  cap('home-'+suffix)
  click('Settings');cap('settings-'+suffix)
  sh('input','keyevent','KEYCODE_BACK');time.sleep(1)
  click('금요일 기차표 예약하기');cap('detail-'+suffix)
  sh('input','keyevent','KEYCODE_BACK');time.sleep(1)
  cap('list-'+suffix)
sh('wm','size','reset');sh('settings','put','system','font_scale','1.0');sh('cmd','locale','set-app-locales',PKG,'--locales','ko-KR');sh('am','force-stop',PKG);launch()
