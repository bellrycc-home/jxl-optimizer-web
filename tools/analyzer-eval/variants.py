import json, io
from PIL import Image
import numpy as np
meta=json.load(open('real/meta.json')); out=[]
def save(name, im, truth, profs):
    im=im.convert('RGBA'); np.asarray(im,dtype=np.uint8).tofile(f'real2/{name}.rgba')
    out.append(dict(name=name,w=im.width,h=im.height,truth=truth,profiles=profs,fmt='PNG'))
def load(n,w,h): return Image.fromarray(np.fromfile(f'real/{n}.rgba',dtype=np.uint8).reshape(h,w,4),'RGBA')
def jpg(im,q):
    b=io.BytesIO(); im.convert('RGB').save(b,'JPEG',quality=q); b.seek(0); return Image.open(b)
for m in meta:
    n,w,h=m['name'],m['w'],m['h']; im=load(n,w,h); isphoto=n.startswith('photo'); isshot=n.startswith('shot') or n.startswith('text')
    if isphoto:
        T=('fotografía',['balanced','low-compression'])
        for q in (30,75,95): save(f'photo-{n[6:]}-jpgq{q}',jpg(im,q),*T)
        save(f'photo-{n[6:]}-half',im.resize((max(8,w//2),max(8,h//2)),Image.LANCZOS),*T)
        save(f'photo-{n[6:]}-x2up',im.resize((w*2,h*2),Image.BICUBIC),*T)
    elif isshot:
        T=('captura de pantalla|gráfico',['lossless'])
        save(f'shot-{n[5:]}-x2down' if n.startswith('shot') else f'text-{n[5:]}-x2down',im.resize((max(8,w//2),max(8,h//2)),Image.LANCZOS),*T)
        save(f'shot-{n[5:]}-x2up' if n.startswith('shot') else f'text-{n[5:]}-x2up',im.resize((w*2,h*2),Image.BICUBIC),*T)
        save(f'shot-{n[5:]}-jpgq85' if n.startswith('shot') else f'text-{n[5:]}-jpgq85',jpg(im,85),*T)
json.dump(out,open('real2/meta.json','w')); print(len(out))
