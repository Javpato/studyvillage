import {afterEach,describe,expect,it,vi} from 'vitest';
import {layoutViewport,normalizedVisualViewport} from '../src/input/browser-viewport';
import {currentHudProfile,mobileKind} from '../src/input/hud-layout';
afterEach(()=>vi.unstubAllGlobals());
describe('browser viewport coordinates',()=>{
 it('keeps tablet HUD classification and orientation when Safari reports a zoomed inner viewport',()=>{
  vi.stubGlobal('document',{documentElement:{clientWidth:1024,clientHeight:768}});vi.stubGlobal('window',{innerWidth:512,innerHeight:600});vi.stubGlobal('navigator',{maxTouchPoints:5,userAgent:'Macintosh'});vi.stubGlobal('matchMedia',()=>({matches:true}));
  expect(layoutViewport()).toEqual({width:1024,height:768});expect(mobileKind()).toBe('tablet');expect(currentHudProfile()).toBe('tablet-landscape');
 });
 it('keeps the zoomed visible rectangle and keyboard pan inside layout coordinates',()=>{
  expect(normalizedVisualViewport({width:1024,height:768},{width:512,height:384,offsetLeft:120,offsetTop:80,scale:2})).toEqual({width:512,height:384,left:120,top:80,right:392,bottom:304,scale:2});
  expect(normalizedVisualViewport({width:1024,height:768},{width:1024,height:400,offsetLeft:0,offsetTop:200,scale:1})).toMatchObject({top:200,bottom:168,height:400});
 });
 it('drops stale pan offsets after zooming out and rejects invalid transient viewport values',()=>{
  expect(normalizedVisualViewport({width:1024,height:768},{width:1024,height:768,offsetLeft:120,offsetTop:80,scale:1})).toEqual({width:1024,height:768,left:0,top:0,right:0,bottom:0,scale:1});
  expect(normalizedVisualViewport({width:1024,height:768},{width:NaN,height:0,offsetLeft:-30,offsetTop:Infinity,scale:NaN})).toEqual({width:1024,height:768,left:0,top:0,right:0,bottom:0,scale:1});
 });
});
