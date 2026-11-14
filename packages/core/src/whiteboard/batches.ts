import type {BoardStroke} from '../protocol/types';
/** Reserve room for per-object signatures, the commit signature and transport envelope. */
export function* boardBatches(changes:readonly BoardStroke[]):Generator<BoardStroke[]> {
 let batch:BoardStroke[]=[],bytes=2048;const encoder=new TextEncoder();
 for(const stroke of changes){const size=encoder.encode(JSON.stringify(stroke)).length+256;
 if(batch.length&&(batch.length===128||bytes+size>60000)){yield batch;batch=[];bytes=2048;}
 if(size+2048>60000)throw Error('Invalid board object size');batch.push(stroke);bytes+=size;}
 if(batch.length)yield batch;
}
