"""Render the original editable grids; no painted or filtered source images."""
import json
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'app/src/assets/pixel-cast/animals.json').read_text())
out=root/'app/public/sprites';manifest=json.loads((out/'manifest.json').read_text())
previews=[]
for species,art in data['animals'].items():
 sheet=Image.new('RGBA',(224,128))
 for direction in range(4):
  for frame in range(7):
   im=Image.new('RGBA',(32,32));p=art['palette'];bob=-1 if frame==2 else 0
   def grid(rows,x,y):
    for dy,row in enumerate(rows):
     for dx,key in enumerate(row):
      if key in p and 0<=x+dx<32 and 0<=y+dy<32:im.putpixel((x+dx,y+dy),tuple(bytes.fromhex(p[key][1:]))+(255,))
   quadruped=direction in [1,2] and species!='parrot'
   body=list(data['sideBody'] if quadruped else data['body'])
   if frame in [1,2]:
    body[-2]=('...oFFo.......oFFo..' if frame==1 else '.oFFo.......oFFo....') if quadruped else ('..oFFoo.........' if frame==1 else '.........oFFo...')
    body[-1]=('...oooo.......oooo..' if frame==1 else '.oooo.......oooo....') if quadruped else ('..oooo..........' if frame==1 else '.........oooo...')
   grid(body,5 if quadruped else 8,17+bob)
   face=art['front'] if direction==0 else art['right'] if direction in [1,2] else data['back']
   # Long rabbit ears have room above the eye line; all feet share the same anchor.
   y=3 if species=='rabbit' else 7
   if direction==3:
    grid(art['front'][:6] if species=='rabbit' else art['front'][:3],8,y+bob)
    grid(face,8,10+bob)
   else:grid(face,14 if quadruped else 8,y+bob+(2 if frame==3 else 0))
   if species=='parrot':grid(['.oHHHo..oHHHo.','oHHHho..oHHHho','.ohho....ohho.'],8,19+bob)
   if species=='cat':grid(['...oo','..oFo','..oFo','.oFfo','oFffo','.ooo.'],1 if quadruped else 24,16+bob)
   if species=='dog':grid(['...oo','..oFo','.oFfo','offo.','.oo..'],1 if quadruped else 24,16+bob)
   if species=='rabbit':grid(['.ooo.','oLFFo','offfo','.ooo.'],2 if quadruped else 24,19+bob)
   if frame==3:grid(['.oooooooo.','oHHHHHHHHo','.oHHHHHHo.','..oooooo..'],11,26)
   if frame==4:grid(['.ss.ss.','sSSsSSs','sSSSSSs','.sSSSs.','..sSs..','...s...'],23,1)
   if frame==5 and direction!=3:
    grid(['FFFF','oooo'],13 if direction in [1,2] else 11,14+bob)
    if direction==0:grid(['FFFF','oooo'],19,14+bob)
   if frame==6:
    if species=='hamster':
     p={**p,'b':'#75b5c2','B':'#d4efec'}
     grid(['........bbbbbbbb........','.....bbb........bbb.....','...bb..............bb...','..b..................b..','.b....................b.','b......................b'],4,0)
     grid(['b......................b','.b....................b.','..b..................b..','...bb..............bb...','.....bbb........bbb.....','........bbbbbbbb........'],4,26)
     for y in range(6,26):grid(['b......................b'],4,y)
    elif species=='rabbit':
     for y in range(25,28):
      for x in range(7,25):im.putpixel((x,y),(0,0,0,0))
     grid(['oFFo....oFFo','oooo....oooo'],10,23)
    elif species=='dog':grid(['.ssss.','sLLLLs','sLLLLs','.ssss.'],25,24)
    elif species=='parrot':grid(['oHHHHho','oHHHho.','oHHho..','ooo....'],2,18)
    else:grid(['L...L','..L..','L...L'],25,5)
   if direction==1:im=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
   sheet.alpha_composite(im,(frame*32,direction*32))
 sheet.save(out/f'pet-{species}-sheet.png');previews.append(sheet)
 # Keep existing frame contract, animation semantics, anchors and movement footprint.
 manifest[f'pet-{species}-sheet']['animations']['walk']=[1,0,2,0]
 manifest[f'pet-{species}-sheet']['fps']=8
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
preview=Image.new('RGBA',(224,128*len(previews)), '#e9dfcb')
for i,im in enumerate(previews):preview.alpha_composite(im,(0,128*i))
folder=root/'docs/images/pixel-cast';folder.mkdir(parents=True,exist_ok=True)
preview.resize((672,128*len(previews)*3),Image.Resampling.NEAREST).save(folder/'animals.png')
print('Rendered five directional animal sheets from editable grids.')
