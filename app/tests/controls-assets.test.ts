import {describe,it,expect} from 'vitest';
import {axisDirection,PressRepeater,keyboardGameAction,TETRIS_BINDINGS,setActiveInput,activeInput,buttonGlyph} from '../src/input/actions';
import {FALLBACK_PET_ART,validPetArt} from '../src/assets/pet-assets';
import {defaultPhoneLayout,phoneLayoutSchema} from '../../packages/core/src/phone/layout';
import {folderAppearance} from '../src/ui/folder-appearance';
import {messageKeys} from '../../scripts/translation-keys.mjs';
describe('input actions',()=>{
 it('ignores stick drift and nonfinite samples',()=>{expect(axisDirection(.24)).toBe(0);expect(axisDirection(-.3)).toBe(-1);expect(axisDirection(NaN)).toBe(0);});
 it('confirms once until release and repeats navigation after a delay',()=>{const r=new PressRepeater();expect(r.press('confirm',true,0)).toBe(true);expect(r.press('confirm',true,1000)).toBe(false);r.press('confirm',false,1001);expect(r.press('confirm',true,1002)).toBe(true);expect(r.press('left',true,0,true)).toBe(true);expect(r.press('left',true,299,true)).toBe(false);expect(r.press('left',true,300,true)).toBe(true);expect(r.press('left',true,399,true)).toBe(false);expect(r.press('left',true,400,true)).toBe(true);});
 it('keyboard actions and controller help use the same mappings',()=>{for(const b of TETRIS_BINDINGS)for(const key of b.keys)expect(keyboardGameAction(key)).toBe(b.action);setActiveInput('gamepad','DualSense');expect(buttonGlyph(0)).toBe('✕');setActiveInput('keyboard');expect(activeInput()).toBe('keyboard');setActiveInput('gamepad','Unknown Standard');expect(buttonGlyph(0)).toBe('◇↓');});
});
describe('sprite metadata and old folders',()=>{
 it('rejects invisible frame selections and accepts optional animation fallbacks',()=>{expect(validPetArt(FALLBACK_PET_ART,224,128)).toBe(true);expect(validPetArt({...FALLBACK_PET_ART,animations:{idle:[]}},224,128)).toBe(false);expect(validPetArt({...FALLBACK_PET_ART,animations:{idle:[7]}},224,128)).toBe(false);expect(validPetArt({...FALLBACK_PET_ART,scale:NaN},224,128)).toBe(false);expect(validPetArt({...FALLBACK_PET_ART,animations:{idle:[0]}},224,128)).toBe(true);});
 it('migrates renamed Settings by identity and preserves explicit appearance',()=>{const layout=phoneLayoutSchema.parse(defaultPhoneLayout()),settings=layout.entries.find(e=>e.type==='folder'&&e.id==='settings')!;if(settings.type!=='folder')throw Error();settings.name='Custom';settings.builtin=false;expect(folderAppearance(settings).icon).toBe('gear');settings.appearance={icon:'camera',color:'#123456'};expect(folderAppearance(settings)).toEqual(settings.appearance);settings.appearance.icon='invalid';expect(folderAppearance(settings)).toEqual({icon:'gear',color:'#123456'});settings.appearance.color='invalid';expect(phoneLayoutSchema.parse(layout).entries).toHaveLength(layout.entries.length);});
 it('detects missing keys in conditional expressions without treating lookup indices as messages',()=>{expect([...messageKeys("msg(ready?'Lista para usar.':'No disponible'); t('Hello');t(TITLES[phase??'lobby']);msg('Line\\nTwo')")]).toEqual(['Lista para usar.','No disponible','Hello','Line\nTwo']);});
});
