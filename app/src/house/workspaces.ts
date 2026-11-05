export * from '../../../packages/core/src/house/workspaces';
export {LocalWorkspaces} from '../../../packages/runtime/src/storage/workspaces';
import {floorsOf,type HouseSpace} from '../../../packages/core/src/house/workspaces';
import type {PublicHouse} from '../../../packages/core/src/protocol/types';
import {t,defaultText} from '../i18n';
export function workspaceTitle(house: PublicHouse, space?: HouseSpace | null): string {
  if (!space) return t('Vestíbulo');
  const floor = floorsOf(house).find(f => f.id === space.floorId);
  return space.roomId ? defaultText(floor?.rooms.find(r => r.id === space.roomId)?.name ?? t('Habitación')) : defaultText(floor?.name ?? t('Planta'));
}
