/** Synchronous persistence port for legacy small documents. Implementations own platform access. */
export interface KeyValueStore {
 getItem(key:string):string|null;
 setItem(key:string,value:string):void;
}
