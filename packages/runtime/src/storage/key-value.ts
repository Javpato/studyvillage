import type {KeyValueStore} from '../../../core/src/storage';
/** Access is lazy: opening browser storage can itself throw (privacy settings/quota). */
export const browserKeyValue:KeyValueStore={
 getItem:key=>globalThis.localStorage.getItem(key),
 setItem:(key,value)=>globalThis.localStorage.setItem(key,value),
};
