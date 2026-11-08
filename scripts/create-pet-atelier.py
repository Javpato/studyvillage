"""Explicit, original code-authored pet atelier/effect art. Does not rewrite existing assets."""
from PIL import Image, ImageDraw
from pathlib import Path
import json
out=Path(__file__).resolve().parents[1]/'app/public/sprites'
manifest=json.loads((out/'manifest.json').read_text())
im=Image.new('RGBA',(64,64));d=ImageDraw.Draw(im)
for box,color in [((8,30,55,39),'#6c503d'),((8,30,55,33),'#e0ba89'),((12,40,17,60),'#6c503d'),((46,40,51,60),'#6c503d'),((13,4,50,29),'#699486'),((16,7,47,26),'#f5e6bb'),((21,43,42,53),'#a67c59')]:d.rectangle(box,fill=color)
d.ellipse((27,15,37,23),fill='#678d7e')
for x,y in [(22,13),(28,10),(35,10),(40,13)]:d.ellipse((x,y,x+4,y+5),fill='#678d7e')
for x,c in [(8,'#b76d77'),(50,'#d5ab66')]:d.rectangle((x,22,x+5,28),fill=c)
im.save(out/'pet-atelier.png');manifest['pet-atelier']={'file':'pet-atelier.png','width':64,'height':64}
for kind in ['ball','purr']:
 im=Image.new('RGBA',(64,64));d=ImageDraw.Draw(im)
 if kind=='ball':
  d.ellipse((2,2,61,61),outline='#79b9cf',width=3);d.arc((8,8,55,55),200,265,fill='#e2f3ed',width=2)
 else:
  d.arc((3,7,60,60),210,330,fill='#e5ba6c',width=3);d.arc((9,13,54,54),210,330,fill='#e5ba6c',width=2)
 name=f'pet-effect-{kind}';im.save(out/f'{name}.png');manifest[name]={'file':f'{name}.png','width':64,'height':64}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
