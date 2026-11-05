/** Fixed, isolated operations exposed by the Linux desktop preload. */
export interface DesktopBridge {
  loadLocal(): Promise<string | null>;
  saveLocal(json: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}
declare global { interface Window { studyVillageDesktop?: DesktopBridge } }
export function desktopBridge(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.studyVillageDesktop;
}
