/** Export the original pixel primitives once. Ordinary builds never overwrite owner PNG replacements. */
import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:3100');
 const images=await page.evaluate(async(only)=>{
  const catalog=await import('/src/assets/sprite-catalog.ts');catalog.useSpriteCatalog(false);
  const art=await import('/src/ui/art.ts'),world=await import('/src/world/draw.ts'),areas=await import('/src/world/areas.ts'),house=await import('/src/house/draw.ts'),lights=await import('/src/world/lights.ts'),icons=await import('/src/ui/pixel-icons.ts'),study=await import('/src/ui/study-sprites.ts'),objects=await import('/src/world/interactive-objects.ts');
  const doors=await import('/src/house/space-draw.ts');const result={};
  const raster=(name,width,height,draw)=>{if(only&&!only.includes(name))return;const c=document.createElement('canvas');c.width=width;c.height=height;draw(c.getContext('2d'));result[name]={data:c.toDataURL(),width,height};};
  raster('room-door',44,44,doors.paintSpaceDoorSource);raster('plot-empty',128,104,c=>world.paintEmptyPlotSource(c,7,6,114,83,0));
  for(const area of Object.values(areas.WORLD_AREAS))for(const portal of area.portals)raster(portal.id.replace(':','-'),portal.rect.w,portal.rect.h+10,c=>areas.paintPortalSource(c,portal.rect.w,portal.rect.h));
  for(let variant=0;variant<3;variant++)raster(`world-tree-${variant}`,64,64,c=>art.drawTree(c,32,48,1,0,variant));
  raster('street-lamp',24,48,c=>lights.drawStreetLight(c,{x:12,y:40},0));
  raster('terrain-residential',768,432,world.paintResidentialGround);raster('terrain-community',768,432,areas.paintCommunityGround);raster('terrain-study',768,432,areas.paintStudyGround);
  for(const theme of ['mint','peach']) {
    const home={ownerId:'template',revision:1,name:'',theme,access:'ask',furniture:[]};
    raster(`house-exterior-${theme}`,640,160,c=>{for(let frame=0;frame<4;frame++){c.save();c.beginPath();c.rect(frame*160,0,160,160);c.clip();c.translate(frame*160,0);world.paintHouseSource(c,{parcel:{slot:0,x:16,y:56,w:114,h:83,doorX:73,doorY:139},house:home,name:'',ownerId:'template',isOwn:false},frame*.78);c.restore();}});
    raster(`house-interior-${theme}`,768,432,c=>house.paintRoomSource(c,home));
  }
  const registry=new objects.InteractiveObjectRegistry(areas.DEFAULT_AREA_OBJECTS);
  for(const object of areas.DEFAULT_AREA_OBJECTS.filter(o=>o.kind!=='guide'))raster(object.id.replace(':','-'),object.w,object.h,c=>areas.paintStationSource(c,{...object,x:0,y:0},registry));
  async function svgRaster(name,svg,size){svg.setAttribute('color','#fff');const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));try{const img=new Image();img.src=url;await img.decode();raster(name,size,size,c=>c.drawImage(img,0,0,size,size));}finally{URL.revokeObjectURL(url);}}
  for(const name of Object.keys(icons.MONO_ICONS))await svgRaster('icon-'+name,icons.monoIcon(name,48),48);
  for(const kind of ['notebook','cards','quiz','create','review'])await svgRaster('study-'+kind,study.studySprite(kind,96),96);
  const avatar=art.avatarSpriteSheet({fingerprint:'template',color:'#6c9474',displayName:'Template',publicKey:''});if(!only||only.includes('avatar-template'))result['avatar-template']={data:avatar.toDataURL(),width:192,height:256};
  catalog.useSpriteCatalog(true);return result;
 },process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',')||null);
 const base=new URL('../app/public/sprites/',import.meta.url);
 // Re-read at mutation time to preserve catalogue entries another task may have added.
 const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
 for(const [name,asset]of Object.entries(images)){await writeFile(new URL(name.toLowerCase()+'.png',base),Buffer.from(asset.data.split(',')[1],'base64'));manifest[name]={file:name.toLowerCase()+'.png',width:asset.width,height:asset.height};}
 await writeFile(new URL('manifest.json',base),JSON.stringify(manifest,null,2)+'\n');
 console.log(`Exported ${Object.keys(images).length} original world/UI PNG assets.`);
}finally{await browser.close();}
