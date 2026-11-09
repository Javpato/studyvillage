import {describe,it,expect,vi} from 'vitest';
import {FocusAudio} from '../src/ui/focus-audio';
import {newFocusClockState} from '../src/ui/focus-clock-model';
import {verifyFocusAudio} from '../../packages/runtime/src/storage/focus-audio';
describe('timer alert delivery and stored audio',()=>{
 it('deduplicates repeated polling and ignores stale transitions without replaying a backlog',async()=>{vi.useFakeTimers();vi.setSystemTime(100000);const a=new FocusAudio(vi.fn()),play=vi.spyOn(a,'play').mockResolvedValue();const sound=newFocusClockState().sound;a.baseline(1);await a.alert({id:1,at:100000},sound,null);await a.alert({id:2,at:100000},sound,null);await a.alert({id:2,at:100000},sound,null);await a.alert({id:3,at:80000},sound,null);expect(play).toHaveBeenCalledTimes(1);await a.alert({id:4,at:100000},sound,null);expect(play).toHaveBeenCalledTimes(2);a.dispose();vi.useRealTimers();});
 it('rejects forged hashes, invalid PCM and oversized stored clips',async()=>{await expect(verifyFocusAudio({id:'0'.repeat(64),name:'bad',data:'data:audio/wav;base64,YWJjZA=='})).rejects.toThrow();await expect(verifyFocusAudio({id:'0'.repeat(64),name:'huge',data:'data:audio/wav;base64,'+'A'.repeat(600001)})).rejects.toThrow();});
});
