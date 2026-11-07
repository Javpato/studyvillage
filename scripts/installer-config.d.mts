import type {Configuration} from 'electron-builder';
export function installerConfig(key:string,root:string,app:string,output:string,pkg:{devDependencies:{electron:string}}):Configuration&{nsis:NonNullable<Configuration['nsis']>;appImage:NonNullable<Configuration['appImage']>};
