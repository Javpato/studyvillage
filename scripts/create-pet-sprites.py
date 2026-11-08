"""Original StudyVillage pet pixel art. Explicit regeneration only; never run by builds."""
from PIL import Image, ImageDraw
from pathlib import Path
import json, argparse
parser=argparse.ArgumentParser();parser.add_argument("--sheets-only",action="store_true");args=parser.parse_args()
out=Path(__file__).resolve().parents[1]/'app/public/sprites'
manifest=json.loads((out/'manifest.json').read_text())
colors={'cat':'#d29a61','dog':'#a36c48','parrot':'#5aab67','hamster':'#dfb876','rabbit':'#ded8cc'}
for species,color in colors.items():
 sheet=Image.new('RGBA',(224,128))
 for direction in range(4):
  for frame in range(7):
   im=Image.new('RGBA',(32,32));d=ImageDraw.Draw(im);dy=1 if frame==2 else 0
   if not (species=='rabbit' and frame==6):d.ellipse((6,25,26,29),fill='#263d3438')
   if species=='parrot':
    d.ellipse((11,10+dy,22,26+dy),fill=color);d.ellipse((10,5+dy,22,18+dy),fill='#7ac778');d.polygon([(20,12+dy),(28,16+dy),(20,18+dy)],fill='#e6b44f');d.polygon([(12,23),(10,31),(17,26)],fill='#4488ab');d.ellipse((9,14+dy,17,24+dy),fill='#3d8158')
   else:
    d.ellipse((7,14+dy,26,27+dy),fill=color);d.ellipse((7,8+dy,24,22+dy),fill=color)
    if species=='cat':
     d.polygon([(7,13+dy),(7,3+dy),(14,9+dy)],fill=color);d.polygon([(18,9+dy),(24,3+dy),(24,14+dy)],fill=color);d.line([(24,23),(29,20),(29,14)],fill=color,width=3)
    elif species=='dog':
     d.ellipse((4,8+dy,10,21+dy),fill='#70462e');d.ellipse((22,8+dy,27,21+dy),fill='#70462e');d.rectangle((10,20,23,22),fill='#bd5654')
    elif species=='hamster':
     d.ellipse((5,5+dy,13,13+dy),fill=color);d.ellipse((20,5+dy,27,13+dy),fill=color);d.ellipse((10,19,23,27),fill='#f4e4c5')
    else:
     d.ellipse((8,0,13,15),fill=color);d.ellipse((18,0,23,15),fill=color);d.line((10,3,10,11),fill='#cc9b99',width=2);d.line((20,3,20,11),fill='#cc9b99',width=2);d.ellipse((24,21,30,27),fill='#f5efe5')
    d.rectangle((9,25,13,28+(frame==1)),fill=color);d.rectangle((21,25,25,28+(frame==2)),fill=color)
   if direction!=3:
    for x in ([13,21] if direction==0 else [10,17] if direction==1 else [17,23]):
     d.rectangle((x,12+dy,x+1,14+dy),fill='#263d34')
    if species!='parrot':d.rectangle((16,17+dy,18,18+dy),fill='#744a48')
   if frame==3:d.rectangle((12,26,23,29),fill='#75a6b7')
   if frame==4:d.polygon([(15,2),(12,0),(10,2),(15,7),(20,2),(18,0)],fill='#d87983')
   if frame==5 and direction!=3:
    d.rectangle((10,12+dy,23,14+dy),fill=color);d.line((11,14+dy,14,14+dy),fill='#425143');d.line((20,14+dy,23,14+dy),fill='#425143')
   if frame==6:
    if species=='hamster':d.ellipse((2,2,30,30),outline='#79b9cf',width=2)
    elif species=='dog':d.ellipse((23,19,30,25),fill='#cd7658')
    elif species=='rabbit':
     # Height is rendered above a stationary ground shadow, never baked into the frame.
     d.rectangle((9,25,13,28),fill=(0,0,0,0));d.rectangle((21,25,25,28),fill=(0,0,0,0))
     d.ellipse((9,22,14,26),fill=color);d.ellipse((20,22,25,26),fill=color)
    elif species=='cat':d.arc((2,4,29,30),220,300,fill='#e5ba6c',width=2)
   sheet.alpha_composite(im,(frame*32,direction*32))
 file=f'pet-{species}-sheet.png';sheet.save(out/file)
 manifest[f'pet-{species}-sheet']={'file':file,'width':224,'height':128,'frameWidth':32,'frameHeight':32,'animations':{'idle':[0],'walk':[1,2],'eat':[3,0],'pet':[4],'rest':[5],'ability':[6]},'directions':{'down':0,'left':1,'right':2,'up':3},'fps':6,'scale':1.25,'anchor':{'x':16,'y':27},'collisionRadius':9}
 if species=='rabbit':manifest[f'pet-{species}-sheet'].update(jumpHeight=32);manifest[f'pet-{species}-sheet']['animations']['jump']=[6]
 if species=='hamster':manifest[f'pet-{species}-sheet']['animations'].update(ballIdle=[6],ballWalk=[6])
 if args.sheets_only:continue
 im=Image.new('RGBA',(64,64));d=ImageDraw.Draw(im);d.ellipse((6,49,59,61),fill='#263d3438')
 if species=='rabbit':
  d.ellipse((5,20,59,58),fill='#78945b');d.ellipse((22,32,43,58),fill='#5e4936');d.rectangle((9,51,57,57),fill='#99b66e');d.line((49,20,49,6),fill='#63935b',width=3);d.polygon([(45,17),(52,17),(49,29)],fill='#d78d45')
 elif species=='cat':
  d.rectangle((13,23,51,55),fill='#cfaa73');d.polygon([(6,24),(32,5),(58,24)],fill='#8b667d');d.ellipse((22,32,42,56),fill='#655548');d.rectangle((3,40,12,45),fill='#ad8d63');d.rectangle((52,29,61,34),fill='#ad8d63');d.line((8,45,8,57),fill='#9d805c',width=4)
 elif species=='parrot':
  d.rectangle((12,14,52,53),fill='#e4bc76');d.polygon([(8,15),(32,3),(56,15)],fill='#539278');d.rectangle((17,20,47,47),fill='#537360');d.line((19,36,45,36),fill='#d4b57f',width=3)
  for x in range(19,48,7):d.line((x,19,x,47),fill='#d8c797',width=2)
  d.rectangle((26,53,38,60),fill='#8b6749')
 elif species=='hamster':
  d.rounded_rectangle((8,17,56,55),radius=5,fill='#d8b77c');d.rectangle((7,13,57,22),fill='#94b5b0');d.ellipse((13,29,34,51),fill='#6e5c43');d.ellipse((39,30,61,52),outline='#b97457',width=5);d.rectangle((11,52,55,57),fill='#b58f5f')
 else:
  d.rectangle((11,24,53,57),fill='#bd8159');d.polygon([(4,26),(32,4),(60,26)],fill='#8e5250');d.rectangle((23,35,42,58),fill='#574639');d.ellipse((23,29,42,46),fill='#574639');d.rectangle((26,18,40,22),fill='#ead6a6')
 file=f'pet-{species}.png';im.save(out/file);manifest[f'pet-{species}']={'file':file,'width':64,'height':64}
if not args.sheets_only:
 im=Image.new('RGBA',(64,64));d=ImageDraw.Draw(im);d.ellipse((8,28,56,54),fill='#47758a');d.ellipse((10,23,54,44),fill='#9cc8ce');d.ellipse((16,27,48,39),fill='#80573f')
 for x,y in [(21,30),(30,29),(39,31),(26,34),(36,35)]:d.rectangle((x,y,x+4,y+3),fill='#ba8955')
 im.save(out/'pet-bowl.png');manifest['pet-bowl']={'file':'pet-bowl.png','width':64,'height':64}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
