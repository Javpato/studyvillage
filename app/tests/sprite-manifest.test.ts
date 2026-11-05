import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
it('every replacement sprite is a real PNG with its promised dimensions and a safe filename',()=>{
 const base=new URL('../public/sprites/',import.meta.url),catalogue=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8')) as Record<string,{file:string;width:number;height:number}>;
 expect(Object.keys(catalogue).length).toBeGreaterThan(80);
 for(const [id,item]of Object.entries(catalogue)){
  expect(item.file,id).toMatch(/^[a-z0-9_-]+\.png$/);const bytes=readFileSync(new URL(item.file,base));expect([...bytes.subarray(0,8)],id).toEqual([137,80,78,71,13,10,26,10]);expect(bytes.readUInt32BE(16),id).toBe(item.width);expect(bytes.readUInt32BE(20),id).toBe(item.height);
 }
});
