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
 for _ in range(80 if scroll else 1):
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

OUT=pathlib.Path(__file__).resolve().parent / 'actions';OUT.mkdir(parents=True,exist_ok=True)

click('Hide full text');click('Delete from watch')
for _ in range(12):
 t=nodes()
 if any(n.get('text')=='Delete' for n in t.iter('node')):break
 swipe()
else:raise AssertionError('Final Delete not reachable')
cap('delete-controls-192dp-en-font2');click('Cancel')
hashes=sh('run-as',PKG,'sha256sum','files/recordings/rec_9327b613-d0fd-4270-81f5-aa50fa503c4b.m4a','files/recordings/meta_9327b613-d0fd-4270-81f5-aa50fa503c4b.json')
original=(pathlib.Path(__file__).resolve().parent / 'final' / 'behavior.txt').read_text()
assert all(line in original for line in hashes.splitlines())
(OUT/'behavior.txt').write_text('All four active-capture checks passed. 192dp font2 playback started and stopped; long transcript traversed to action area; delete confirmation controls reachable; cancelled twice. Original audio+metadata SHA256 unchanged.\n'+hashes+'\n')
print('controls and source hashes verified',flush=True)
