export type ReleaseKey='windows'|'linux'|'macos'|'android';
export interface ReleaseTarget {label:string;host?:'win32'|'linux'|'darwin';file:string;folder:string;app?:string;executable?:string;format:'nsis'|'appimage'|'dmg'|'apk';architectures:string[]}
export const releaseTargets:Record<ReleaseKey,ReleaseTarget>;
export function releaseTarget(key:string):ReleaseTarget;
export function publishedFiles():string[];
export function sha256(file:string):Promise<string>;
export function verifyInstallerFormat(key:string,file:string):Promise<void>;
