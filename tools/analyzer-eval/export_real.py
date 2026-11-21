import json, os, sys
from PIL import Image
import numpy as np
SK='/usr/local/lib/python3.12/dist-packages/skimage/data/'
SL='/usr/local/lib/python3.12/dist-packages/sklearn/datasets/images/'
MP='/usr/local/lib/python3.12/dist-packages/matplotlib/mpl-data/sample_data/grace_hopper.jpg'
meta=[]
def save(name, im, truth, profs, fmt='PNG', maxside=None):
    im=im.convert('RGBA')
    if maxside and max(im.size)>maxside:
        s=maxside/max(im.size); im=im.resize((round(im.width*s), round(im.height*s)), Image.LANCZOS)
    a=np.asarray(im, dtype=np.uint8)
    a.tofile(f'real/{name}.rgba')
    meta.append(dict(name=name,w=im.width,h=im.height,truth=truth,profiles=profs,fmt=fmt))
PH=('fotografía',['balanced','low-compression'])
for n,p in [('astronaut',SK+'astronaut.png'),('coffee',SK+'coffee.png'),('chelsea',SK+'chelsea.png'),('rocket',SK+'rocket.jpg'),('retina',SK+'retina.jpg'),('hubble',SK+'hubble_deep_field.jpg'),('china',SL+'china.jpg'),('flower',SL+'flower.jpg'),('hopper',MP),('motorcycle',SK+'motorcycle_left.png'),('horse',SK+'horse.png')]:
    try:
        im=Image.open(p)
        if n=='horse': continue  # binary mask
        save('photo-'+n, im, *PH)
    except Exception as e: print('skip',n,e)
# upscaled "big photo" variants: crop real texture regions at native res to emulate large originals
im=Image.open(SK+'retina.jpg').convert('RGBA')
save('photo-retina-crop', im.crop((300,300,1100,1100)), *PH)
im=Image.open(SK+'hubble_deep_field.jpg')
# other genuinely non-photo samples from skimage
for n,p,truth,profs in [('text-page',SK+'page.png','captura de pantalla|gráfico',['lossless']),('text-text',SK+'text.png','captura de pantalla|gráfico',['lossless']),('chessboard',SK+'chessboard_RGB.png','gráfico|captura de pantalla|ilustración',['lossless','low-compression']),('logo-skimage',SK+'logo.png','gráfico|ilustración|captura de pantalla',['lossless','low-compression'])]:
    try: save(n, Image.open(p), truth, profs)
    except Exception as e: print('skip',n,e)
json.dump(meta,open('real/meta.json','w'))
print(len(meta),'exported'); [print(m['name'],m['w'],m['h']) for m in meta]
