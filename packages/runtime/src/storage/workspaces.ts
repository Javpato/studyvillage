import {spaceStorageKey,parseWorkspaceForSpace,type WorkspaceStorage,type WorkspaceDocument,type HouseSpace} from '../../../core/src/house/workspaces';
export class LocalWorkspaces implements WorkspaceStorage {
  private readonly key = 'studyvillage-workspaces-v1';
  private memory: Record<string,WorkspaceDocument> = {};
  constructor(private own: string) {}
  private all(): Record<string,WorkspaceDocument> {
    if (typeof localStorage === 'undefined') return this.memory;
    const raw = localStorage.getItem(this.key); return raw ? JSON.parse(raw) : {};
  }
  private scope(owner:string,space:HouseSpace):string { return spaceStorageKey(owner === this.own ? 'own' : owner, space); }
  get(owner:string,space:HouseSpace):WorkspaceDocument|null { const raw=this.all()[this.scope(owner,space)];return raw ? parseWorkspaceForSpace(space,raw) : null; }
  put(owner:string,space:HouseSpace,document:WorkspaceDocument):void {
    const all={...this.all(),[this.scope(owner,space)]:parseWorkspaceForSpace(space,document)};
    if(typeof localStorage!=='undefined')localStorage.setItem(this.key,JSON.stringify(all)); this.memory=all;
  }
  remove(owner:string,space:HouseSpace):void {const all={...this.all()};delete all[this.scope(owner,space)];if(typeof localStorage!=='undefined')localStorage.setItem(this.key,JSON.stringify(all));this.memory=all;}
}
