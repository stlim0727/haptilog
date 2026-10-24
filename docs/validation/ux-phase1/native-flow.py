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
sh('svc','wifi','disable');sh('svc','data','disable');sh('svc','power','stayon','true')
# Use the latest emulator-generated silent recording. Only derived fixture text is replaced.
metas=[]
for name in sh('run-as',PKG,'ls','files/recordings').splitlines():
 if name.startswith('meta_') and name.endswith('.json'):
  try:metas.append(json.loads(cmd('exec-out','run-as',PKG,'cat','files/recordings/'+name)))
  except Exception:pass
meta=max(metas,key=lambda m:m.get('started_at',''));rid=meta['id']
audio='files/recordings/rec_'+rid+'.m4a';source='files/recordings/meta_'+rid+'.json'
hashes=sh('run-as',PKG,'sha256sum',audio,source)
fixture={'intent_type':'MEMO','summary':'금요일 기차표 예약하기','transcript':'합성 화면 검증용 텍스트입니다. 금요일 출발 시각과 도착역을 확인합니다.\n\n'+('원본 음성과 메타데이터는 수정하지 않습니다. 긴 전문을 끝까지 읽을 수 있는지 확인합니다. ')*12,'structured_data':{'action_items':['기차표 예약하기']}}
subprocess.run([ADB,'exec-in','run-as',PKG,'tee','files/recordings/enrich_'+rid+'.json'],input=json.dumps(fixture,ensure_ascii=False).encode(),stdout=subprocess.DEVNULL,check=True)
sh('am','force-stop',PKG);sh('cmd','locale','set-app-locales',PKG,'--locales','ko-KR');sh('settings','put','system','font_scale','1.0');sh('wm','size','reset');launch()
cap('home-227dp-ko-font1')
swipe();cap('entry-227dp-ko-font1');click('설정');cap('settings-227dp-ko-font1')
click('웹에서 기록 보기');cap('web-227dp-ko-font1');sh('input','keyevent','KEYCODE_BACK');time.sleep(1)
sh('input','keyevent','KEYCODE_BACK');time.sleep(1);cap('settings-back-227dp-ko-font1')
click('금요일 기차표 예약하기');cap('detail-227dp-ko-font1')
click('전체 텍스트 보기');cap('transcript-expanded-227dp-ko-font1')
click('워치에서 삭제');cap('delete-confirm-227dp-ko-font1');click('취소');cap('delete-cancel-227dp-ko-font1')
assert hashes==sh('run-as',PKG,'sha256sum',audio,source),'Cancel changed source files'
sh('input','keyevent','KEYCODE_BACK');time.sleep(1);cap('detail-back-227dp-ko-font1')
# Explicit external entry must reveal Record again.
sh('input','keyevent','KEYCODE_HOME');launch();cap('external-entry-227dp-ko-font1')
sh('am','force-stop',PKG);launch();assert hashes==sh('run-as',PKG,'sha256sum',audio,source),'Offline restart changed source files'
(OUT/'behavior.txt').write_text('Synthetic derived text only. No cloud uploads.\nDelete cancel and offline force-stop/restart kept audio + capture metadata hashes unchanged.\n'+hashes+'\n')
print('native flow completed',rid,flush=True)
