import {enclosedRegion} from './fill-region';
self.onmessage=(event:MessageEvent<{pixels:Uint8ClampedArray;width:number;height:number;x:number;y:number}>)=>{const p=event.data;try{self.postMessage({rects:enclosedRegion(p.pixels,p.width,p.height,p.x,p.y)});}catch{self.postMessage({error:'No se pudo rellenar el dibujo.'});}};
