"""Original 16 px role glyphs, exported at the catalogue's 48 px replacement size."""
from PIL import Image,ImageDraw
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]/'app/public/sprites'
ink='#293b3b';skin='#efc799';gold='#ecc467';white='#eee9d8';green='#6d9c7b';purple='#987aaa';red='#c76f59';brown='#8f654c'
roles=['thief','elder','idiot','scapegoat','piper','whitewolf','crow','arsonist','innocent','sister','brother','fox','bear','judge','knight','actor','maid','wildchild','dogwolf','angel','cultist','bigwolf','infectwolf','gypsy']
for role in roles:
 im=Image.new('RGBA',(16,16));d=ImageDraw.Draw(im)
 def r(x,y,w,h,c):d.rectangle((x,y,x+w-1,y+h-1),fill=c)
 def poly(points,c):d.polygon(points,fill=c)
 def face(x=4,y=4,w=8,c=skin):
  r(x,y,w,7,ink);r(x+1,y+1,w-2,5,c);r(x+2,y+3,1,1,ink);r(x+w-3,y+3,1,1,ink)
 def wolf(c,eyes=gold):
  poly([(2,1),(6,4),(10,4),(13,1),(14,10),(11,14),(4,14),(1,10)],ink);poly([(3,3),(6,6),(10,6),(12,3),(12,11),(10,13),(5,13),(3,10)],c);r(4,7,2,1,eyes);r(10,7,2,1,eyes);r(6,10,4,2,white);r(7,10,2,1,ink)
 if role=='thief':
  face();r(4,2,8,3,ink);r(3,3,10,2,purple);r(4,7,8,2,ink);r(6,7,1,1,white);r(9,7,1,1,white);r(3,11,10,4,purple)
 elif role=='elder':
  face();r(3,3,10,2,white);poly([(4,8),(6,9),(9,9),(11,8),(10,13),(8,15),(5,12)],white);r(1,5,1,10,brown)
 elif role=='idiot':
  face();poly([(2,6),(3,1),(7,4),(11,1),(13,6)],red);r(2,1,2,2,gold);r(11,1,2,2,gold);r(3,11,10,4,green);r(7,11,2,2,gold)
 elif role=='scapegoat':
  poly([(2,1),(3,7),(6,5),(10,5),(13,7),(14,1),(12,2),(11,4),(5,4),(4,2)],brown);face(4,5,8,white);r(7,11,2,3,white)
 elif role=='piper':
  face();r(4,2,8,2,green);r(3,11,8,4,green);r(1,9,13,2,gold)
  for x in [3,6,9,12]:r(x,9,1,1,brown)
 elif role=='whitewolf':wolf(white,'#8bb7bd')
 elif role=='crow':
  poly([(2,13),(4,9),(4,5),(7,2),(11,2),(13,5),(10,6),(12,12),(9,14)],ink);r(9,4,1,1,gold);poly([(11,5),(15,6),(11,7)],gold);r(7,14,1,2,brown);r(10,14,1,2,brown);r(4,9,4,3,'#566778')
 elif role=='arsonist':
  poly([(8,0),(12,5),(11,8),(14,7),(14,12),(11,15),(4,15),(1,11),(4,6),(5,9),(6,4)],red);poly([(8,5),(10,9),(11,12),(8,14),(4,12),(6,9)],gold);r(7,11,2,3,white)
 elif role=='innocent':
  face();r(3,2,10,3,green);r(4,11,8,4,green);r(7,11,2,3,gold)
 elif role in ['sister','brother']:
  positions=[2,9] if role=='sister' else [0,5,10]
  for x in positions:
   r(x,3,5,6,brown);r(x+1,4,3,4,skin);r(x+1,6,1,1,ink);r(x,9,5,5,purple if role=='sister' else green)
 elif role=='fox':wolf('#cb8352',ink);r(5,11,6,2,white)
 elif role=='bear':
  r(2,2,4,4,brown);r(10,2,4,4,brown);face(2,4,12,brown);r(5,8,6,4,skin);r(7,8,2,2,ink);r(3,12,10,3,brown)
 elif role=='judge':
  r(9,4,2,9,brown);poly([(2,5),(6,1),(12,7),(8,11)],ink);poly([(3,5),(6,2),(11,7),(8,10)],brown);r(1,13,13,2,ink);r(2,12,11,1,gold)
 elif role=='knight':
  r(5,1,6,2,red);r(4,3,8,9,ink);r(3,5,10,6,'#a8b7ad');r(4,6,8,3,ink);r(5,7,1,2,gold);r(8,7,1,2,gold);r(10,7,1,2,gold);r(4,12,8,3,'#758c81');r(12,2,1,13,brown)
 elif role=='actor':
  for x,y,c in [(1,2,purple),(7,5,gold)]:
   r(x,y,7,8,ink);r(x+1,y+1,5,6,c);r(x+2,y+2,1,1,ink);r(x+4,y+2,1,1,ink);r(x+2,y+5,3,1,ink)
 elif role=='maid':
  r(3,2,10,9,white);face();r(3,11,10,4,purple);r(6,11,4,4,white);r(3,2,10,2,white)
 elif role=='wildchild':
  face();r(3,2,10,3,brown);poly([(3,11),(12,11),(14,15),(1,15)],green);poly([(12,1),(15,2),(13,5),(11,4)],green)
 elif role=='dogwolf':
  wolf('#a7856f');r(2,2,2,7,brown);r(12,2,2,7,white);r(4,12,8,2,red);r(7,13,2,2,gold)
 elif role=='angel':
  poly([(0,6),(4,8),(5,14),(0,11)],white);poly([(15,6),(11,8),(10,14),(15,11)],white);face(4,5);r(5,12,6,3,white);r(4,1,8,1,gold);r(3,2,1,2,gold);r(12,2,1,2,gold);r(4,4,8,1,gold)
 elif role=='cultist':
  poly([(8,0),(14,10),(12,15),(3,15),(1,10)],purple);r(4,7,8,5,ink);poly([(5,9),(8,7),(11,9),(8,11)],gold);r(7,8,2,3,ink)
 elif role=='bigwolf':
  wolf('#775d65','#e58b63');r(3,13,2,3,white);r(11,13,2,3,white);r(1,11,2,3,red)
 elif role=='infectwolf':
  wolf('#66896d','#cfe87e');r(2,11,2,2,green);r(4,14,2,2,green);r(11,13,2,3,green)
 elif role=='gypsy':
  poly([(5,1),(11,1),(14,5),(14,10),(11,13),(5,13),(2,10),(2,5)],ink);poly([(5,2),(10,2),(13,5),(13,9),(10,12),(5,12),(3,9),(3,5)],purple);r(5,4,2,3,white);r(4,13,8,2,gold);r(8,7,3,2,'#c2a8cb')
 im.resize((48,48),Image.Resampling.NEAREST).save(root/f'role-{role}.png')
manifest=json.loads((root/'manifest.json').read_text())
for role in roles:manifest[f'role-{role}']={'file':f'role-{role}.png','width':48,'height':48}
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
