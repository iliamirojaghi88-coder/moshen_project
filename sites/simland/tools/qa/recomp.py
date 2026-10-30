import numpy as np, json, importlib.util
from PIL import Image
spec=importlib.util.spec_from_file_location('hl','tools/build-hero-layers.py'); hl=importlib.util.module_from_spec(spec); spec.loader.exec_module(hl)
orig=np.asarray(Image.open('source/hero/infinity-hero.png').convert('RGBA')).astype(np.float32)
src,_=hl.clean_matte(orig); src,_=hl.sharpen_machines(src)
base=np.asarray(Image.open('assets/hero/base.webp').convert('RGBA')).astype(np.float32)
sc=json.load(open('assets/hero/scene.json'))
comp=base.copy()
for t in sc['turbines']:
    bx,by,bw,bh=t['blades']
    L=np.asarray(Image.open(f'assets/hero/blades-{t["id"]}.webp').convert('RGBA')).astype(np.float32)
    R=comp[by:by+bh,bx:bx+bw]; a=L[...,3:4]/255
    oa=a+R[...,3:4]/255*(1-a)
    orgb=(L[...,:3]*a+R[...,:3]*R[...,3:4]/255*(1-a))/np.maximum(oa,1e-6)
    comp[by:by+bh,bx:bx+bw]=np.concatenate([orgb,oa*255],2)
for t in sc['turbines']:
    cx,cy,cw,ch=t['cap']
    L=np.asarray(Image.open(f'assets/hero/caps-{t["id"]}.webp').convert('RGBA')).astype(np.float32)
    R=comp[cy:cy+ch,cx:cx+cw]; a=L[...,3:4]/255
    oa=a+R[...,3:4]/255*(1-a)
    orgb=(L[...,:3]*a+R[...,:3]*R[...,3:4]/255*(1-a))/np.maximum(oa,1e-6)
    comp[cy:cy+ch,cx:cx+cw]=np.concatenate([orgb,oa*255],2)
bg=np.array([234,246,255],np.float32)
def over(x): a=x[...,3:4]/255; return x[...,:3]*a+bg*(1-a)
e=np.abs(over(comp)-over(src)).max(2)
ys,xs=np.where(e>6)
print('pixels differing by >6 on the page colour:', len(ys), 'max', round(float(e.max()),1))
for y,x in list(zip(ys,xs))[:20]: print(x,y,int(e[y,x]))
