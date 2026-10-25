"""Recheck the shortened English action label after the final resource refinement."""
import runpy,pathlib,time
h=runpy.run_path('docs/validation/watch-m3/native_helpers.py');globals().update({k:v for k,v in h.items() if not k.startswith('__')})
OUT=pathlib.Path('docs/validation/watch-concept03-revision');cap.__globals__['OUT']=OUT
sh('wm','size','384x384');sh('settings','put','system','font_scale','2');sh('cmd','locale','set-app-locales',PKG,'--locales','en-US');time.sleep(2)
sh('am','force-stop',PKG);sh('input','keyevent','KEYCODE_WAKEUP');sh('wm','dismiss-keyguard')
sh('am','start','-W','-n',PKG+'/.presentation.DesignPreviewActivity','--es','screen','home');time.sleep(2)
cap('fixture-home-192-en-2');swipe();t=cap('fixture-home-192-en-2-scroll')
assert 'Records' in labels(t) and 'Settings' in labels(t)
print('ENGLISH HOME PASSED',flush=True)
