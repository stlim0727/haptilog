import runpy,pathlib,time
h=runpy.run_path('docs/validation/watch-m3/native_helpers.py');globals().update({k:v for k,v in h.items() if not k.startswith('__')})
OUT=pathlib.Path('docs/validation/watch-concept03-revision');cap.__globals__['OUT']=OUT
sh('wm','size','reset');sh('settings','put','system','font_scale','1');sh('cmd','locale','set-app-locales',PKG,'--locales','ko-KR');time.sleep(2)
for screen in ['home','list','list-secondary','travel','expense']:
 sh('am','force-stop',PKG);sh('input','keyevent','KEYCODE_WAKEUP');sh('wm','dismiss-keyguard')
 sh('am','start','-W','-n',PKG+'/.presentation.DesignPreviewActivity','--es','screen',screen);time.sleep(2)
 cap('fixture-'+screen+'-227-ko-1')
print('BASELINE CAPTURES DONE',flush=True)
