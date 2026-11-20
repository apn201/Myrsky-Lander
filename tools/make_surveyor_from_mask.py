# Code written with an AI assistant (Claude Code, Anthropic), Nov 2026.
# Surveyor 3 cut-outs from the hand-made mask (art/surveyor/user/mask_full.png, retouched crop crop_retouched.webp).
# Run from the repo root: python tools/make_surveyor_from_mask.py web/assets <preview dir>
from PIL import Image, ImageDraw
import numpy as np, sys
base='art/surveyor/user/'
col=Image.open(base+'crop_retouched.webp').convert('L')
m=Image.open(base+'mask_full.png').convert('L')
def cut(mask, poly):
    k=Image.new('L',mask.size,255); ImageDraw.Draw(k).polygon(poly,fill=0)
    a=(np.asarray(mask).astype(int)*np.asarray(k)//255).astype(np.uint8)
    from scipy import ndimage
    lab,n=ndimage.label(a>115); sz=ndimage.sum(np.ones_like(lab),lab,range(1,n+1))
    keep=np.isin(lab,1+np.where(sz>=3000)[0])
    keep=ndimage.binary_dilation(keep,iterations=3)
    return Image.fromarray((a*keep).astype(np.uint8))
cam=[(930,450),(926,404),(1013,412),(1020,480),(1003,490),(1003,618),(945,618),(940,525),(952,510),(937,480)]
scoop=[(1553,722),(1661,722),(1661,795),(1553,795)]
nocam=cut(m,cam); bare=cut(nocam,scoop)
out=sys.argv[1]
for n,a in [('full',m),('nocam',nocam),('bare',bare)]:
    Image.merge('LA',(col,a)).save(f'{out}/sv_photo_{n}.png',optimize=True)
# preview: on dark grey
for n,a in [('nocam',nocam),('bare',bare)]:
    bg=Image.new('L',m.size,40); bg.paste(col,mask=a); bg.crop((850,360,1661,820)).save(f'{sys.argv[2]}/prev_{n}.png')
