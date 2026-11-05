import { sameSpace, type HouseSpace } from '../house/workspaces';
import type { Member, Position } from '../../../packages/core/src/protocol/types';

export type WorldAreaId = 'residential' | 'community' | 'study';
export const AREA_NAMES: Record<WorldAreaId, string> = {
  residential: 'La aldea', community: 'Plaza Comunitaria', study: 'Biblioteca y Estudio',
};
export function areaOf(position: Position): WorldAreaId { return position.areaId ?? 'residential'; }

/** House membership takes precedence over the outdoor area a visitor came from. */
export function isInScene(member: Member, area: WorldAreaId, houseId: string | null, space?: HouseSpace): boolean {
  return member.connected && member.houseId === houseId && (houseId !== null ? sameSpace(member.position.space,space) : areaOf(member.position) === area);
}
