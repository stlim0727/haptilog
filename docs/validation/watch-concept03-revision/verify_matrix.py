"""Run from repo root on a disposable, cloud-disabled Wear debug emulator."""
import runpy, pathlib, time
h=runpy.run_path('docs/validation/watch-m3/native_helpers.py')
globals().update({k:v for k,v in h.items() if not k.startswith('__')})
OUT=pathlib.Path('docs/validation/watch-concept03-revision');cap.__globals__['OUT']=OUT
for size,font,locale in [(192,1,'ko-KR'),(192,2,'ko-KR'),(227,2,'ko-KR'),(192,2,'en-US')]:
 sh('wm','size', 'reset' if size==227 else '384x384')
 sh('settings','put','system','font_scale',str(font))
 sh('cmd','locale','set-app-locales',PKG,'--locales',locale);time.sleep(2)
 for screen in ['home','list','travel','expense']:
  sh('am','force-stop',PKG);sh('input','keyevent','KEYCODE_WAKEUP');sh('wm','dismiss-keyguard')
  sh('am','start','-W','-n',PKG+'/.presentation.DesignPreviewActivity','--es','screen',screen);time.sleep(2)
  cap(f'fixture-{screen}-{size}-{locale[:2]}-{font}')
  if font==2 and screen in ['home','travel','expense']:
   swipe();cap(f'fixture-{screen}-{size}-{locale[:2]}-{font}-scroll')
print('MATRIX COMPLETE',flush=True)
