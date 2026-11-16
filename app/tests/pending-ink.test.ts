import {describe,it,expect} from 'vitest';
import {PendingInk} from '../src/whiteboard/pending';
import type {BoardStroke} from '../../packages/core/src/protocol/types';
const stroke=(seq=1):BoardStroke=>({id:'ink',boardId:'board',author:'author',seq,tool:'pen',width:3,color:'#123456',points:[{x:1,y:2}],deleted:false});
describe('writer ink during persistence',()=>{
 it('is visible immediately and hands over to durable ink without duplication',()=>{const ink=new PendingInk(),s=stroke(),finish=ink.stage('one',[s]);expect(ink.merge('one',[])).toEqual([s]);expect(ink.merge('one',[s])).toEqual([s]);finish();expect(ink.merge('one',[s])).toEqual([s]);});
 it('does not erase a newer in-flight edit when an older save completes',()=>{const ink=new PendingInk(),first=ink.stage('one',[stroke()]),second=ink.stage('one',[stroke(2)]);first();expect(ink.merge('one',[stroke()])).toEqual([stroke(2)]);second();expect(ink.merge('one',[stroke(2)])).toEqual([stroke(2)]);});
 it('isolates board, identity and session and respects newer authoritative edits',()=>{const ink=new PendingInk();ink.stage('one',[stroke()]);expect(ink.merge('two',[])).toEqual([]);expect(ink.merge('one',[{...stroke(2),deleted:true}])).toEqual([{...stroke(2),deleted:true}]);});
});
