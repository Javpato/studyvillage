// Component checks use Vite source modules; production journeys live in pet-expressions.spec.ts.
import {test,expect} from '@playwright/test';
test('all species have two side-view eyes and rabbit rendering honors reduced motion',async({page})=>{
 await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();
 const result=await page.evaluate(async()=>{
  const {sprite,spriteDefinition}=await import('/src/'+'assets/sprite-catalog.ts');const {drawPet}=await import('/src/'+'pets/art.ts');const canvas=document.createElement('canvas');canvas.width=224;canvas.height=128;const ctx=canvas.getContext('2d')!,eyes:Record<string,number[]>={};
  for(const species of ['cat','dog','parrot','hamster','rabbit']){ctx.clearRect(0,0,224,128);ctx.drawImage(sprite(`pet-${species}-sheet`)!,0,0);eyes[species]=[];for(let row=0;row<4;row++){const data=ctx.getImageData(0,row*32+12,32,3).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i]===38&&data[i+1]===61&&data[i+2]===52&&data[i+3]===255)count++;eyes[species].push(count);}}
  const translations:number[]=[];ctx.translate=(_x,y)=>{translations.push(y);};drawPet(ctx,{id:'r',owner:'owner',species:'rabbit',x:100,y:100,scene:'room',state:'ability',direction:'left',moving:true,reactionUntil:0,jumpProgress:.5},0);return{eyes,lift:100-translations.at(-1)!,height:(spriteDefinition('pet-rabbit-sheet') as any).jumpHeight};
 });
 for(const counts of Object.values(result.eyes))expect(counts).toEqual([12,12,12,0]);expect(result.lift).toBe(result.height);
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.evaluate(async()=>{const {drawPet}=await import('/src/'+'pets/art.ts');const ctx=document.createElement('canvas').getContext('2d')!;let y=0;ctx.translate=(_x,next)=>{y=next;};drawPet(ctx,{id:'r',owner:'owner',species:'rabbit',x:100,y:100,scene:'room',state:'ability',direction:'left',moving:true,reactionUntil:0,jumpProgress:.5},0);return y;})).toBe(100);
});

test('ambient parrot speech does not replace intentional dialogue and follows without taking focus',async({page})=>{
 await page.goto('/');await expect(page.getByTestId('phone-button')).toBeVisible();
 expect(await page.evaluate(async()=>{const {NpcSpeech}=await import('/src/'+'ui/npc-speech.ts');const speech=new NpcSpeech(),ctx=document.createElement('canvas').getContext('2d')!;const input=document.createElement('input');document.body.append(input);input.focus();speech.say('Guide',200,200,'room');speech.draw(ctx,'room');speech.sayPet('Parrot',100,100,'room','p',Date.now()+8000,true);const guide=speech.announcement.textContent;speech.clear();speech.sayPet('Parrot',100,200,'room','p',Date.now()+8000,true);speech.draw(ctx,'room');const left=speech.root.style.left;speech.followPet('p',600,200);speech.draw(ctx,'room');const moved=left!==speech.root.style.left,focused=document.activeElement===input;speech.draw(ctx,'other');const closed=!speech.isOpen;speech.dispose();input.remove();return{guide,moved,focused,closed};})).toEqual({guide:'Guide',moved:true,focused:true,closed:true});
});
