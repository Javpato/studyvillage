import {defaultPhoneLayout,phoneLayoutSchema,type PhoneLayout} from '../../../core/src/phone/layout';
import {browserKeyValue} from './key-value';
import type {KeyValueStore} from '../../../core/src/storage';
export const PHONE_LAYOUT_KEY='studyvillage-phone-layout-v1';
export function loadPhoneLayout(store:KeyValueStore=browserKeyValue):PhoneLayout{
 try {const raw=store.getItem(PHONE_LAYOUT_KEY);return raw?phoneLayoutSchema.parse(JSON.parse(raw)):defaultPhoneLayout();}catch{return defaultPhoneLayout();}
}
export function savePhoneLayout(layout:PhoneLayout,store:KeyValueStore=browserKeyValue):void{store.setItem(PHONE_LAYOUT_KEY,JSON.stringify(phoneLayoutSchema.parse(layout)));}
