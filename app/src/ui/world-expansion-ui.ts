import {TetrisGame,type TetrisAction,type TetrisView} from '../../../packages/core/src/minigames/tetris';
import {TetrisPanel} from './tetris-ui';
import {browserKeyValue} from '../../../packages/runtime/src/storage/key-value';
import {ActivityStopControl} from './activity-stop-control';
import {SpriteTransfer} from '../assets/sprite-transfer';
import { msg, t, defaultText, setDisplayText, setDisplayAttribute, getLocale, formatDate, subscribeLanguage, type DisplayText } from '../i18n';
import { GameCameraDock } from './game-camera-ui';
import { StudyPanel } from './study-ui';
import { StudyQuiz, type QuizAction, type QuizView } from '../../../packages/core/src/minigames/study-quiz';
import { OllamaGarticBots } from '../../../packages/runtime/src/ai/gartic-bots';
import { SharedAi } from '../../../packages/runtime/src/ai/shared-ai';
import { desktopBridge } from '../../../packages/runtime/src/local-bridge/desktop';
import { LocalOllama } from '../../../packages/runtime/src/ai/local-ollama';
import { StudyLibrary } from '../../../packages/core/src/study/library';
import { OllamaSetupPanel } from './ollama-setup-ui';
import { errorMessage } from '../errors/messages';
import { GarticGame, type GarticAction, type GarticView } from '../../../packages/core/src/minigames/gartic-phone';
import { ACTIVITY_SCOPE, SharedRoom } from '../../../packages/runtime/src/session/shared-room';
import { hasRoomAccess } from '../house/workspaces';
import { WerewolvesGame, type WerewolvesAction, type WerewolvesView } from '../../../packages/core/src/minigames/werewolves';
import { GroupProjectsBoard, type ProjectsAction, type ProjectsView } from '../../../packages/core/src/projects/group-projects';
import { SecureNotesStore, type SecureNote } from '../../../packages/core/src/notes/secure-notes';
import type { AppActions, AppMessage, AppView } from '../../../packages/core/src/protocol/types';
import { GarticPanel } from './gartic-ui';
import { ProjectsPanel } from './projects-ui';
import { WerewolvesPanel } from './werewolves-ui';
import { WhiteboardRegistry } from '../whiteboard/registry';
import {
  DEFAULT_AREA_OBJECTS,
  WORLD_AREAS,
  type BuiltinAreaId,
} from '../world/areas';
import {
  EnvironmentController,
  TIME_OF_DAY_LABELS,
  WEATHER_LABELS,
  type ParticleQuality,
  type TimeOfDay,
  type WeatherKind,
} from '../world/environment';
import {
  InteractiveObjectRegistry,
  worldObjectHasAction,
  type InteractiveObjectConfig,
  type ObjectPermissionScope,
  type ObjectVisibilityScope,
} from '../world/interactive-objects';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  textContent: DisplayText = '',
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textContent) setDisplayText(element, textContent);
  return element;
}

function appendChildren<T extends HTMLElement>(parent: T, ...children: (Node | null | undefined)[]): T {
  for (const c of children) if (c) parent.append(c);
  return parent;
}

function btn(label: DisplayText, className = 'sv-button sv-button-small'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

export interface WorldExpansionCallbacks {
  getView(): AppView | null;
  getCurrentArea(): BuiltinAreaId;
  setCurrentArea(area: BuiltinAreaId): void;
  openBoardById(boardId: string, label: string): void;
  navigateToPane(pane: 'world' | 'house' | 'board' | 'contacts' | 'diagnostics'): void;
  notify(msg: string): void;
  speak(text:string,x:number,y:number):void;
  openFocus():void;
  openVoice():void;
  openMaterials():void;
  /** Scope of the place the player is in: '' for the village and lobbies, a room's own scope inside a room. */
  activityScope?(): string;
  requestStageRedraw(): void;
  /** A full-screen activity opened or closed: the stage must stop taking keys. */
  activityChanged(open: boolean): void;
  actions: Pick<AppActions, 'sendApp' | 'onApp' | 'setCameraActivity' | 'setGameCameraPolicy' | 'toggleGameCamera' | 'voiceCommand' | 'toggleMicrophone' | 'setMuted' | 'setDeafened' | 'setPushToTalk' | 'setTalking'>;
}

interface ScopedApps {
  library: StudyLibrary; notes: SecureNotesStore;
  studyRoom: SharedRoom<QuizAction, QuizView, StudyQuiz>; studyPanel: StudyPanel;
  projectsRoom: SharedRoom<ProjectsAction, ProjectsView, GroupProjectsBoard>; projectsPanel: ProjectsPanel;
}
type ActivityKind = 'tetris' | 'werewolves' | 'gartic' | 'notes' | 'projects' | 'study';
type ModalKind = ActivityKind | 'ollama_study' | 'object_inspector' | 'ollama_setup';

export class WorldExpansionUIController {
  readonly objectRegistry: InteractiveObjectRegistry;
  readonly environment: EnvironmentController;
  readonly boardRegistry: WhiteboardRegistry;
  readonly notesStore: SecureNotesStore;
  readonly ollamaGateway: LocalOllama;
  private sharedAi:SharedAi;
  private spriteTransfer:SpriteTransfer;
  readonly library: StudyLibrary;
  private ollamaSetup: OllamaSetupPanel;

  private callbacks: WorldExpansionCallbacks;
  private cameraDock: GameCameraDock;

  // Shared activities: one authority (the village host, or this device offline).
  readonly tetrisRoom:SharedRoom<TetrisAction,TetrisView,TetrisGame>;
  private tetrisPanel:TetrisPanel;
  readonly werewolvesRoom: SharedRoom<WerewolvesAction, WerewolvesView>;
  readonly garticRoom: SharedRoom<GarticAction, GarticView, GarticGame>;
  readonly studyRoom: SharedRoom<QuizAction, QuizView, StudyQuiz>;
  private studyPanel: StudyPanel;
  private garticBots: OllamaGarticBots;
  readonly projectsRoom: SharedRoom<ProjectsAction, ProjectsView, GroupProjectsBoard>;
  private werewolvesPanel: WerewolvesPanel;
  private garticPanel: GarticPanel;
  private projectsPanel: ProjectsPanel;
  private activityUnsubscribe: (() => void) | null = null;
  /** '' = the village-wide apps; a room scope (activityScope) opens that room's own copy of each app. */
  private scoped = new Map<string, ScopedApps>();

  // Stage bar & modals
  private stageToolbar!: HTMLElement;
  private todSelect!: HTMLSelectElement;
  private weatherSelect!: HTMLSelectElement;
  private autoCycleCheckbox!: HTMLInputElement;
  private ambientAudioCheckbox!: HTMLInputElement;
  private particleSelect!: HTMLSelectElement;

  // Modals
  private modalOverlay!: HTMLElement;
  private modalCard!: HTMLElement;
  private activityOverlay!: HTMLElement;
  private activeModalKind: ModalKind | null = null;
  private inspectedObjectId: string | null = null;

  constructor(callbacks: WorldExpansionCallbacks) {
    this.callbacks = callbacks;
    this.spriteTransfer=new SpriteTransfer(callbacks.actions,()=>this.callbacks.getView());
    this.cameraDock = new GameCameraDock(() => callbacks.actions.toggleGameCamera());
    this.objectRegistry = new InteractiveObjectRegistry(DEFAULT_AREA_OBJECTS);
    this.environment = new EnvironmentController();
    this.boardRegistry = new WhiteboardRegistry();
    this.notesStore = new SecureNotesStore('local-owner','',browserKeyValue);
    this.ollamaGateway = new LocalOllama(()=>{
      const view=this.callbacks.getView();
      return !!desktopBridge() && (!view || view.network.phase!=='JOINED' || (!view.network.server && view.network.isHost));
    });
    this.sharedAi=new SharedAi(callbacks.actions,()=>{
      const view=this.callbacks.getView();
      return {selfId:view?.identity.fingerprint||'local-host',hostId:view?.network.phase==='JOINED'?view.network.hostId:null,sessionId:view?.network.sessionId||null,authority:view?.network.phase!=='JOINED'||(!!view.network.isHost&&!view.network.server)};
    },this.ollamaGateway.provider(),status=>this.ollamaGateway.setRemote(status,(input,signal)=>this.sharedAi.generate(input,signal)));
    this.library = new StudyLibrary('',browserKeyValue);
    this.ollamaSetup = new OllamaSetupPanel(this.ollamaGateway, () => this.closeModal());
    const context = () => {
      const view = this.callbacks.getView();
      const joined = view?.network.phase === 'JOINED';
      return { selfId: view?.identity.fingerprint || 'local-host', hostId: joined ? view!.network.hostId : null, authority:!joined||(!view!.network.server&&view!.network.isHost) };
    };
    const me = () => { const a = this.getActor(); return { name: a.displayName, color: a.color }; };
    this.tetrisRoom=new SharedRoom('tetris',callbacks.actions,context,()=>new TetrisGame());
    this.tetrisPanel=new TetrisPanel({send:a=>this.tetrisRoom.act(a),close:()=>this.closeModal(),me:()=>({id:context().selfId,name:me().name}),cameras:ids=>callbacks.actions.setGameCameraPolicy?.({canSend:true,canReceive:true,audience:null,receiveAudience:ids}),media:battle=>{this.activityOverlay.dataset.tetrisMode=battle?'battle':'solo';if(!battle)callbacks.actions.setTalking(false);if(battle){this.cameraDock.mount(this.activityOverlay);callbacks.actions.setCameraActivity('tetris');}else{this.cameraDock.unmount();callbacks.actions.setGameCameraPolicy?.(null);callbacks.actions.setCameraActivity('village');const selected=callbacks.getView()?.network.voice?.selected;if(selected?.game==='tetris')callbacks.actions.voiceCommand({action:'leave'});}}});
    this.werewolvesRoom = new SharedRoom('werewolves', callbacks.actions, context, () => new WerewolvesGame(undefined, context().selfId));
    this.garticRoom = new SharedRoom('gartic', callbacks.actions, context, () => new GarticGame(undefined, context().selfId));
    this.garticBots = new OllamaGarticBots(this.ollamaGateway, this.garticRoom, m => callbacks.notify(m));
    // As village host, a guest inside a room may ask for that room's copy before I ever opened it here.
    callbacks.actions.onApp(message => this.adoptScope(message));
    const lobby = this.makeScopedApps('', this.library, this.notesStore);
    this.studyRoom = lobby.studyRoom; this.studyPanel = lobby.studyPanel; this.projectsRoom = lobby.projectsRoom; this.projectsPanel = lobby.projectsPanel;
    this.scoped.set('', lobby);
    this.werewolvesPanel = new WerewolvesPanel({ send: (a) => this.werewolvesRoom.act(a), close: () => this.closeModal(), me });
    this.garticPanel = new GarticPanel({ send: (a) => this.garticRoom.act(a), close: () => this.closeModal(), me, aiReady: () => this.ollamaGateway.isReady('gartic'), advanced: container => this.garticBotSettings(container) });
    this.ollamaGateway.subscribe(() => {
      if (!this.ollamaGateway.isReady('gartic')) this.garticBots.disable(); else if (this.garticRoom.canLead()) void this.garticBots.enable().catch(e => this.callbacks.notify(errorMessage(e)));
      this.callbacks.requestStageRedraw();
    });
    void this.ollamaGateway.restore();
  }

  private roomContext() {
    const view = this.callbacks.getView();
    const joined = view?.network.phase === 'JOINED';
    return { selfId: view?.identity.fingerprint || 'local-host', hostId: joined ? view!.network.hostId : null, authority:!joined||(!view!.network.server&&view!.network.isHost) };
  }

  /** Projects, flashcards, quizzes and notes of one scope. Each room gets its own, created on first use. */
  private makeScopedApps(scope: string, library?: StudyLibrary, notes?: SecureNotesStore): ScopedApps {
    // On this device my own rooms are saved under «own», like my own boards, so they survive an identity change.
    const self = this.callbacks.getView()?.identity.fingerprint;
    const stored = self && scope.startsWith(`room:${self}:`) ? `room:own:${scope.slice(`room:${self}:`.length)}` : scope;
    library ??= new StudyLibrary(stored,browserKeyValue); notes ??= new SecureNotesStore('local-owner',stored,browserKeyValue);
    const context = () => this.roomContext();
    const studyRoom = new SharedRoom<QuizAction, QuizView, StudyQuiz>('study', this.callbacks.actions, context, () => new StudyQuiz(context().selfId), scope);
    const projectsRoom = new SharedRoom<ProjectsAction, ProjectsView, GroupProjectsBoard>('projects', this.callbacks.actions, context, () => new GroupProjectsBoard(true,stored,browserKeyValue), scope);
    const studyPanel = new StudyPanel({ actor: () => this.getActor(), close: () => this.closeModal(), notify: m => this.callbacks.notify(m), library, ai: this.ollamaGateway, notes, room: studyRoom });
    const projectsPanel = new ProjectsPanel({
      send: (a) => projectsRoom.act(a),
      close: () => this.closeModal(),
      notify: (m) => this.callbacks.notify(m),
      me: () => {
        const a = this.getActor();
        const v = this.callbacks.getView();
        return { id: a.id, name: a.displayName, color: a.color, online: v?.network.phase === 'JOINED', isHost: !!v?.network.isHost };
      },
    });
    return { library, notes, studyRoom, studyPanel, projectsRoom, projectsPanel };
  }

  private adoptScope(message: AppMessage): void {
    if (message.channel !== 'projects' && message.channel !== 'study') return;
    let scope: unknown;
    try { scope = (JSON.parse(message.data) as { s?: unknown }).s; } catch { return; }
    if (typeof scope !== 'string' || !ACTIVITY_SCOPE.test(scope) || this.scoped.has(scope)) return;
    const { selfId, hostId, authority } = this.roomContext();
    if (!authority) return; // only the authority keeps copies for others
    const [, owner, floorId, roomId] = scope.split(':');
    const house = this.callbacks.getView()?.network.houses.find(h => h.ownerId === owner);
    if (message.from !== owner && !(house && hasRoomAccess(house, { floorId, roomId }, message.from))) return;
    // The new copy subscribes to onApp now; listeners live in a Set, so it still receives this same message.
    this.scoped.set(scope, this.makeScopedApps(scope));
  }

  private apps(): ScopedApps {
    const scope = this.callbacks.activityScope?.() ?? '';
    let apps = this.scoped.get(scope);
    if (!apps) { apps = this.makeScopedApps(scope); this.scoped.set(scope, apps); }
    return apps;
  }

  /** Called on every view change so activities follow the session (online, offline, new host). */
  syncSession(): void {
    this.sharedAi.sync();this.spriteTransfer.sync();
    this.tetrisRoom.sync();
    this.werewolvesRoom.sync();
    this.garticRoom.sync();
    for (const apps of this.scoped.values()) apps.studyRoom.sync();
    if (this.garticRoom.canLead() && this.ollamaGateway.isReady('gartic') && !this.garticBots.ready()) void this.garticBots.enable();
    const view = this.callbacks.getView();
    if (!view) return;
    const cameraGame=this.werewolvesRoom.current();if(cameraGame&&this.activityOverlay.dataset.kind==='werewolves')this.callbacks.actions.setGameCameraPolicy?.({canSend:cameraGame.canBroadcastCamera,canReceive:cameraGame.canSeeCameras,audience:cameraGame.cameraAudience,epoch:cameraGame.cameraPhase});
    this.cameraDock.policy(this.activityOverlay.dataset.kind==='werewolves'?cameraGame:null);this.cameraDock.update(view);
    // «Working now» only means something for people who are actually here.
    const present = new Set(view.network.members.filter((m) => m.connected).map((m) => m.identity.fingerprint));
    present.add(view.identity.fingerprint);
    for (const apps of this.scoped.values()) {
      apps.projectsRoom.mutate((board) => board.prune(present));
      apps.studyRoom.mutate(engine => engine.prune(present));
    }
  }

  isModalOpen(): boolean { return this.activeModalKind !== null; }

  openActivity(kind: ActivityKind): void { this.openModal(kind); }

  private getActor(): { id: string; displayName: string; color: string; isHost: boolean; online: boolean } {
    const v = this.callbacks.getView();
    if (!v) {
      return { id: 'local-host', displayName: 'Explorador', color: '#df8a72', isHost: true, online: false };
    }
    const isOnline = v.network.phase === 'JOINED';
    return {
      id: v.identity.fingerprint || 'local-host',
      displayName: v.identity.displayName || 'Explorador',
      color: v.identity.color || '#df8a72',
      isHost: !isOnline || v.network.isHost, online: isOnline,
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Environment settings and station dialogs
  // ---------------------------------------------------------------------------

  mountStageControls(settings: HTMLElement, shell: HTMLElement): void {
    this.stageToolbar = el('div', 'sv-world-expansion-bar');
    this.stageToolbar.dataset.testid = 'world-expansion-bar';

    // Row 2: Environment Controls (Day/Night + Weather + Audio + Particles)
    const envRow = el('div', 'sv-expansion-row sv-env-row');
    const envLabel = el('span', 'sv-field-label', msg('Ambiente:'));

    this.todSelect = el('select', 'sv-select');
    setDisplayAttribute(this.todSelect, 'aria-label', msg('Hora del día'));
    this.todSelect.dataset.testid = 'env-time-select';
    for (const [tod, label] of Object.entries(TIME_OF_DAY_LABELS) as [TimeOfDay, string][]) {
      const opt = el('option', '', msg(label));
      opt.value = tod; opt.dataset.label = label;
      this.todSelect.append(opt);
    }
    this.todSelect.value = this.environment.getState().timeOfDay;
    this.todSelect.addEventListener('change', () => {
      this.environment.update({
        timeOfDay: this.todSelect.value as TimeOfDay,
        cycleMode: 'manual',
      });
      this.autoCycleCheckbox.checked = false;
      this.callbacks.requestStageRedraw();
    });

    this.weatherSelect = el('select', 'sv-select');
    setDisplayAttribute(this.weatherSelect, 'aria-label', msg('Clima del vecindario'));
    this.weatherSelect.dataset.testid = 'env-weather-select';
    for (const [w, label] of Object.entries(WEATHER_LABELS) as [WeatherKind, string][]) {
      const opt = el('option', '', msg(label));
      opt.value = w; opt.dataset.label = label;
      this.weatherSelect.append(opt);
    }
    this.weatherSelect.value = this.environment.getState().weather;
    this.weatherSelect.addEventListener('change', () => {
      this.environment.update({ weather: this.weatherSelect.value as WeatherKind });
      this.callbacks.requestStageRedraw();
    });

    const autoWrap = el('label', 'sv-env-toggle');
    this.autoCycleCheckbox = el('input');
    this.autoCycleCheckbox.type = 'checkbox';
    this.autoCycleCheckbox.checked = this.environment.getState().cycleMode === 'auto';
    this.autoCycleCheckbox.addEventListener('change', () => {
      this.environment.update({ cycleMode: this.autoCycleCheckbox.checked ? 'auto' : 'manual' });
      this.callbacks.requestStageRedraw();
    });
    appendChildren(autoWrap, this.autoCycleCheckbox, el('span', '', msg('Ciclo solar')));

    const audioWrap = el('label', 'sv-env-toggle');
    this.ambientAudioCheckbox = el('input');
    this.ambientAudioCheckbox.type = 'checkbox';
    this.ambientAudioCheckbox.checked = this.environment.getState().ambientAudioEnabled;
    this.ambientAudioCheckbox.addEventListener('change', () => {
      this.environment.update({ ambientAudioEnabled: this.ambientAudioCheckbox.checked });
    });
    appendChildren(audioWrap, this.ambientAudioCheckbox, el('span', '', msg('🔊 Sonido')));

    this.particleSelect = el('select', 'sv-select');
    setDisplayAttribute(this.particleSelect, 'aria-label', msg('Densidad de partículas'));
    for (const [val, label] of [
      ['medium', msg('Partículas: Media')],
      ['high', msg('Partículas: Alta')],
      ['low', msg('Partículas: Baja')],
      ['off', msg('Partículas: Off')],
    ] as const) {
      const opt = el('option', '', label);
      opt.value = val;
      this.particleSelect.append(opt);
    }
    this.particleSelect.value = this.environment.getState().particleQuality;
    this.particleSelect.addEventListener('change', () => {
      this.environment.update({ particleQuality: this.particleSelect.value as ParticleQuality });
      this.callbacks.requestStageRedraw();
    });

    const sound = el('select', 'sv-select');
    setDisplayAttribute(sound, 'aria-label', msg('Sonido de fondo'));
    for (const [value, label] of [['weather', msg('Según el clima')], ['rain', msg('Lluvia')], ['wind', msg('Viento')], ['brown_noise', msg('Ruido marrón')]]) {
      const option = el('option', '', label); option.value = String(value); sound.append(option);
    }
    sound.value = this.environment.getState().ambientSound;
    sound.addEventListener('change', () => this.environment.update({ ambientSound: sound.value as 'weather' | 'rain' | 'wind' | 'brown_noise' }));
    const volume = el('input', 'sv-input');
    volume.type = 'range'; volume.min = '0'; volume.max = '1'; volume.step = '0.05';
    volume.value = String(this.environment.getState().ambientVolume);
    setDisplayAttribute(volume, 'aria-label', msg('Volumen del ambiente'));
    volume.addEventListener('input', () => this.environment.update({ ambientVolume: Number(volume.value) }));
    const soundLabel = el('label', 'sv-stack', msg('Sonido de fondo')); soundLabel.append(sound);
    const volumeLabel = el('label', 'sv-stack', msg('Volumen del ambiente')); volumeLabel.append(volume);
    envRow.append(el('h3', '', msg('Ambiente')), soundLabel, volumeLabel);

    const visualChoice = (title: string, control: HTMLSelectElement) => {
      const group = el('section', 'sv-env-group'); group.append(el('h3', '', msg(title)));
      const choices = el('div', 'sv-env-choice'); choices.setAttribute('role', 'group'); setDisplayAttribute(choices, 'aria-label', msg(title));
      const refresh = () => { for (const b of choices.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.value === control.value)); };
      for (const option of control.options) { const b = btn(option.dataset.label ? msg(option.dataset.label) : option.textContent || ''); b.dataset.value = option.value; b.onclick = () => { control.value = option.value; control.dispatchEvent(new Event('change')); refresh(); }; choices.append(b); }
      control.addEventListener('change', refresh); refresh();
      // Retain a labelled native control for assistive technologies and keyboard selection.
      control.classList.add('sv-visually-hidden'); group.append(choices, control); return group;
    };
    appendChildren(envRow, visualChoice('Luz del día', this.todSelect), visualChoice('Clima', this.weatherSelect), autoWrap, audioWrap);
    const advanced = el('details'); advanced.append(el('summary', '', msg('Rendimiento y partículas')), this.particleSelect); envRow.append(advanced);

    appendChildren(this.stageToolbar, envRow);
    settings.append(this.stageToolbar);

    // Universal Modal Overlay
    this.modalOverlay = el('div', 'sv-lock-overlay sv-ai-modal-overlay');
    this.modalOverlay.hidden = true;
    this.modalOverlay.dataset.testid = 'expansion-modal-overlay';
    this.modalCard = el('section', 'sv-card sv-ai-modal-card sv-expansion-modal-card');
    this.modalCard.setAttribute('role', 'dialog');
    this.modalCard.setAttribute('aria-modal', 'true');
    this.modalOverlay.append(this.modalCard);
    // Games, notes and projects take the whole window, like opening an app.
    this.activityOverlay = el('div', 'sv-activity');
    this.activityOverlay.hidden = true;
    this.activityOverlay.setAttribute('role', 'dialog');
    this.activityOverlay.setAttribute('aria-modal', 'true');
    this.activityOverlay.dataset.testid = 'expansion-modal-overlay';
    this.modalOverlay.dataset.testid = 'expansion-card-overlay';
    shell.append(this.modalOverlay, this.activityOverlay);

    this.refreshStageControls();
  }

  refreshStageControls(): void {
    const envState = this.environment.getState();
    if (this.todSelect && document.activeElement !== this.todSelect) {
      this.todSelect.value = envState.timeOfDay;
    }
    if (this.weatherSelect && document.activeElement !== this.weatherSelect) {
      this.weatherSelect.value = envState.weather;
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Interactive Station Triggering & Object Inspector (Part 3)
  // ---------------------------------------------------------------------------

  interactWithWorldObject(obj: InteractiveObjectConfig): void {
    if (!worldObjectHasAction(obj.kind)) return;
    const actor = this.getActor();
    if (!this.objectRegistry.canUse(obj, actor.id, actor.isHost)) {
      this.callbacks.notify(t("🔒 No tienes permiso para usar «{p0}».", { p0: obj.displayName }));
      return;
    }

    switch (obj.kind) {
      case 'guide': this.callbacks.speak(t(obj.description),obj.x+obj.w/2,obj.y);break;
      case 'campfire_werewolves':
        this.openModal('werewolves');
        break;
      case 'arcade_tetris':this.openModal('tetris');break;
      case 'drawing_table_gartic':
        this.openModal('gartic');
        break;
      case 'whiteboard':
        this.callbacks.openBoardById(obj.linkedBoardId || `board:${obj.id}`, obj.displayName);
        break;
      case 'computer_project':
        this.openModal('projects');
        break;
      case 'bookshelf_notes': this.callbacks.openMaterials(); break;
      case 'study_desk': this.callbacks.openFocus(); break;
      case 'flashcard_podium':
        this.openModal('study');
        break;
      case 'ai_tutor_console':
        this.openModal('ollama_setup');
        break;
      case 'voice_table':
        this.callbacks.openVoice();
        break;
    }
  }

  openObjectInspector(objectId: string): void {
    this.inspectedObjectId = objectId;
    this.openModal('object_inspector');
  }

  openModal(kind: ModalKind): void {
    this.closeModal();
    this.activeModalKind = kind;
    this.callbacks.activityChanged(true);
    if (kind === 'tetris' || kind === 'werewolves' || kind === 'gartic' || kind === 'notes' || kind === 'projects' || kind === 'ollama_study' || kind === 'study' || kind === 'ollama_setup') {
      this.activityOverlay.hidden = false;
      this.activityOverlay.dataset.kind = kind;
      if (kind === 'ollama_setup') { this.ollamaSetup.mount(this.activityOverlay); return; }
      const apps = this.apps();
      if (kind === 'ollama_study' || kind === 'study' || kind === 'notes') { apps.studyPanel.mount(this.activityOverlay); return; }
      const [room, panel] = kind === 'tetris'?[this.tetrisRoom,this.tetrisPanel] as const:kind === 'werewolves'
        ? [this.werewolvesRoom, this.werewolvesPanel] as const
        : kind === 'gartic' ? [this.garticRoom, this.garticPanel] as const : [apps.projectsRoom, apps.projectsPanel] as const;
      panel.mount(this.activityOverlay);
      const stopControl=kind==='tetris'||kind==='werewolves'||kind==='gartic'?new ActivityStopControl(this.activityOverlay,()=>{if(!room.canStop())return;if(kind==='gartic')this.garticBots.cancel();room.stop();}):null;
      // Each room/panel pair shares one view type; TypeScript cannot see that through the union.
      const offView = (room as SharedRoom<unknown, unknown>).subscribe((view, error) => { (panel as { update(v: unknown, e: string | null): void }).update(view, error);stopControl?.update((view as {phase?:string}|null)?.phase,room.canStop());if(kind==='werewolves'){const game=this.werewolvesRoom.current();if(game)this.callbacks.actions.setGameCameraPolicy?.({canSend:game.canBroadcastCamera,canReceive:game.canSeeCameras,audience:game.cameraAudience,epoch:game.cameraPhase});this.cameraDock.policy(game);const current=this.callbacks.getView();if(current)this.cameraDock.update(current);} });
      // A language change redraws the open game in place; the round, drafts and drawings stay.
      const offLanguage = subscribeLanguage(() => (panel as { update(v: unknown, e: string | null): void }).update((room as SharedRoom<unknown, unknown>).current(), null));
      this.activityUnsubscribe = () => { offView(); offLanguage(); stopControl?.dispose(); };
      room.refresh();
      if (kind === 'tetris' || kind === 'werewolves' || kind === 'gartic') {
        const joinVoice = document.createElement('button'); joinVoice.className = 'sv-button sv-button-small sv-game-voice';
        setDisplayText(joinVoice, msg('Unirse a la voz del juego'));
        let inVoice=false;joinVoice.onclick = () => { this.callbacks.actions.voiceCommand(inVoice?{action:'leave'}:{ action: 'game', game: kind });inVoice=!inVoice;setDisplayText(joinVoice,msg(inVoice?'Salir de la voz del juego':'Unirse a la voz del juego')); };
        this.activityOverlay.append(joinVoice);
        if(kind==='tetris'){const controls=el('div','sv-tetris-voice');for(const [label,run]of [['Micrófono',()=>{void this.callbacks.actions.toggleMicrophone().catch(e=>this.callbacks.notify(String(e)));}],['Silenciar',()=>this.callbacks.actions.setMuted(!this.callbacks.getView()?.network.media.muted)],['Dejar de escuchar',()=>this.callbacks.actions.setDeafened(!this.callbacks.getView()?.network.media.deafened)]] as const){const b=document.createElement('button');b.className='sv-button';setDisplayText(b,msg(label));b.onclick=run;controls.append(b);}const ptt=document.createElement('button');ptt.className='sv-button';setDisplayText(ptt,msg('Pulsar para hablar'));ptt.onpointerdown=e=>{ptt.setPointerCapture(e.pointerId);this.callbacks.actions.setPushToTalk(true);this.callbacks.actions.setTalking(true);};ptt.onpointerup=ptt.onpointercancel=()=>this.callbacks.actions.setTalking(false);controls.append(ptt);this.activityOverlay.append(controls);}
        if(kind!=='tetris'){this.cameraDock.mount(this.activityOverlay);this.callbacks.actions.setCameraActivity(kind);}
        const current = this.callbacks.getView(); if (current) this.cameraDock.update(current);
      }
      return;
    }
    this.modalOverlay.hidden = false;
    this.renderActiveModal();
  }

  closeModal(): void {
    const wasOpen = this.activeModalKind !== null;
    this.cameraDock.unmount();
    this.callbacks.actions.setCameraActivity('village');
    this.activityUnsubscribe?.();
    this.activityUnsubscribe = null;
    this.tetrisPanel.unmount();
    this.werewolvesPanel.unmount();
    this.garticPanel.unmount();
    this.ollamaSetup.unmount();
    for (const apps of this.scoped.values()) { apps.projectsPanel.unmount(); apps.studyPanel.unmount(); }
    this.activeModalKind = null;
    this.modalOverlay.hidden = true;
    this.activityOverlay.hidden = true;
    this.activityOverlay.querySelectorAll('.sv-game-voice,.sv-tetris-voice').forEach(el=>el.remove());
    this.modalCard.replaceChildren();
    if (wasOpen) this.callbacks.activityChanged(false);
  }

  private renderModalHeader(eyebrowText: DisplayText, titleText: DisplayText, inspectableObjectId?: string): HTMLElement {
    const head = el('div', 'sv-ai-modal-head');
    const titleWrap = el('div');
    appendChildren(titleWrap, el('div', 'sv-eyebrow', eyebrowText), el('h2', '', titleText));

    const actions = el('div', 'sv-inline');
    if (inspectableObjectId) {
      const cfgBtn = btn(msg('⚙️ Personalizar Objeto / Sprite'), 'sv-button sv-button-small');
      cfgBtn.addEventListener('click', () => this.openObjectInspector(inspectableObjectId));
      actions.append(cfgBtn);
    }
    const closeB = btn(msg('Cerrar ×'), 'sv-button sv-button-small');
    closeB.dataset.testid = 'expansion-modal-close';
    closeB.addEventListener('click', () => this.closeModal());
    actions.append(closeB);
    appendChildren(head, titleWrap, actions);
    return head;
  }

  private renderActiveModal(): void {
    this.modalCard.replaceChildren();
    if (this.activeModalKind === 'ollama_study') this.renderOllamaAndStudyModal();
    else if (this.activeModalKind === 'object_inspector') this.renderObjectInspectorModal();
  }

  // ---------------------------------------------------------------------------
  // 3. Object Inspector & Sprite Customizer Modal (Part 3)
  // ---------------------------------------------------------------------------

  private renderObjectInspectorModal(): void {
    const obj = this.inspectedObjectId ? this.objectRegistry.get(this.inspectedObjectId) : null;
    if (!obj) {
      this.closeModal();
      return;
    }
    const actor = this.getActor();
    const canEdit = this.objectRegistry.canConfigure(obj, actor.id, actor.isHost);

    const head = this.renderModalHeader(
      msg('SISTEMA DE OBJETOS INTERACTIVOS · SPRITES Y PERMISOS'),
      msg('Configurar: {name}', { name: defaultText(obj.displayName) }),
    );

    const desc = el('p', 'sv-subtle', obj.description);

    const form = el('div', 'sv-stack');
    const nameInput = el('input', 'sv-input');
    nameInput.value = obj.displayName;
    nameInput.maxLength = 48;
    nameInput.disabled = !canEdit;

    const colorInput = el('input', 'sv-color-input');
    colorInput.type = 'color';
    colorInput.value = obj.customColor || '#9c7349';
    colorInput.disabled = !canEdit;

    const visSelect = el('select', 'sv-select');
    for (const [v, l] of [
      ['everyone', msg('Visible para toda la aldea')],
      ['participants', msg('Solo participantes conectados')],
      ['owner_only', msg('Solo propietario / anfitrión')],
    ] as [ObjectVisibilityScope, DisplayText][]) {
      const o = el('option', '', l);
      o.value = v;
      visSelect.append(o);
    }
    visSelect.value = obj.visibility;
    visSelect.disabled = !canEdit;

    const usePermSelect = el('select', 'sv-select');
    for (const [v, l] of [
      ['public', msg('Uso: Cualquier persona')],
      ['participants', msg('Uso: Miembros de la sesión')],
      ['host_only', msg('Uso: Solo anfitrión')],
      ['owner_only', msg('Uso: Solo propietario')],
    ] as [ObjectPermissionScope, DisplayText][]) {
      const o = el('option', '', l);
      o.value = v;
      usePermSelect.append(o);
    }
    usePermSelect.value = obj.usePermission;
    usePermSelect.disabled = !canEdit;

    const spriteRow = el('div', 'sv-inline');
    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/webp,image/jpeg';
    fileInput.hidden = true;
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > 512 * 1024) {
        this.callbacks.notify(t('El sprite supera 512 KB.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          try {
            this.objectRegistry.assignCustomSprite(obj.id, reader.result, colorInput.value, actor.id, actor.isHost);
            this.callbacks.requestStageRedraw();
            this.callbacks.notify(t("Sprite PNG aplicado a «{p0}».", { p0: obj.displayName }));
            this.renderActiveModal();
          } catch (e) {
            this.callbacks.notify(errorMessage(e));
          }
        }
      };
      reader.readAsDataURL(file);
    });

    const uploadBtn = btn(msg('📁 Subir Sprite PNG/WebP'));
    uploadBtn.disabled = !canEdit;
    uploadBtn.addEventListener('click', () => fileInput.click());

    const aiSpriteBtn = btn(msg('✨ Generar Sprite Pixel-Art IA'), 'sv-button sv-button-small sv-button-primary');
    aiSpriteBtn.disabled = !canEdit;
    aiSpriteBtn.hidden = !this.ollamaGateway.isReady('sprites');
    aiSpriteBtn.addEventListener('click', () => {
      void this.ollamaGateway.sprite('table', nameInput.value || obj.defaultLabel).then(
        ({ dataUrl }) => {
          this.objectRegistry.assignCustomSprite(obj.id, dataUrl, colorInput.value, actor.id, actor.isHost);
          this.callbacks.requestStageRedraw();
          this.callbacks.notify(t("Sprite Pixel-Art generado para «{p0}».", { p0: obj.displayName }));
          this.renderActiveModal();
        },
      ).catch(e => this.callbacks.notify(errorMessage(e)));
    });

    const resetSpriteBtn = btn(msg('Restaurar sprite original'));
    resetSpriteBtn.disabled = !canEdit;
    resetSpriteBtn.addEventListener('click', () => {
      this.objectRegistry.assignCustomSprite(obj.id, null, null, actor.id, actor.isHost);
      this.callbacks.requestStageRedraw();
      this.renderActiveModal();
    });

    appendChildren(spriteRow, uploadBtn, aiSpriteBtn, resetSpriteBtn, fileInput);

    const saveBtn = btn(msg('Guardar cambios del objeto'), 'sv-button sv-button-primary');
    saveBtn.disabled = !canEdit;
    saveBtn.addEventListener('click', () => {
      try {
        this.objectRegistry.renameObject(obj.id, nameInput.value, actor.id, actor.isHost);
        this.objectRegistry.assignCustomSprite(
          obj.id,
          obj.customSpriteDataUrl,
          colorInput.value,
          actor.id,
          actor.isHost,
        );
        this.objectRegistry.updatePermissions(
          obj.id,
          {
            visibility: visSelect.value as ObjectVisibilityScope,
            usePermission: usePermSelect.value as ObjectPermissionScope,
          },
          actor.id,
          actor.isHost,
        );
        this.callbacks.requestStageRedraw();
        this.callbacks.notify(t("Objeto «{p0}» actualizado.", { p0: nameInput.value }));
        this.closeModal();
      } catch (err) {
        this.callbacks.notify(errorMessage(err));
      }
    });

    appendChildren(
      form,
      el('span', 'sv-field-label', msg('Nombre visible sobre el objeto')),
      nameInput,
      el('span', 'sv-field-label', msg('Color base y Sprite personalizado')),
      colorInput,
      spriteRow,
      el('span', 'sv-field-label', msg('Visibilidad y permisos de interacción')),
      visSelect,
      usePermSelect,
      saveBtn,
    );

    appendChildren(this.modalCard, head, desc, form);
  }

  // ---------------------------------------------------------------------------
  // 8. Optional Local Ollama Gateway, Flashcards & Multiplayer Study Session (Part 10)
  // ---------------------------------------------------------------------------

  private renderOllamaAndStudyModal(): void { /* StudyPanel owns its own view. */ }

  private garticBotSettings(container: HTMLElement): void {
    if (!this.garticRoom.canLead() || !this.ollamaGateway.isReady('gartic')) return;
    const check = btn(msg('Preparar bots'));
    check.onclick = () => { check.disabled = true; void this.garticBots.enable().then(() => { setDisplayText(check, msg('Bots listos')); }).catch(e => { this.callbacks.notify(errorMessage(e)); }).finally(() => { check.disabled = false; }); };
    container.append(check);
  }

  dispose(): void {
    this.closeModal(); this.garticBots.dispose(); this.tetrisRoom.dispose();this.werewolvesRoom.dispose(); this.garticRoom.dispose(); for (const apps of this.scoped.values()) { apps.studyRoom.dispose(); apps.projectsRoom.dispose(); } this.environment.dispose(); this.sharedAi.dispose(); this.spriteTransfer.dispose(); this.ollamaGateway.dispose();
  }
}
