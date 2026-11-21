import json, os, subprocess, time, io
os.environ['PLAYWRIGHT_BROWSERS_PATH']='/opt/pw-browsers'
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np
meta=json.load(open('real/meta.json')); meta=[m for m in meta if not m['name'].startswith(('shot-','illus-','svg-','logo-alpha'))]
def save(name, png_bytes, truth, profs):
    im=Image.open(io.BytesIO(png_bytes)).convert('RGBA')
    np.asarray(im,dtype=np.uint8).tofile(f'real/{name}.rgba')
    meta.append(dict(name=name,w=im.width,h=im.height,truth=truth,profiles=profs,fmt='PNG'))
SS=('captura de pantalla|gráfico',['lossless'])
code_html='''<body style="margin:0;background:%s;color:%s;font:14px/20px 'DejaVu Sans Mono',monospace"><pre style="margin:16px 24px">%s</pre></body>'''
code=open('/home/claude/proj/src/core/analyzer.js').read()[:6000].replace('<','&lt;')
colored=code.replace('const','<span style="color:#569cd6">const</span>').replace('function','<span style="color:#c586c0">function</span>').replace('return','<span style="color:#c586c0">return</span>').replace('//','<span style="color:#6a9955">//</span>')
table='<body style="margin:0;font:14px Arial"><table style="border-collapse:collapse;width:100%%">%s</table></body>'%''.join('<tr style="background:%s">%s</tr>'%('#f6f8fa' if i%2 else '#fff',''.join('<td style="border:1px solid #d0d7de;padding:6px 12px">%s</td>'%(f'Fila {i} · col {j} · {(i*37+j*91)%1000/10:.1f}%') for j in range(8))) for i in range(40))
grad='''<body style="margin:0;width:100vw;height:100vh;background:linear-gradient(135deg,#6366f1,#ec4899 55%,#f59e0b)"><div style="position:absolute;left:12vw;top:18vh;width:38vw;height:50vh;border-radius:28px;background:linear-gradient(180deg,#fff9,#fff2);box-shadow:0 30px 80px #0006"></div><div style="position:absolute;right:10vw;top:30vh;width:26vw;height:26vw;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,#38bdf8 45%,#1e3a8a);box-shadow:0 20px 60px #0008"></div></body>'''
flat='''<body style="margin:0;background:#fde68a"><div style="position:absolute;left:10vw;top:20vh;width:30vw;height:40vh;background:#ef4444;border-radius:24px"></div><div style="position:absolute;left:45vw;top:35vh;width:22vw;height:22vw;background:#3b82f6;border-radius:50%"></div><div style="position:absolute;left:62vw;top:15vh;width:0;height:0;border-left:12vw solid transparent;border-right:12vw solid transparent;border-bottom:30vh solid #10b981"></div></body>'''
logo='''<body style="margin:0;background:transparent"><div style="width:360px;height:360px;border-radius:50%;background:#2563eb;position:relative"><div style="position:absolute;inset:70px;border-radius:50%;background:#fff"></div><div style="position:absolute;left:130px;top:150px;width:100px;height:60px;border-radius:14px;background:#111827"></div></div></body>'''
svgs=['/usr/share/libwacom/layouts/intuos4-8x13.svg','/usr/share/libwacom/layouts/cintiq-21ux2.svg','/usr/share/libwacom/layouts/intuos-pro-2-m.svg']
with sync_playwright() as p:
    b=p.chromium.launch()
    for (w,h,tag) in [(1920,1080,'fhd'),(1280,720,'hd')]:
        pg=b.new_page(viewport={'width':w,'height':h})
        pg.goto('http://127.0.0.1:8765/'); pg.wait_for_timeout(700); save(f'shot-app-ui-{tag}',pg.screenshot(),*SS)
        pg=b.new_page(viewport={'width':w,'height':h}); pg.set_content(code_html%('#1e1e1e','#d4d4d4',colored)); save(f'shot-code-dark-{tag}',pg.screenshot(),*SS)
        pg=b.new_page(viewport={'width':w,'height':h}); pg.set_content(code_html%('#ffffff','#1f2328',code)); save(f'shot-code-light-{tag}',pg.screenshot(),*SS)
        pg=b.new_page(viewport={'width':w,'height':h}); pg.set_content(table); save(f'shot-table-{tag}',pg.screenshot(),*SS)
        pg=b.new_page(viewport={'width':w,'height':h}); pg.set_content(grad); save(f'illus-css-gradients-{tag}',pg.screenshot(),'ilustración|gráfico',['low-compression','lossless'])
        pg=b.new_page(viewport={'width':w,'height':h}); pg.set_content(flat); save(f'illus-flat-{tag}',pg.screenshot(),'ilustración|gráfico',['low-compression','lossless'])
        for i,s in enumerate(svgs):
            try:
                pg=b.new_page(viewport={'width':w,'height':h}); pg.set_content('<body style="margin:0;background:#fff"><img style="width:100%;height:100%;object-fit:contain" src="data:image/svg+xml;base64,'+__import__('base64').b64encode(open(s,'rb').read()).decode()+'"></body>'); pg.wait_for_timeout(200); save(f'svg-line-art-{i}-{tag}',pg.screenshot(),'gráfico|captura de pantalla|ilustración',['lossless','low-compression'])
            except Exception as e: print('skip svg',e)
        pg.close()
    pg=b.new_page(viewport={'width':360,'height':360}); pg=b.new_page(viewport={'width':w,'height':h}); pg.set_content(logo); save('logo-alpha',pg.screenshot(omit_background=True),'gráfico|captura de pantalla',['lossless','low-compression'])
    pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=3); pg.goto('http://127.0.0.1:8765/'); pg.wait_for_timeout(600); save('shot-mobile-3x',pg.screenshot(),*SS)
    b.close()
json.dump(meta,open('real/meta.json','w'))
print(len(meta),'total')
