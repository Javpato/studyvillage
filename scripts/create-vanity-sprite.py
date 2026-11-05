"""Editable source for the original 64×64 vanity furniture PNG."""
from PIL import Image, ImageDraw
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
im=Image.new('RGBA',(64,64));d=ImageDraw.Draw(im)
# Mirror, warm timber frame, glass highlights, tabletop and drawers.
for box,color in [((13,3,50,35),'#513f3b'),((11,7,52,31),'#513f3b'),((15,5,48,33),'#b68765'),((17,7,46,31),'#e8d0a2'),((19,9,44,29),'#84afb0'),((21,11,42,27),'#b9d5d0'),((23,11,27,23),'#e6efdc'),((29,11,31,16),'#e6efdc'),((7,34,56,41),'#624939'),((7,34,56,36),'#e0ba89'),((10,42,15,60),'#6c503d'),((48,42,53,60),'#6c503d'),((17,42,46,53),'#a67c59'),((18,43,45,47),'#c49d70'),((29,44,33,45),'#edd39c'),((9,28,15,33),'#ad6571'),((11,25,13,27),'#d6ac81'),((49,29,55,33),'#697e61'),((50,26,54,28),'#ecd6a8')]:d.rectangle(box,fill=color)
im.save(root/'app/public/sprites/vanity.png')
p=root/'app/public/sprites/manifest.json';manifest=json.loads(p.read_text());manifest['vanity']={'file':'vanity.png','width':64,'height':64};p.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
