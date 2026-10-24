import subprocess,pathlib,time,xml.etree.ElementTree as E,re,json
ADB='/opt/android-sdk/platform-tools/adb';PKG='com.haptilog.watch'
OUT=pathlib.Path(__file__).resolve().parent
def cmd(*a):return subprocess.check_output([ADB,*a],text=True,timeout=30).strip()
def sh(*a):return cmd('shell',*a)
def tree():
 sh('uiautomator','dump','/sdcard/haptilog-m3.xml')
 return E.fromstring(cmd('exec-out','cat','/sdcard/haptilog-m3.xml'))
def labels(t):return [n.get('text') or n.get('content-desc') for n in t.iter('node') if n.get('text') or n.get('content-desc')]
def cap(name):
 tree() # Wait for accessibility/UI idle before the settled render.
 time.sleep(2)
 (OUT/(name+'.png')).write_bytes(subprocess.check_output([ADB,'exec-out','screencap','-p'],timeout=30))
 t=tree();(OUT/(name+'.xml')).write_text(E.tostring(t,encoding='unicode'));print(name,labels(t),flush=True);return t
def swipe(up=True):
 nums=re.findall(r'(\d+)x(\d+)',sh('wm','size'));w,h=map(int,nums[-1])
 sh('input','swipe',str(w//2),str(int(h*(.78 if up else .25))),str(w//2),str(int(h*(.25 if up else .78))),'450');time.sleep(.5)
def click(label,scroll=True):
 for _ in range(60 if scroll else 1):
  t=tree();parents={c:p for p in t.iter() for c in p}
  for n in t.iter('node'):
   if n.get('text')==label or n.get('content-desc')==label:
    while n.get('clickable')!='true' and n in parents:n=parents[n]
    if n.get('clickable')!='true':continue
    x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')))
    if y2-y1<35:continue
    sh('input','tap',str((x1+x2)//2),str((y1+y2)//2));time.sleep(.7);return
  if scroll:swipe()
 raise AssertionError('Missing action '+label+': '+str(labels(t)))
def launch():
 sh('input','keyevent','KEYCODE_WAKEUP');sh('wm','dismiss-keyguard');sh('am','start','-W','-n',PKG+'/.presentation.MainActivity');time.sleep(2)
def back():sh('input','keyevent','KEYCODE_BACK');time.sleep(.7)
if __name__=='__main__':cap('manual-capture')
