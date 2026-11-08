import {PetCollectionPanel} from '../pets/collection-ui';
import {loadPetCollection} from '../assets/pet-custom';
import type {OwnedPet} from '../../../packages/core/src/pets/definitions';
import type {PetHome,PetConfig} from '../../../packages/core/src/pets/model';
import {folderAppearance} from './folder-appearance';
import {interactionGlyph} from '../input/actions';
import {PARCELS} from '../world/model';
import {PetWorld} from '../pets/world';
import {petSpecies,newPetConfig,petCount,ownerPetGroups,assertPetLimit} from '../../../packages/core/src/pets/model';
import {LocalWorkspaces as PetWorkspaces} from '../../../packages/runtime/src/storage/workspaces';
import {GamepadController} from '../input/gamepad';
import {mediaWindow} from '../input/media-window';
import {confirmSprite,editGuideText} from './sprite-dialogs';
import {FURNITURE_DESCRIPTIONS} from '../house/model';
import {PencilTouchGuard,pointerSamples} from '../../../packages/documents/src/pen';
import {loadPhoneLayout} from '../../../packages/runtime/src/storage/phone-layout';
import {type PhoneAppId} from '../../../packages/core/src/phone/layout';
import {PhoneLayoutEditor} from './phone-layout-editor';
import {boardFontGeneration} from '../whiteboard/fonts';
import {installDrawingSurface} from '../input/drawing-surface';
import {layoutViewport} from '../input/browser-viewport';
import {detectPencil,getPencilMode,setPencilMode,subscribePencilMode} from '../input/pencil-mode';
import {loadEraserPreferences,saveEraserPreferences} from '../../../packages/runtime/src/storage/eraser-preferences';
import { ConnectionPanel } from './connection-ui';
import { VanityPanel } from './vanity-ui';
import { NpcSpeech } from './npc-speech';
import { MailboxUI } from './mailbox-ui';
import {gardenItemRect,resolveGardenItem} from '../../../packages/core/src/world/garden';
import {INTERACTION_REACH} from '../world/interactions';
import { GardenPanel } from './garden-ui';
import { backupControls } from './backup-ui';
import { identityTransferControls } from './identity-transfer-ui';
import { StudyJukebox } from './jukebox';
import { FocusClock } from './focus-clock';
import { HeadCameras } from './head-cameras';
import { NotebookPanel } from '../notebooks/panel';
import { hasHouseAccess, isFloorDecoration } from '../house/workspaces';
import { MobileHudEditor } from './hud-editor';
import { PORTRAIT_ZOOM, clampZoom, loadPortraitZoom, portraitView, savePortraitZoom } from '../input/portrait-camera';
import { activityScope } from '../../../packages/core/src/minigames/room';
import { inlineSpriteGeneration } from '../house/sprites';
import { HouseSpacesPanel, RoomWorkspacePanel, type SpacePanelContext } from './workspace-ui';
import { sameSpace, spaceKey, scopedBoard, workspaceTitle, workspaceSchema, type HouseSpace } from '../house/workspaces';
import { spacePortals, nearestSpacePortal } from '../house/space-draw';
import { lampObstacles } from '../world/lights';
import { VoicePanel } from './voice-ui';
import { BoardEditor } from './board-editor';
import { EraserGesture } from '../../../packages/core/src/whiteboard/eraser';
import { ServersPanel } from './servers-ui';
import { msg, t, defaultText, defaultMsg, setDisplayText, setDisplayAttribute, getLanguage, setLanguage, subscribeLanguage, type DisplayText, type Language } from '../i18n';
import './board-editor.css';
import { WardrobePanel } from './wardrobe-ui';
import { DecorationHistory, placementError } from '../house/decoration';
import { isInScene } from '../world/location';
import './style.css';
import './game.css';
import './theme.css';
import './study.css';
import './workspace.css';
import './village-polish.css';
import './furniture-actions.css';
import { DoubleTap, loadControls, saveControls, touchEnabled, type ControlPreferences } from '../input/gestures';
import {
  LIMITS, type AppActions, type AppView, type BoardPoint, type BoardStroke,
  type Furniture, type FurnitureKind, type Position, type PublicHouse,
} from '../../../packages/core/src/protocol/types';
import {
  getAvatarCustomization, getFurnitureCustomColor,
  setFurnitureCustomColor,
  setFurnitureCustomSprite,
} from '../assets/custom-assets';
import { insertAtSelection } from '../editor/snippets';
import { errorMessage } from '../errors/messages';
import {
  atHouseDoor, closestFurniture, furnitureRect, HOUSE_BOUNDS, HOUSE_DOOR, houseObstacles,
  FURNITURE_ACTION_LABELS, FURNITURE_KINDS, FURNITURE_LABELS, FURNITURE_PROMPT_LABELS,
  HOUSE_SPAWN, addFurniture, deleteFurniture,
  hitFurniture, hitInteractiveFurniture, isInteractiveFurniture, moveFurniture, setFurnitureAlias, stepHousePosition,
} from '../house/model';
import { drawHouseInterior, drawFurniturePreview } from '../house/draw';
import {
  BOARD_COLORS, DEFAULT_CAMERA, boardAtCapacity, clampBoardPoint, fitCamera, makeStroke, newestOwnStroke,
  nextSequence, panBy, screenToWorld, strokeHit, strokesBounds, visibleStrokes, zoomAt,
  type BoardCamera, type BoardUiTool,
} from '../../../packages/core/src/whiteboard/model';
import { drawBoard, renderBoardForExport, textBox, textFontPx } from '../whiteboard/draw';
import { getMathGeneration } from '../whiteboard/math';
import { WORLD_SPAWN, closestDoor, findPath, occupiedParcels, pointInRect, stepPosition, worldObstacles } from '../world/model';
import { advanceAnim, drawPrompt, reducedMotion } from './art';
import { drawWorld, type DrawPerson } from '../world/draw';
import {
  WORLD_AREAS, closestPortal, drawCommunityPlaza, drawStudyLibrary, type BuiltinAreaId,
} from '../world/areas';
import {
  houseBoardId, type BoardAccessLevel,
} from '../../../packages/core/src/whiteboard/boards-registry';
import { WorldExpansionUIController } from './world-expansion-ui';
import { monoIcon } from './pixel-icons';

type Pane = 'world' | 'house' | 'board' | 'contacts' | 'diagnostics';
type PhonePage = 'home' | 'folder' | 'village' | 'voice' | 'decorate' | 'contacts';
/** Where to walk to use something, and how to use it once there. */
type Interaction = { x: number; y: number; near(): boolean; run(): void };
type DiagnosticKind = Parameters<AppActions['runDiagnostic']>[0];
type MediaMount = { dispose?:()=>void; wrapper: HTMLElement; element: HTMLMediaElement; stream: MediaStream; kind: 'audio' | 'screen' };

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', label: DisplayText = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (label) setDisplayText(element, label);
  return element;
}

function append<T extends HTMLElement>(parent: T, ...children: (Node | null | undefined)[]): T {
  for (const child of children) if (child) parent.append(child);
  return parent;
}

function button(label: DisplayText, className = 'sv-button'): HTMLButtonElement {
  const element = node('button', className, label);
  element.type = 'button';
  return element;
}

function field(labelText: DisplayText, control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): HTMLLabelElement {
  const label = node('label', 'sv-field');
  append(label, node('span', 'sv-field-label', labelText), control);
  return label;
}

function select(options: readonly { value: string; label: DisplayText }[]): HTMLSelectElement {
  const element = node('select', 'sv-select');
  for (const item of options) {
    const option = node('option');
    option.value = item.value;
    setDisplayText(option, item.label);
    element.append(option);
  }
  return element;
}

/** Always on the board toolbar; everything else lives under «Más». */
const MAIN_BOARD_TOOLS: readonly BoardUiTool[] = ['pen', 'text', 'eraser', 'hand', 'select'];

function setText(element: HTMLElement, value: DisplayText): void {
  if (typeof value === 'string' && element.textContent === value) return;
  setDisplayText(element, value);
}

function setInput(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  if (document.activeElement !== element && element.value !== value) element.value = value;
}

function show(element: HTMLElement, visible: boolean): void { element.hidden = !visible; }

const PHASE_LABEL: Record<AppView['network']['phase'], DisplayText> = {
  IDLE: msg('Sin sesión'), SIGNALING: msg('Preparando conexión'), CONNECTING: msg('Conectando'),
  AUTHENTICATING: msg('Verificando identidad'), PENDING_APPROVAL: msg('Esperando aprobación'),
  JOINED: msg('En la aldea'), RECONNECTING: msg('Reconectando'), DENIED: msg('Acceso denegado'),
  EXPIRED_INVITE: msg('Invitación caducada'), NETWORK_FAILED: msg('Sin conexión'),
  KICKED: msg('Has salido de la sesión'), CLOSED: msg('Sesión cerrada'),
};

const SCREEN_LABEL: Record<AppView['network']['media']['screenPhase'], DisplayText> = {
  OFF: msg('Pantalla apagada'), REQUESTING_OS_PERMISSION: msg('Esperando permiso del sistema'),
  CAPTURING_LOCAL: msg('Captura local activa'), NEGOTIATING: msg('Conectando emisión'),
  SENDING: msg('Compartiendo pantalla'), DENIED: msg('Permiso denegado'),
  NOT_SUPPORTED: msg('Captura no disponible aquí'), SOURCE_ENDED: msg('La fuente terminó'),
  NETWORK_FAILED: msg('Fallo al compartir'),
};

class StudyUI {
  private notebooks = new NotebookPanel();
  private speech=new NpcSpeech();
  private guideTextInput!:HTMLTextAreaElement;
  private guideTextField!:HTMLElement;
  private frameToggle!:HTMLInputElement;
  private frameField!:HTMLElement;
  private focusClock = new FocusClock();
  private connectionPanel=new ConnectionPanel();
  private garden:GardenPanel;
  private gamepad!:GamepadController;
  private seenRequests=new Set<string>();
  private requestNoticeTarget:PhonePage|null=null;
  private mailbox:MailboxUI;
  private jukebox=new StudyJukebox();
  private headCameras!:HeadCameras;
  readonly root: HTMLElement;
  readonly actions: AppActions;
  private view: AppView | null = null;
  private pane: Pane = 'world';
  private houseOwnerId: string | null = null;
  private waitingHouseId: string | null = null;
  private selectedFurnitureId: string | null = null;
  private previewHouse: PublicHouse | null = null;
  private decorating = false;
  private decorationGrid = true;
  private pendingFurniture: FurnitureKind | null = null;
  private decorationInvalid: string | null = null;
  private decorationToolbar!: HTMLElement;
  private decorationHistories = new Map<string,DecorationHistory>();
  private get decorationHistory():DecorationHistory {
    const key=`${this.houseOwnerId??'own'}/${spaceKey(this.localPosition.space)}`;
    let history=this.decorationHistories.get(key);if(!history){history=new DecorationHistory();this.decorationHistories.set(key,history);}return history;
  }
  private doorDrag:{id:string;offsetX:number;offsetY:number;base:PublicHouse}|null=null;
  private doorSaving=false;
  private drag: { id: string; offsetX: number; offsetY: number; baseHouse: PublicHouse } | null = null;
  private localPosition: Position = { ...WORLD_SPAWN };
  private keys = new Set<string>();
  private raf = 0;
  private lastFrame = 0;
  private lastMoveSent = 0;
  private localNotice: string | null = null;
  /** Bumped on every notify(), so the same text sent twice still shows again. */
  private localNoticeSeq = 0;
  /** Last value seen from each notice source; a source only shows again when its value changes. */
  private noticeSources: Record<'error' | 'local' | 'app', string | null> = { error: null, local: null, app: null };
  /** The one notice on screen: always the newest. Older ones are dropped, never queued. */
  private shownNotice: string | null = null;
  private shownNoticeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Request ids the user hid from the «Llaman a la puerta» card; it shows again only for new requests. */
  private hiddenApprovals = new Set<string>();
  private offlineStrokes: BoardStroke[] = [];
  private pendingStrokes: BoardStroke[] = [];
  private hiddenAuthors = new Set<string>();
  private boardDraft: { points: BoardPoint[]; tool: BoardStroke['tool']; color: string; width: number } | null = null;
  private mediaMounts = new Map<string, MediaMount>();
  private lastListsSignature = '';
  private lastLayersSignature = '';

  private shell!: HTMLElement;
  private statusBadge!: HTMLElement;
  private profileName!: HTMLElement;
  private profileColor!: HTMLElement;
  private nameInput!: HTMLInputElement;
  private colorInput!: HTMLInputElement;
  private saveIdentityInput!: HTMLInputElement;
  private saveIdentityButton!: HTMLButtonElement;
  private identityStatus!: HTMLElement;
  private lockOverlay!: HTMLElement;
  private lockMessage!: HTMLElement;
  private unlockToggleButton!: HTMLButtonElement;
  private lockDismissed = true;
  private unlockInput!: HTMLInputElement;
  private phaseText!: HTMLElement;
  private joinInput!: HTMLInputElement;
  private openButton!: HTMLButtonElement;
  private joinButton!: HTMLButtonElement;
  private leaveButton!: HTMLButtonElement;
  private inviteBox!: HTMLElement;
  private inviteValue!: HTMLInputElement;
  private copyInviteButton!: HTMLButtonElement;
  private rotateInviteButton!: HTMLButtonElement;
  private noticeBox!: HTMLElement;
  private headingAction!: HTMLButtonElement;
  private noticeText!: HTMLElement;
  private title!: HTMLElement;
  private subtitle!: HTMLElement;
  private canvasPane!: HTMLElement;
  private stageCanvas!: HTMLCanvasElement;
  private stageWrap!: HTMLElement;
  private portraitZoom = loadPortraitZoom();
  private portraitZoomLabel!: HTMLElement;
  private portraitCameraSig = '';
  private boardPane!: HTMLElement;
  private boardCanvas!: HTMLCanvasElement;
  private boardToolButtons = new Map<BoardUiTool, HTMLButtonElement>();
  private boardTool: BoardUiTool = 'pen';
  private boardEditor!: BoardEditor;
  private boardWrap!: HTMLElement;
  private boardZoomLabel!: HTMLElement;
  private boardClearButton!: HTMLButtonElement;
  private boardClearArmed = false;
  private boardTextInput: HTMLTextAreaElement | null = null;
  /** Each board keeps its own view, so visiting a friend's board does not move yours. */
  private boardCameras = new Map<string, BoardCamera>();
  private boardPan: { pointerId: number; x: number; y: number } | null = null;
  private boardErasing: number | null = null;
  private eraserPrefs = loadEraserPreferences();
  private eraserGesture: EraserGesture | null = null;
  private boardCursor: BoardPoint | null = null;
  private boardColor!: HTMLInputElement;
  private boardSwatchButtons = new Map<string, HTMLButtonElement>();
  private boardWidth!: HTMLSelectElement;
  private boardStatus!: HTMLElement;
  private boardLayers!: HTMLElement;
  private boardExportMode!: HTMLSelectElement;
  private boardUndoButton!: HTMLButtonElement;
  private boardRedoButton!: HTMLButtonElement;
  private boardNameInput!: HTMLInputElement;
  private boardAccessSelect!: HTMLSelectElement;
  private customBoardId: string | null = null;
  private activeBoardFurnitureId: string | null = null;
  private richBoardTool: 'circle' | 'arrow' | null = null;
  private richBoardDraft: { kind: 'circle' | 'arrow'; start: BoardPoint; current: BoardPoint } | null = null;
  private richToolButtons = new Map<'circle' | 'arrow', HTMLButtonElement>();
  private currentArea: BuiltinAreaId = 'residential';
  private settingsDialog!: HTMLDialogElement;
  private settingsContent!: HTMLElement;
  private settingsSections = new Map<string, HTMLElement>();
  private settingsTabs!: HTMLElement;
  private boardHeight = 432;
  private lastBoardScene: string | null = null;
  private offAi: (() => void) | null = null;
  private villageName = localStorage.getItem('studyvillage-village-name') || 'La aldea';
  private expansion!: WorldExpansionUIController;
  private contactsPane!: HTMLElement;
  private contactsList!: HTMLElement;
  private sessionContacts!: HTMLElement;
  private friendCodeValue!: HTMLElement;
  private importInput!: HTMLInputElement;
  private accessPendingCard!: HTMLElement;
  private diagnosticsPane!: HTMLElement;
  private diagnosticsReturn: Exclude<Pane,'diagnostics'> = 'world';
  private diagnosticList!: HTMLElement;
  private navButtons = new Map<Pane, HTMLButtonElement>();
  private contextTitle!: HTMLElement;
  private contextText!: HTMLElement;
  private housesList!: HTMLElement;
  private peopleList!: HTMLElement;
  private approvalBox!: HTMLElement;
  private approvalList!: HTMLElement;
  private houseEditBox!: HTMLElement;
  private houseNameInput!: HTMLInputElement;
  private houseAccessSelect!: HTMLSelectElement;
  private houseThemeSelect!: HTMLSelectElement;
  private furnitureKindSelect!: HTMLSelectElement;
  private furnitureCount!: HTMLElement;
  private furnitureCatalog!: HTMLElement;
  private enterDecorationButton!: HTMLButtonElement;
  private editGuideButton!:HTMLButtonElement;
  private selectedSpritePreview!:HTMLCanvasElement;
  private kindSpritePreview!:HTMLCanvasElement;
  private kindSpriteDescription!:HTMLElement;
  private renameFurnitureButton!: HTMLButtonElement;
  private furnitureNameDialog!: HTMLDialogElement;
  private furnitureNameInput!: HTMLInputElement;
  private furnitureNameTarget: string|null=null;
  private furnitureList!: HTMLElement;
  private furnitureDetail!: HTMLElement;
  private furnitureUseButton!: HTMLButtonElement;
  private furnitureColorInput!: HTMLInputElement;
  private aliasInput!: HTMLInputElement;
  private mediaBox!: HTMLElement;
  private mediaAudience!: HTMLElement;
  private mediaEyebrow!: HTMLElement;
  private voicePanel!: VoicePanel;
  private privateBox!: HTMLElement;
  private lastPrivateSignature = '';
  /** Requests declined on this screen; the requester can still cancel on theirs. */
  private dismissedPrivate = new Set<string>();
  private mediaStatus!: HTMLElement;
  private mediaError!: HTMLElement;
  private micButton!: HTMLButtonElement;
  private muteButton!: HTMLButtonElement;
  private deafenButton!: HTMLButtonElement;
  private pttButton!: HTMLButtonElement;
  private shareAudio = false;
  private screenButton!: HTMLButtonElement;
  private stopScreenButton!: HTMLButtonElement;
  private micMeterFill!: HTMLElement;
  private mediaTiles!: HTMLElement;
  private screenTheater!: HTMLElement;
  private screenTheaterGrid!: HTMLElement;
  private screenLayoutMode: 'spotlight' | 'grid' = 'spotlight';
  private spotlightKey: string | null = null;
  private aiBoardPromptInput!: HTMLInputElement;
  private aiBoardBusy = false;
  private boardAdvancedPanel!: HTMLElement;
  private boardAdvancedToggle!: HTMLButtonElement;
  private boardReadOnlyStatus!: HTMLElement;
  private aiSpritePromptInput!: HTMLInputElement;
  private aiSpritePreview!: HTMLImageElement;

  private touchControlsRoot!: HTMLElement;
  private touchDpad!: HTMLElement;
  private touchActionBtn!: HTMLButtonElement;
  private touchActionIcon!: HTMLElement;
  private touchActionLabel!: HTMLElement;
  private touchPttBtn!: HTMLButtonElement;
  private touchSprint = false;
  private touchToggleBtn!: HTMLButtonElement;
  private touchSelect: HTMLSelectElement | null = null;
  private servers!: ServersPanel;
  private offLanguage: (() => void) | null = null;
  private controlPrefs: ControlPreferences = loadControls();
  private readonly stageTaps = new DoubleTap();
  private stagePointers = new Set<number>();
  private dpadKeys = new Set<string>();
  private heldTouchPointers=new Map<number,HTMLElement>();
  private moveTarget: { x: number; y: number } | null = null;
  /** Corners still to walk through after moveTarget, from pathfinding. */
  private movePath: { x: number; y: number }[] = [];
  private activeBoardPointers = new Map<number, { clientX: number; clientY: number }>();
  private lastPinchDistance = 0;
  private lastPinchCenter: {clientX:number;clientY:number}|null=null;
  private boardPointer: {id:number;kind:string}|null=null;
  private boardPalms=new PencilTouchGuard();
  private stopBoardSurface:(()=>void)|null=null;
  private boardHidden=()=>{if(document.hidden)this.cancelBoardGesture();};
  private boardRotated=()=>this.cancelBoardGesture();
  private pencilMode=getPencilMode();
  private pencilModeInput!: HTMLInputElement;
  private offPencilMode:(()=>void)|null=null;
  private heading!: HTMLElement;
  private alerts!: HTMLElement;
  private villageCard!: HTMLElement;
  private phone!: HTMLElement;
  private phoneScreen!: HTMLElement;
  private phoneTitle!: HTMLElement;
  private phoneBack!: HTMLButtonElement;
  private phonePages = new Map<PhonePage, HTMLElement>();
  private phonePage: PhonePage | null = null;
  private phoneButton!: HTMLButtonElement;
  private phoneBadge!: HTMLElement;
  private phoneHouseTile!: HTMLButtonElement;
  private phoneLayout=loadPhoneLayout();
  private phoneTiles=new Map<PhoneAppId,HTMLButtonElement>();
  private phoneGrid!:HTMLElement;
  private phoneFolder:string|null=null;
  private phoneEditor!:PhoneLayoutEditor;
  private decorateHint!: HTMLElement;
  private hudVoice!: HTMLElement;
  private hudMic!: HTMLButtonElement;
  private hudDeafen!: HTMLButtonElement;
  private hudScreen!: HTMLButtonElement;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  /** A game, the notes or the projects fill the window: the stage takes no input. */
  private activityOpen = false;
  private mobileHud!: MobileHudEditor;
  private hudEditTile!: HTMLButtonElement;
  private vanity:VanityPanel;private petCollection!:PetCollectionPanel;private placingPet:OwnedPet|null=null;private petArtOwner='';
  private hudCamera!:HTMLButtonElement;
  private pets:PetWorld;
  private wardrobe: WardrobePanel;
  private spaces: HouseSpacesPanel;
  private roomWorkspace: RoomWorkspacePanel;
  private lastWorkspaceNotice: string | null = null;
  private workspaceToast:string|null=null;
  /** Walking towards something that was clicked; used on arrival. */
  private pendingInteraction: Interaction | null = null;
  private dragMoved = false;

  constructor(root: HTMLElement, actions: AppActions) {
    this.root = root;
    this.actions = { ...actions, updateOwnHouse: house => {
      const space=this.localPosition.space,doc=this.view?.network.workspace?.document;
      if(space){
        const workspace=this.view?.network.workspace;
        if(!doc||this.houseOwnerId!==this.view?.identity.fingerprint||workspace?.houseId!==this.houseOwnerId||!sameSpace(workspace.space,space))return;
        actions.workspaceCommand({action:'commit',base:doc.revision,document:{...doc,theme:house.theme,furniture:house.furniture.map(f=>({...f,color:f.color??'#9f7847'}))}});
      }else actions.updateOwnHouse(house);
    } };
    this.pets=new PetWorld({collection:()=>{void this.petCollection.open();},assign:home=>{void this.petCollection.open(home);},manage:home=>{this.selectedFurnitureId=home.furnitureId;if(home.scene==='area:residential')this.garden.open(home.furnitureId);else this.beginDecoration();},games:()=>this.expansion?.petGames()??[],play:(id,pet)=>this.expansion.playWithPet(id,pet),speak:(pet,fresh)=>{if(fresh)this.speech.sayPet(pet.phrase!,pet.x,pet.y-24,this.speechScene(),`${pet.owner}:${pet.id}`,pet.speechUntil??pet.reactionUntil,pet.automaticSpeech??false);else this.speech.followPet(`${pet.owner}:${pet.id}`,pet.x,pet.y-24);},view:()=>this.view,scene:()=>this.petScene(),position:()=>this.localPosition,stop:()=>{this.stopMoving();this.selectedFurnitureId=null;},obstacles:()=>this.pane==='house'?houseObstacles(this.currentHouse()??this.view!.ownHouse):this.currentArea==='residential'?worldObstacles(occupiedParcels(this.view!)):[...this.expansion.objectRegistry.obstaclesForArea(this.currentArea),...lampObstacles(this.currentArea)],save:(home,config)=>{
      const view=this.view;if(!view)return;
      if(home.scene==='area:residential')actions.updateOwnHouse({...view.ownHouse,garden:view.ownHouse.garden?.map(f=>f.id===home.furnitureId?{...f,pet:config}:f)});
      else {const key=home.scene.split(':').slice(2);if(key[0]==='lobby')actions.updateOwnHouse({...view.ownHouse,furniture:view.ownHouse.furniture.map(f=>f.id===home.furnitureId?{...f,pet:config}:f)});
       else actions.workspaceCommand({action:'pet',space:{floorId:key[0],roomId:key[1]==='-'?null:key[1]},furniture:home.furnitureId,config});}
    }},actions);
    this.petCollection=new PetCollectionPanel({owner:()=>this.view?.identity.fingerprint??'',homes:()=>this.pets.homesList(),reserved:id=>this.pets.isReserved(id),save:(home,config)=>this.savePetHome(home,config),place:pet=>this.placeCustomPet(pet)});
    this.notebooks.connect(actions,()=>this.view,()=>this.activityScope()||'village');
    this.mailbox=new MailboxUI(()=>this.view?.identity.fingerprint??'',command=>this.actions.mailboxCommand(command));
    this.garden=new GardenPanel(()=>this.view,house=>this.actions.saveHouseLayout(house),()=>this.stageCanvas,()=>this.pets.count());
    const spaceContext: SpacePanelContext = {
      house:()=>this.baseHouse(),space:()=>this.localPosition.space??null,document:()=>this.view?.network.workspace?.document??null,me:()=>this.view?.identity.fingerprint??'',
      pendingAccess:()=>this.view?.network.pendingAccess??null,cancelAccessRequest:()=>this.actions.cancelAccessRequest(),
      command:command=>{this.stopMoving();actions.workspaceCommand(command);},layout:house=>actions.saveHouseLayout(house),friends:()=>this.view?.contacts??[],server:()=>!!this.view?.network.server,notify:message=>this.notify(message),
    };
    this.spaces=new HouseSpacesPanel(spaceContext);this.roomWorkspace=new RoomWorkspacePanel(spaceContext);
    this.expansion = new WorldExpansionUIController({
      pets:()=>this.pets.bots(),petMatch:(key,ids)=>this.pets.match(key,ids),
      getView: () => this.view,
      getCurrentArea: () => this.currentArea,
      setCurrentArea: (area: BuiltinAreaId) => this.changeWorldArea(area, WORLD_AREAS[area].defaultSpawn),
      openBoardById: (boardId, title) => {
        this.customBoardId = boardId;
        this.activeBoardFurnitureId = null;
        this.expansion.boardRegistry.ensureBoard(
          boardId,
          title,
          this.currentArea,
          this.view?.identity.fingerprint || 'system',
        );
        this.pane = 'board';
        this.lastLayersSignature = '';
        this.lastBoardRenderSig = '';
        this.notify(t("Pizarra abierta: {p0}", { p0: title }));
        this.refresh();
      },
      navigateToPane: (pane) => {
        this.navigate(pane);
      },
      notify: (msg) => this.notify(msg),
      speak:(text,x,y)=>{this.stopMoving();this.speech.say(text,x,y,this.speechScene());this.lastStageRenderSig='';},
      openFocus:()=>{this.stopMoving();this.focusClock.open();},
      openVoice:()=>{this.stopMoving();this.openPhone('voice');},
      openMaterials:()=>{this.stopMoving();void this.notebooks.openMaterials();},
      activityScope: () => this.activityScope(),
      requestStageRedraw: () => {
        this.lastStageRenderSig = '';
      },
      activityChanged: (open) => {
        this.activityOpen = open;
        this.stopMoving();
        if (open) { this.speech.clear(); this.closePhone(); }
      },
      actions,
    });
    this.wardrobe = new WardrobePanel({
      save: look => this.actions.updateAppearance(look),
      closed: () => { this.selectedFurnitureId=null;this.stopMoving();this.refreshHouseEditor();this.lastStageRenderSig='';this.stageCanvas?.focus(); },
    });
    this.vanity=new VanityPanel(look=>this.actions.updateAppearance(look));
    this.build();
    this.mobileHud=new MobileHudEditor([
      {id:'movement',label:msg('Movimiento'),element:this.touchDpad},
      {id:'interact',label:msg('Interactuar'),element:this.touchActionBtn},
      {id:'sprint',label:msg('Correr'),element:this.touchControlsRoot.querySelector<HTMLElement>('[data-testid="touch-sprint-btn"]')!},
      {id:'ptt',label:msg('Pulsar para hablar'),element:this.touchPttBtn},
      {id:'microphone',label:msg('Micrófono'),element:this.hudMic},
      {id:'deafen',label:msg('Dejar de escuchar'),element:this.hudDeafen},
      {id:'camera',label:msg('Cámara'),element:this.hudCamera},
      {id:'screen',label:msg('Compartir pantalla'),element:this.hudScreen},
      {id:'clock',label:msg('Reloj flotante'),element:this.focusClock.hud,layout:value=>this.focusClock.applyHudLayout(value)},
      {id:'location',label:msg('Ubicación'),element:this.shell.querySelector<HTMLElement>('.sv-hud-place')!},
    ],()=>{this.stopMoving();this.actions.setTalking(false);},()=>{this.hudEditTile.hidden=false;});

    this.shell.append(this.mobileHud.root);
    this.offAi = this.expansion.ollamaGateway.subscribe(() => this.refreshAiControls());
    this.refreshAiControls();
    this.shell.append(this.wardrobe.root,this.spaces.root,this.roomWorkspace.root);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.gamepad=new GamepadController((key,down)=>{const event=new KeyboardEvent(down?'keydown':'keyup',{key});if(down)this.onKeyDown(event);else this.onKeyUp(event);},()=>{
      const modal=!!document.querySelector('dialog[open]');
      if(modal||!this.phone.hidden||this.garden.active||this.decorating)return 'menu';
      if(this.activityOpen)return this.expansion.gamepadPlaying()?'game':'menu';return 'world';
    },key=>this.expansion.gamepadInput(key),()=>this.expansion.gamepadMenu());
    this.settingsSection('Mando').append(this.gamepad.root);
    this.raf = requestAnimationFrame(this.tick);
  }

  private travelling = false;
  /**
   * Server mode: the left and right edges of a neighbourhood lead to its neighbours.
   * A refused transition (full, no permission) keeps you exactly where you were.
   */
  private maybeTravel(view: AppView, at: Position, vector: { x: number; y: number }): void {
    const server = view.network.server;
    if (!server || view.network.phase !== 'JOINED' || this.pane !== 'world' || this.currentArea !== 'residential' || this.travelling || !vector.x) return;
    const edge = at.x <= 12 && vector.x < 0 ? -1 : at.x >= LIMITS.worldWidth - 12 && vector.x > 0 ? 1 : 0;
    const target = server.neighborhood + edge;
    if (!edge || target < 0 || target >= server.neighborhoods) return;
    this.travelling = true;
    const before = this.localPosition;
    void this.actions.travel(target).then(() => {
      this.localPosition = { areaId: 'residential', x: edge < 0 ? LIMITS.worldWidth - 24 : 24, y: WORLD_SPAWN.y, direction: edge < 0 ? 'left' : 'right', moving: false };
      this.moveTarget = null; this.movePath = [];
      this.actions.move({ ...this.localPosition, areaId: 'residential' });
      this.notify(t('Barrio {n}', { n: target + 1 }));
    }).catch(error => { this.localPosition = { ...before, x: edge < 0 ? 24 : LIMITS.worldWidth - 24, moving: false }; this.notify(errorMessage(error)); })
      .finally(() => { setTimeout(() => { this.travelling = false; }, 800); });
  }

  /** Cached list signatures skip rebuilding; a language change must rebuild them. */
  private forgetSignatures(): void {
    const self = this as unknown as Record<string, unknown>;
    for (const key of Object.keys(self)) if (/(Signature|Sig)$/.test(key) && typeof self[key] === 'string') self[key] = '';
  }

  /** My own house boards and my legacy shapes, as server board refs, for an explicit import. */
  private ownBoardsForImport(): { ref: string; strokes: BoardStroke[] }[] {
    const view = this.view; if (!view) return [];
    const me = view.identity.fingerprint;
    return view.ownHouse.furniture.filter(item => item.kind === 'board').map(item => {
      const local = this.localBoardFor(item.id), ref = `house:${me}:${item.id}`;
      const strokes = this.expansion.boardRegistry.getStrokes(local).filter(s => s.author === me && !s.deleted);
      // Older circles and arrows lived outside the stroke list; they travel as ordinary objects now.
      for (const shape of this.expansion.boardRegistry.getRichElements(local)) {
        if ((shape.kind === 'circle' || shape.kind === 'arrow') && (shape.authorId === me || shape.authorId === 'local-host') && shape.points.length >= 2)
          strokes.push({ id: shape.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || crypto.randomUUID(), author: me, boardId: ref, seq: 1, color: /^#[0-9a-f]{6}$/i.test(shape.color) ? shape.color : '#315f51', width: Math.max(1, Math.min(32, shape.width || 4)), tool: shape.kind, points: [shape.points[0], shape.points.at(-1)!], deleted: false });
      }
      return { ref, strokes: strokes.map(s => ({ ...s, boardId: ref })) };
    }).filter(board => board.strokes.length);
  }

  update(view: AppView): void {
    this.headCameras.update(view);
    this.servers?.update(view);
    const previousAccess=this.view?.network.pendingAccess;
    const justJoined = this.view?.network.phase !== 'JOINED' && view.network.phase === 'JOINED';
    this.view = view;if(this.petArtOwner!==view.identity.fingerprint){this.petArtOwner=view.identity.fingerprint;void loadPetCollection(this.petArtOwner).then(()=>{this.lastStageRenderSig='';});}
    this.notebooks.syncSession();
    if (justJoined && !this.houseOwnerId) this.actions.move({ ...this.localPosition, areaId: this.currentArea });
    this.pendingStrokes = this.pendingStrokes.filter((stroke) => !view.network.strokes.some((received) => received.id === stroke.id));
    const ownMember = view.network.members.find((member) => member.identity.fingerprint === view.identity.fingerprint);
    const space=view.network.workspace?.space??ownMember?.position.space??null;
    if(this.houseOwnerId&&!sameSpace(space,this.localPosition.space)){
      this.wardrobe.close(true);this.localPosition={...HOUSE_SPAWN,space:space??undefined};this.stopMoving();this.endDecoration();this.selectedFurnitureId=null;
      this.expansion.closeModal();if(this.pane==='board')this.pane='house';this.lastStageRenderSig='';
    }
    const notice=view.network.workspace?.notice??null;
    if(notice!==this.lastWorkspaceNotice){
      if(!notice&&this.workspaceToast&&this.localNotice===this.workspaceToast){this.localNotice=null;if(this.noticeTimer)clearTimeout(this.noticeTimer);this.noticeTimer=null;}
      this.workspaceToast=notice?t(notice):null;if(this.workspaceToast)this.notify(this.workspaceToast);this.lastWorkspaceNotice=notice;
    }
    this.spaces.refresh();this.roomWorkspace.refresh();
    if (this.waitingHouseId && ownMember?.houseId === this.waitingHouseId) {
      this.houseOwnerId = this.waitingHouseId;
      this.waitingHouseId = null;
      this.localPosition = { ...HOUSE_SPAWN };
      this.pane = 'house';
      this.localNotice = null;
    }
    if (this.waitingHouseId && previousAccess?.kind==='house' && previousAccess.ownerId===this.waitingHouseId && !view.network.pendingAccess) {
      this.waitingHouseId = null;
      this.localNotice = null;
    }
    if (this.waitingHouseId && view.network.error && !view.network.pendingAccess) {
      this.waitingHouseId = null;
      this.localNotice = null;
    }
    if (this.houseOwnerId && this.houseOwnerId !== view.identity.fingerprint
      && (view.network.phase !== 'JOINED' || ownMember?.houseId !== this.houseOwnerId)) {
      this.houseOwnerId = null;
      this.pane = 'world';
      this.localPosition = { ...WORLD_SPAWN };
    }
    if (this.waitingHouseId && view.network.phase !== 'JOINED') this.waitingHouseId = null;
    this.expansion.syncSession();
    this.refresh();
  }

  destroy(): void {
    this.speech.dispose(); this.notebooks.dispose(); this.focusClock.dispose();this.jukebox.dispose(); this.headCameras.dispose();
    this.offLanguage?.(); this.offLanguage = null;
    this.offPencilMode?.();this.offPencilMode=null;this.cancelBoardGesture();
    this.stopBoardSurface?.();
    window.removeEventListener('pointerup',this.onBoardPointerUp);window.removeEventListener('pointercancel',this.onBoardPointerUp);
    document.removeEventListener('visibilitychange',this.boardHidden);window.removeEventListener('orientationchange',this.boardRotated);
    this.boardEditor?.dispose();
    cancelAnimationFrame(this.raf); this.offAi?.();
    this.petCollection.dispose();this.pets.dispose();this.wardrobe.dispose();this.vanity.dispose();this.garden.dispose();this.mailbox.dispose();this.connectionPanel.dispose();this.phoneEditor?.dispose();
    this.gamepad?.dispose();this.mobileHud.dispose();
    this.expansion.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.keys.clear();
    this.touchSprint = false;
    this.dpadKeys.clear();
    this.moveTarget = null;
    this.activeBoardPointers.clear();
    for (const mount of this.mediaMounts.values()){mount.dispose?.();mount.element.srcObject = null;}
    this.mediaMounts.clear();
    this.root.replaceChildren();
  }

  private build(): void {
    this.shell = node('div', 'sv-app');
    this.statusBadge = node('span', 'sv-status-pill', msg('Sin sesión'));
    this.headCameras=new HeadCameras(()=>{this.actions.setCameraActivity('village');this.run(()=>this.actions.toggleGameCamera());});
    this.settingsDialog = node('dialog', 'sv-settings-dialog');
    setDisplayAttribute(this.settingsDialog, 'aria-label', msg('Ajustes'));
    const settingsHead = node('div', 'sv-inline');
    const settingsTitle = node('h2', '', msg('Ajustes'));
    const closeSettings = button(msg('Cerrar'), 'sv-button');
    closeSettings.addEventListener('click', () => this.settingsDialog.close());
    append(settingsHead, settingsTitle, closeSettings);
    this.settingsContent = node('div', 'sv-settings-body');
    this.settingsTabs = node('div', 'sv-settings-tabs'); this.settingsTabs.setAttribute('role', 'tablist'); setDisplayAttribute(this.settingsTabs, 'aria-label', msg('Secciones de ajustes'));
    append(this.settingsDialog, settingsHead, this.settingsTabs, this.settingsContent);
    for (const title of ['Perfil', 'Ambiente', 'Controles', 'Servidores', 'Identidad']) this.settingsSection(title);
    const languageSelect = node('select', 'sv-select');
    for (const [value, label] of [['es', 'Español'], ['en', 'English'], ['fr', 'Français']] as const) { const option = node('option'); option.value = value; option.textContent = label; option.lang = value; languageSelect.append(option); }
    setDisplayAttribute(languageSelect,'aria-label',msg('Idioma'));
    languageSelect.value = getLanguage();
    languageSelect.addEventListener('change', () => {
      // In place: no reload, so sessions, games, drafts and drawings stay open.
      try { setLanguage(languageSelect.value as Language); } catch { this.notify(t('No se pudo guardar el idioma.')); }
    });
    const languageField = field(msg('Idioma'), languageSelect); languageField.dataset.testid = 'language-field';
    this.settingsSection('Perfil').prepend(languageField);
    this.offLanguage = subscribeLanguage(language => { languageSelect.value = language; this.forgetSignatures(); this.lastStageRenderSig = ''; this.lastBoardRenderSig = ''; this.boardExtraFrames = 3; if (this.view) this.update(this.view); });
    this.servers = new ServersPanel({ actions: this.actions, notify: message => this.notify(message), ownBoards: () => this.ownBoardsForImport() });
    this.settingsSection('Servidores').append(this.servers.root);
    const advanced=document.createElement('details'),summary=document.createElement('summary');setDisplayText(summary,msg('Conexión avanzada'));advanced.append(summary,...Array.from(this.connectionPanel.root.children));this.settingsSection('Servidores').append(advanced);
    const controls = this.settingsSection('Controles');
    append(controls, node('h3', '', msg('A tu ritmo')), node('p', '', msg('WASD o flechas para caminar · Shift para correr · Doble clic o doble toque para abrir casas, muebles y portales · E para usar lo que tengas cerca · M para abrir el menú · Escape para volver. Con los controles táctiles activados, un toque te acerca caminando.')), node('p', '', msg('Pizarra: Mano para desplazarte, rueda para mover el lienzo y Ctrl + rueda para acercarte. En pantallas táctiles puedes usar dos dedos para acercar y desplazar.')));
    const touch = select([{value:'auto',label:msg('Automáticos')},{value:'on',label:msg('Siempre visibles')},{value:'off',label:msg('Ocultos')}]);
    touch.value = this.controlPrefs.touch;
    touch.addEventListener('change', () => { this.setTouchPreference(touch.value as ControlPreferences['touch']); });
    this.touchSelect = touch;
    const editControls=button(msg('Editar controles'),'sv-button');editControls.onclick=()=>{this.settingsDialog.close();this.mobileHud.open();};controls.append(editControls);
    controls.append(field(msg('Controles táctiles'), touch),this.speech.settingsControl());

    const main = node('main', 'sv-main');
    const session = node('div', 'sv-phone-section');
    this.buildSidebar(session);
    this.buildMain(main);
    this.buildInspector();
    this.buildPhone(session);
    this.accessPendingCard=node('aside','sv-access-pending');this.accessPendingCard.hidden=true;setDisplayAttribute(this.accessPendingCard,'aria-label',msg('Solicitud de acceso pendiente'));
    const pendingLabel=node('span','',msg('Solicitud de acceso pendiente'));pendingLabel.setAttribute('role','status');
    const cancelAccess=button(msg('Cancelar solicitud'),'sv-button sv-button-small');cancelAccess.onclick=()=>this.actions.cancelAccessRequest();this.accessPendingCard.append(pendingLabel,cancelAccess);
    append(this.shell, main, this.buildHud(), this.phone, this.alerts, this.noticeBox, this.settingsDialog,this.accessPendingCard);
    this.root.replaceChildren(this.shell);

    this.lockOverlay = node('div', 'sv-lock-overlay');
    const lockCard = node('form', 'sv-lock-card');
    append(lockCard, node('div', 'sv-lock-icon', '⌂'), node('h2', '', msg('Tu identidad está protegida')),
      node('p', '', msg('Introduce tu contraseña para volver a abrirla en este equipo.')));
    this.unlockInput = node('input', 'sv-input');
    this.unlockInput.type = 'password';
    this.unlockInput.autocomplete = 'current-password';
    this.unlockInput.required = true;
    append(lockCard, field(msg('Contraseña'), this.unlockInput));
    const unlockButton = button(msg('Desbloquear identidad'), 'sv-button sv-button-primary');
    unlockButton.type = 'submit';
    lockCard.append(unlockButton);
    this.lockMessage = node('p', 'sv-error');
    this.lockMessage.setAttribute('role', 'status');
    const stayOffline = button(msg('Continuar sin conexión'), 'sv-button sv-button-outline');
    stayOffline.addEventListener('click', () => { this.lockDismissed = true; this.refresh(); this.stageCanvas.focus(); });
    append(lockCard, this.lockMessage, stayOffline);
    lockCard.addEventListener('submit', (event) => {
      event.preventDefault();
      const passphrase = this.unlockInput.value;
      this.run(() => this.actions.unlockIdentity(passphrase));
      this.unlockInput.value = '';
    });
    this.lockOverlay.append(lockCard);
    this.shell.append(this.lockOverlay);

  }

  private settingsSection(title: string): HTMLElement {
    const existing = this.settingsSections.get(title); if (existing) return existing;
    const section = node('section', 'sv-settings-section'); section.id = `settings-${this.settingsSections.size}`;
    section.setAttribute('role', 'tabpanel'); setDisplayAttribute(section, 'aria-label', msg(title)); section.hidden = this.settingsSections.size > 0;
    const tab = button(msg(title), 'sv-settings-tab'); tab.id = `${section.id}-tab`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', section.id); tab.setAttribute('aria-selected', String(!section.hidden)); tab.tabIndex = section.hidden ? -1 : 0; section.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('click', () => { for (const panel of this.settingsSections.values()) panel.hidden = panel !== section; for (const b of this.settingsTabs.querySelectorAll<HTMLButtonElement>('button')) { b.setAttribute('aria-selected', String(b === tab)); b.tabIndex = b === tab ? 0 : -1; } });
    tab.addEventListener('keydown', event => { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); const tabs = [...this.settingsTabs.querySelectorAll<HTMLButtonElement>('button')]; const i = tabs.indexOf(tab); const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (i+(event.key === 'ArrowRight' ? 1 : tabs.length-1))%tabs.length]; next.click(); next.focus(); });
    this.settingsSections.set(title, section); this.settingsTabs.append(tab); this.settingsContent.append(section); return section;
  }

  private refreshAiControls(): void {
    const ai = this.expansion.ollamaGateway;
    const category = this.boardAdvancedPanel?.querySelector<HTMLElement>('.sv-ai-board-bar')?.closest<HTMLElement>('details');
    if (category) category.hidden = !ai.isReady('board') && !ai.isReady('boardVision');
    for (const id of ['ai-board-tutor-btn','ai-board-hint-btn']) { const b = this.shell.querySelector<HTMLElement>(`[data-testid="${id}"]`); if (b) b.hidden = !ai.isReady('board'); }
    const latex = this.shell.querySelector<HTMLElement>('[data-testid="ai-board-latex-btn"]'); if (latex) latex.hidden = !ai.isReady('boardVision');
    this.shell.querySelectorAll<HTMLElement>('[data-ai-feature="sprites"]').forEach(e => { e.hidden = !ai.isReady('sprites'); });
  }

  /** Profile settings (into Ajustes) and the connect/invite controls (into the phone). */
  private buildSidebar(sessionHost: HTMLElement): void {
    const profileForm = node('form', 'sv-stack sv-profile-form');
    this.nameInput = node('input', 'sv-input');
    this.nameInput.maxLength = 32;
    this.nameInput.required = true;
    this.colorInput = node('input', 'sv-color-input');
    this.colorInput.type = 'color';
    append(profileForm, field(msg('Nombre visible'), this.nameInput), field(msg('Color'), this.colorInput));
    const saveProfile = button(msg('Guardar perfil'), 'sv-button sv-button-small');
    saveProfile.type = 'submit';
    profileForm.append(saveProfile);
    profileForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.run(() => this.actions.updateProfile(this.nameInput.value.trim(), this.colorInput.value));
    });

    const villageNameInput = node('input', 'sv-input');
    villageNameInput.maxLength = 48;
    villageNameInput.value = defaultText(this.villageName);
    villageNameInput.addEventListener('change', () => {
      this.villageName = villageNameInput.value.trim().slice(0, 48) || 'La aldea';
      villageNameInput.value = defaultText(this.villageName);
      localStorage.setItem('studyvillage-village-name', this.villageName);
      this.refresh();
    });
    const houseName = node('input', 'sv-input');
    houseName.maxLength = 32;
    // Opening the modal releases input. A delayed close event must not erase fresh movement keys.
    this.settingsDialog.addEventListener('toggle', () => { if (this.settingsDialog.open) this.stopMoving(); });
    houseName.addEventListener('change', () => this.patchOwnHouse({ name: houseName.value.trim() || 'Mi casa' }));
    this.settingsDialog.addEventListener('toggle', () => { houseName.value = defaultText(this.view?.ownHouse.name || ''); });
    append(this.settingsSection('Perfil'), node('h3', '', msg('Tu espacio')), field(msg('Nombre del vecindario (en este equipo)'), villageNameInput), field(msg('Nombre de tu casa'), houseName), profileForm);

    const session = node('section', 'sv-session-card');
    this.phaseText = node('p', 'sv-subtle', msg('Sin sesión'));
    session.append(this.phaseText);
    this.openButton = button(msg('Abrir mi aldea a otras personas'), 'sv-button sv-button-primary sv-wide');
    this.openButton.addEventListener('click', () => this.run(() => this.actions.openVillage()));
    this.joinInput = node('input', 'sv-input');
    this.joinInput.autocapitalize='off';this.joinInput.spellcheck=false;this.joinInput.addEventListener('focus',()=>{setTimeout(()=>{if(document.activeElement===this.joinInput)this.joinInput.scrollIntoView({block:'nearest'});},250);});
    setDisplayAttribute(this.joinInput, "placeholder", msg('Pega una invitación'));
    setDisplayAttribute(this.joinInput, 'aria-label', msg('Código de invitación'));
    const joinForm = node('form', 'sv-join-form');
    this.joinButton = button(msg('Unirme'), 'sv-button sv-button-small');
    this.joinButton.type = 'submit';
    append(joinForm, this.joinInput, this.joinButton);
    joinForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.joinInput.value.trim()) this.run(() => this.actions.joinVillage(this.joinInput.value.trim()));
    });
    this.inviteBox = node('div', 'sv-invite-box');
    this.inviteValue = node('input', 'sv-input sv-code-input');
    this.inviteValue.readOnly = true;
    setDisplayAttribute(this.inviteValue, 'aria-label', msg('Invitación actual'));
    this.copyInviteButton = button(msg('Copiar'), 'sv-button sv-button-small');
    this.copyInviteButton.addEventListener('click', () => this.run(() => this.actions.copyInvite()));
    this.rotateInviteButton = button(msg('Renovar código'), 'sv-link-button');
    this.rotateInviteButton.addEventListener('click', () => this.run(() => this.actions.rotateInvite()));
    append(this.inviteBox, node('span', 'sv-field-label', msg('Invitación actual')), this.inviteValue,
      this.copyInviteButton, this.rotateInviteButton);
    this.leaveButton = button(msg('Salir de la sesión'), 'sv-link-button sv-danger-text');
    this.leaveButton.addEventListener('click', () => {
      if (this.view?.network.isHost && !window.confirm(t('¿Cerrar el vecindario para todas las personas? Tu casa y tus archivos locales se conservan.'))) return;
      this.run(() => this.actions.leave());
    });
    append(session, this.openButton, node('p', 'sv-divider-text', msg('o únete a la de alguien')), joinForm, this.inviteBox, this.leaveButton);
    sessionHost.append(session);
  }

  /**
   * The phone: one button opens every app, the way a life-sim handheld does.
   * Nothing else sits around the village, so the world stays the focus.
   */
  private buildPhone(sessionControls: HTMLElement): void {
    this.phone = node('div', 'sv-phone');
    this.phone.hidden = true;
    this.phone.addEventListener('click', (event) => { if (event.target === this.phone) this.closePhone(); });
    this.phoneScreen = node('section', 'sv-phone-screen');
    this.phoneScreen.setAttribute('role', 'dialog');
    setDisplayAttribute(this.phoneScreen, 'aria-label', msg('Menú'));
    const head = node('header', 'sv-phone-head');
    this.phoneBack = button('', 'sv-phone-icon-btn');
    this.phoneBack.append(monoIcon('back', 14));
    setDisplayAttribute(this.phoneBack, 'aria-label', msg('Volver'));
    this.phoneBack.addEventListener('click', () => {if(this.phonePage!=='folder'&&this.phoneFolder)this.openPhone('folder');else this.openPhone('home');});
    this.phoneTitle = node('h2', 'sv-phone-title', msg('Menú'));
    const close = button('', 'sv-phone-icon-btn');
    close.append(monoIcon('close', 12));
    setDisplayAttribute(close, 'aria-label', msg('Cerrar menú'));
    close.addEventListener('click', () => this.closePhone());
    append(head, this.phoneBack, this.phoneTitle, close);

    const home = node('div', 'sv-phone-page sv-phone-home');
    const me = node('div', 'sv-phone-me');
    this.profileColor = node('div', 'sv-profile-avatar');
    this.profileName = node('strong', '', msg('Tu nombre'));
    const meText = node('div');
    append(meText, this.profileName, this.statusBadge);
    append(me, this.profileColor, meText);
    const grid = node('div', 'sv-app-grid');
    this.phoneGrid=grid;
    const tile = (label: DisplayText, iconName: string, hue: string, onClick: () => void, testid?: string) => {
      const item = button('', 'sv-app-tile');
      item.style.setProperty('--tile', hue);
      const face = node('span', 'sv-app-icon');
      face.append(monoIcon(iconName, 26));
      append(item, face, node('span', 'sv-app-label', label));
      if (testid) item.dataset.testid = testid;
      item.addEventListener('click', onClick);
      if(testid){item.dataset.phoneApp=testid.replace('phone-','');this.phoneTiles.set(item.dataset.phoneApp as PhoneAppId,item);}
      return item;
    };
    this.phoneHouseTile = tile(msg('Mi casa'), 'house', '#e8894f', () => {
      this.closePhone();
      if (this.pane === 'house' && this.houseOwnerId === this.view?.identity.fingerprint) this.leaveCurrentHouse();
      else this.enterOwnHouse();
    }, 'phone-house');
    tile(msg('Aldea'), 'world', '#5fa36b', () => this.openPhone('village'), 'phone-village');
    this.hudEditTile=tile(msg('Editar controles'),'gear','#728c9c',()=>{this.closePhone();this.mobileHud.open();},'phone-hud-editor');
    tile(msg('Habitaciones'), 'house', '#8d70ae', () => { this.closePhone(); if (!this.houseOwnerId) this.enterOwnHouse(); this.stopMoving(); this.spaces.open(); }, 'phone-rooms');
    tile(msg('Voz'), 'mic', '#d9667f', () => this.openPhone('voice'), 'phone-voice');
    // Inside a room these open that room's own copy (see activityScope).
    tile(msg('Proyectos'), 'code', '#4c7fd1', () => { this.closePhone(); this.expansion.openActivity('projects'); }, 'phone-projects');
    tile(msg('Estudio'), 'notes', '#d9a640', () => { this.closePhone(); this.expansion.openActivity('study'); }, 'phone-study');
    tile(msg('Decorar'), 'brush', '#3fa3a0', () => {
      if (this.houseOwnerId !== this.view?.identity.fingerprint || this.pane !== 'house') this.enterOwnHouse();
      this.openPhone('decorate');
    }, 'phone-decorate');
    tile(msg('Contactos'), 'contacts', '#c9654f', () => this.openPhone('contacts'), 'phone-contacts');
    tile(msg('Mascotas'),'house','#9e9a67',()=>{this.closePhone();this.pets.open();},'phone-pets');
    tile(msg('Ajustes'), 'gear', '#7c8a7a', () => { this.closePhone(); this.settingsDialog.showModal(); }, 'phone-settings');
    tile(msg('Mi jardín'),'brush','#729a84',()=>{this.closePhone();this.stopMoving();this.endDecoration();this.garden.open();},'phone-garden');
    tile(msg('Bloques del Bosque'),'projects','#729a84',()=>{this.closePhone();this.expansion.openActivity('tetris');},'phone-tetris');
    tile(msg('Música'),'mic','#af7657',()=>{this.closePhone();this.stopMoving();this.jukebox.open();},'phone-music');
    tile(msg('Concentración'),'gear','#729a84',()=>{this.closePhone();this.stopMoving();this.focusClock.open();},'phone-focus');
    tile(msg('Cuaderno de tinta'), 'notes', '#729a84', () => { this.closePhone(); this.stopMoving(); this.notebooks.open(); }, 'phone-ink');
    append(home, me, grid);
    const folder=node('div','sv-phone-page sv-app-grid');

    const village = node('div', 'sv-phone-page');
    append(village, sessionControls, this.villageCard);
    const voice = node('div', 'sv-phone-page');
    voice.append(this.mediaBox,this.headCameras.controls);
    const decorate = node('div', 'sv-phone-page');
    this.decorateHint = node('p', 'sv-subtle', msg('Entra en tu casa para decorarla.'));
    append(decorate, this.decorateHint, this.houseEditBox);
    const contacts = node('div', 'sv-phone-page');
    contacts.append(this.contactsPane);
    this.phonePages = new Map<PhonePage, HTMLElement>([['home', home], ['folder',folder], ['village', village], ['voice', voice], ['decorate', decorate], ['contacts', contacts]]);
    append(this.phoneScreen, head, ...this.phonePages.values());
    this.phone.append(this.phoneScreen);
    this.phoneEditor=new PhoneLayoutEditor(this.phoneScreen,layout=>{this.phoneLayout=layout;this.renderPhoneLayout();if(this.phonePage==='folder')this.openPhone('folder');},()=>this.phoneFolder);
    this.phoneScreen.append(this.phoneEditor.root);
    this.renderPhoneLayout();
  }

  private renderPhoneLayout():void {
    this.phoneGrid.replaceChildren();this.phonePages.get('folder')!.replaceChildren();
    // Detach optional applications as well as apps which changed containers.
    for(const tile of this.phoneTiles.values())tile.remove();
    for(const entry of this.phoneLayout.entries){
      if(entry.type==='app'){this.phoneGrid.append(this.phoneTiles.get(entry.id)!);continue;}
      const item=button('','sv-app-tile');item.dataset.testid=`phone-folder-${entry.id}`;item.dataset.phoneFolder=entry.id;
      const appearance=folderAppearance(entry),face=node('span','sv-app-icon sv-folder-icon');face.style.setProperty('--tile','#f4eedf');face.style.color=appearance.color;face.append(monoIcon(appearance.icon,26));
      append(item,face,node('span','sv-app-label',entry.builtin?msg(entry.name):entry.name));
      item.onclick=()=>{this.phoneFolder=entry.id;this.openPhone('folder');};this.phoneGrid.append(item);
    }
  }

  private openPhone(page: PhonePage = 'home'): void {
    this.speech.clear();
    if(page==='home')this.phoneFolder=null;
    const folder=this.phoneLayout.entries.find(e=>e.type==='folder'&&e.id===this.phoneFolder);
    if(page==='folder'&&folder?.type!=='folder'){page='home';this.phoneFolder=null;}
    if(page==='folder'&&folder?.type==='folder'){const container=this.phonePages.get('folder')!;container.replaceChildren(...folder.apps.map(id=>this.phoneTiles.get(id)!));}
    const titles: Record<PhonePage, DisplayText> = { home: msg('Menú'), folder:folder?.type==='folder'?(folder.builtin?msg(folder.name):folder.name):msg('Menú'), village: msg('Aldea'), voice: msg('Voz y pantalla'), decorate: msg(this.localPosition.space ? this.localPosition.space.roomId ? 'Decorar habitación' : 'Decorar planta' : 'Decorar mi casa'), contacts: msg('Contactos') };
    this.expansion.closeModal();
    this.phonePage = page;
    this.phone.hidden = false;
    this.phone.dataset.page = page;
    this.stopMoving();
    setText(this.phoneTitle, titles[page]);
    show(this.phoneBack, page !== 'home');
    for (const [key, el] of this.phonePages) show(el, key === page);
    this.phoneEditor?.refresh();
    this.refresh();
  }

  private closePhone(): void {
    if (this.phone.hidden) return;
    this.phone.hidden = true;
    this.phonePage = null;
    this.phoneFolder=null;this.phoneEditor?.finish();
    // Hand the keyboard back to the world (not to the Menú button, where Space would reopen it).
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && (this.phone.contains(focused) || focused === this.phoneButton)) focused.blur();
  }

  private stopMoving(): void {
    for(const[id,element]of this.heldTouchPointers){try{if(element.hasPointerCapture(id))element.releasePointerCapture(id);}catch{}}this.heldTouchPointers.clear();
    this.keys.clear();
    this.touchSprint = false;
    this.dpadKeys.clear();
    this.moveTarget = null;
    this.movePath = [];
    this.pendingInteraction = null;
  }

  /** Corners only: where you are, who is here, your voice, and the phone. */
  private buildHud(): HTMLElement {
    const hud = node('div', 'sv-hud');
    const topLeft = node('div', 'sv-hud-place');
    topLeft.append(this.heading);
    // Requests to come in sit above everything, even an open phone.
    this.alerts = node('div', 'sv-hud-top-right');
    this.approvalBox.classList.add('sv-hud-card');
    this.alerts.append(this.approvalBox);
    this.noticeBox.classList.add('sv-hud-toast');

    this.hudVoice = node('div', 'sv-hud-voice');
    this.hudVoice.setAttribute('role', 'group');
    setDisplayAttribute(this.hudVoice, 'aria-label', msg('Voz rápida'));
    const quick = (iconName: string, label: DisplayText, onClick: () => void) => {
      const item = button('', 'sv-hud-round');
      item.append(monoIcon(iconName, 18));
      setDisplayAttribute(item, 'aria-label', label);
      setDisplayAttribute(item, 'title', label);
      item.addEventListener('click', onClick);
      this.hudVoice.append(item);
      return item;
    };
    this.hudMic = quick('micOff', msg('Micrófono'), () => {
      const media = this.view?.network.media;
      if (!media) return;
      if (!media.micEnabled) this.run(() => this.actions.toggleMicrophone());
      else this.actions.setMuted(!media.muted);
    });
    this.hudCamera=quick('camera',msg('Activar cámara'),()=>{this.actions.setCameraActivity('village');this.run(()=>this.actions.toggleGameCamera());});
    this.hudCamera.dataset.testid='world-camera';
    this.hudDeafen = quick('headphones', msg('Dejar de escuchar'), () => { if (this.view) this.actions.setDeafened(!this.view.network.media.deafened); });
    this.hudScreen = quick('screen', msg('Compartir pantalla'), () => {
      const phase = this.view?.network.media.screenPhase;
      if (phase && ['REQUESTING_OS_PERMISSION', 'CAPTURING_LOCAL', 'NEGOTIATING', 'SENDING'].includes(phase)) this.actions.stopScreen();
      else this.openPhone('voice');
    });

    this.phoneButton = button('', 'sv-phone-button');
    this.phoneButton.dataset.testid = 'phone-button';
    setDisplayAttribute(this.phoneButton, 'aria-label', msg('Abrir menú (M)'));
    setDisplayAttribute(this.phoneButton, "title", msg('Menú (M)'));
    this.phoneBadge = node('span', 'sv-phone-badge');
    this.phoneBadge.hidden = true;
    append(this.phoneButton, monoIcon('phone', 24), node('span', 'sv-phone-button-label', msg('Menú')), this.phoneBadge);
    this.phoneButton.addEventListener('click', () => (this.phone.hidden ? this.openPhone('home') : this.closePhone()));
    append(hud, topLeft, this.hudVoice, this.phoneButton);
    return hud;
  }

  private refreshHud(): void {
    const view = this.view!;
    const media = view.network.media;
    const joined = view.network.phase === 'JOINED';
    const here = view.network.members.filter((member) => member.connected).length;
    setText(this.statusBadge, joined ? `${here} ${here === 1 ? 'persona' : 'personas'} en la aldea` : PHASE_LABEL[view.network.phase]);
    const requests = (view.network.isHost ? view.network.pendingJoins.length : 0)
      + view.network.pendingVisits.filter((request) => request.houseId === view.identity.fingerprint).length+(view.network.workspace?.requests.length??0)+(view.network.friends?.incoming.length??0)+(view.network.voice?.invitations.length??0);
    show(this.phoneBadge, requests > 0);
    setText(this.phoneBadge, String(requests));
    const inOwnHouse = this.pane === 'house' && this.houseOwnerId === view.identity.fingerprint;
    setText(this.phoneHouseTile.querySelector('.sv-app-label')!, inOwnHouse ? msg('Salir') : msg('Mi casa'));
    show(this.hudVoice, joined && (this.pane === 'world' || this.pane === 'house'));
    const micLive = media.micEnabled && !media.muted;
    this.hudMic.replaceChildren(monoIcon(micLive ? 'mic' : 'micOff', 18));
    this.hudMic.classList.toggle('is-on', micLive);
    setDisplayAttribute(this.hudMic, "title", !media.micEnabled ? msg('Activar micrófono') : media.muted ? msg('Quitar silencio') : msg('Silenciar'));
    this.hudMic.setAttribute('aria-pressed', String(micLive));
    const cameraOn=!!view.network.gameCamera.local;this.hudCamera.classList.toggle('is-on',cameraOn);this.hudCamera.setAttribute('aria-pressed',String(cameraOn));setDisplayAttribute(this.hudCamera,'aria-label',msg(cameraOn?'Apagar cámara':'Activar cámara'));setDisplayAttribute(this.hudCamera,'title',msg(cameraOn?'Apagar cámara':'Activar cámara'));
    this.hudDeafen.classList.toggle('is-off', media.deafened);
    this.hudDeafen.setAttribute('aria-pressed', String(media.deafened));
    const sharing = ['REQUESTING_OS_PERMISSION', 'CAPTURING_LOCAL', 'NEGOTIATING', 'SENDING'].includes(media.screenPhase);
    this.hudScreen.classList.toggle('is-on', sharing);
    show(this.hudScreen,media.screenAvailable!==false||sharing);
    setDisplayAttribute(this.hudScreen, "title", sharing ? msg('Dejar de compartir pantalla') : msg('Compartir pantalla'));
    show(this.decorateHint, !inOwnHouse);
  }

  private buildMain(main: HTMLElement): void {
    this.noticeBox = node('div', 'sv-notice');
    this.noticeText = node('span');
    const closeNotice = button('×', 'sv-icon-button sv-notice-close');
    setDisplayAttribute(closeNotice, 'aria-label', msg('Cerrar aviso'));
    closeNotice.addEventListener('click', () => {
      this.dismissNotices();
    });
    const openRequest=button(msg('Ver solicitud'),'sv-link-button');openRequest.onclick=()=>{if(this.requestNoticeTarget)this.openPhone(this.requestNoticeTarget);this.dismissNotices();};openRequest.dataset.requestNotice='true';
    append(this.noticeBox, this.noticeText, openRequest, closeNotice);
    const heading = node('div', 'sv-page-heading');
    const headingCopy = node('div');
    this.title = node('h1', '', msg('La aldea'));
    this.subtitle = node('p', 'sv-subtle', msg('Un espacio tranquilo para estudiar a tu ritmo.'));
    append(headingCopy, this.title, this.subtitle);
    // Context action: from the board it returns to the room you were in, so
    // opening the board never strands you outside a friend's house.
    this.headingAction = button('', 'sv-hud-back');
    this.headingAction.addEventListener('click', () => {
      if (this.pane === 'board' && this.houseOwnerId) this.returnToRoom();
      else if (this.pane === 'board') this.navigate('world');
      else this.leaveCurrentHouse();
    });
    append(heading, this.headingAction, headingCopy);
    this.heading = heading;

    // Expandable Screen-Share Theater Dock
    this.screenTheater = node('section', 'sv-screen-theater');
    this.screenTheater.hidden = true;
    const theaterHead = node('div', 'sv-screen-theater-head');
    const theaterTitle = node('div', 'sv-screen-theater-title');
    append(theaterTitle, node('span', 'sv-private-dot'), node('span', '', msg('Escenario de pantalla compartida · Alta definición')));
    const theaterControls = node('div', 'sv-inline');
    const layoutToggle = button(msg('Vista: Destacada'), 'sv-button sv-button-small');
    layoutToggle.addEventListener('click', () => {
      this.screenLayoutMode = this.screenLayoutMode === 'spotlight' ? 'grid' : 'spotlight';
      setText(layoutToggle, this.screenLayoutMode === 'spotlight' ? msg('Vista: Destacada') : msg('Vista: Cuadrícula'));
      this.screenTheaterGrid.classList.toggle('is-spotlight', this.screenLayoutMode === 'spotlight');
    });
    const stopTheaterBtn = button(msg('Detener emisión'), 'sv-button sv-button-small sv-danger-text');
    stopTheaterBtn.addEventListener('click', () => this.actions.stopScreen());
    append(theaterControls, layoutToggle, stopTheaterBtn);
    append(theaterHead, theaterTitle, theaterControls);
    this.screenTheaterGrid = node('div', 'sv-screen-theater-grid is-spotlight');
    append(this.screenTheater, theaterHead, this.screenTheaterGrid);

    this.canvasPane = node('section', 'sv-stage-pane');
    const stageWrap = node('div', 'sv-canvas-wrap');
    this.stageCanvas = node('canvas', 'sv-canvas');
    // 2x HiDPI physical bitmap (1536x864) over logical 768x432 coordinates for crisp rendering
    this.stageCanvas.width = 1536;
    this.stageCanvas.height = 864;
    setDisplayAttribute(this.stageCanvas, 'aria-label', msg('Aldea interactiva'));
    this.stageCanvas.tabIndex = 0;
    this.stageCanvas.addEventListener('pointerdown', this.onStagePointerDown);
    this.stageCanvas.addEventListener('pointermove', this.onStagePointerMove);
    this.stageCanvas.addEventListener('pointerup', this.onStagePointerUp);
    this.stageCanvas.addEventListener('pointercancel', this.onStagePointerUp);
    append(stageWrap, this.stageCanvas);
    this.stageWrap = stageWrap;
    // Phone portrait only (CSS hides it elsewhere): zoom the screen that follows the player.
    const portraitZoom = node('div', 'sv-portrait-zoom');
    const portraitOut = button('−', 'sv-button sv-button-small');
    setDisplayAttribute(portraitOut, 'aria-label', msg('Alejar'));
    portraitOut.addEventListener('click', (e) => { e.stopPropagation(); this.setPortraitZoom(this.portraitZoom - PORTRAIT_ZOOM.step); });
    this.portraitZoomLabel = node('span', 'sv-portrait-zoom-label', `×${this.portraitZoom}`);
    const portraitIn = button('+', 'sv-button sv-button-small');
    setDisplayAttribute(portraitIn, 'aria-label', msg('Acercar'));
    portraitIn.addEventListener('click', (e) => { e.stopPropagation(); this.setPortraitZoom(this.portraitZoom + PORTRAIT_ZOOM.step); });
    for (const b of [portraitOut, portraitIn]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    append(portraitZoom, portraitOut, this.portraitZoomLabel, portraitIn);
    append(stageWrap, portraitZoom);
    this.buildTouchControls(stageWrap);
    append(this.canvasPane, stageWrap);
    this.expansion.mountStageControls(this.settingsSection('Ambiente'), this.shell);

    this.buildBoard();
    this.buildContacts();
    this.buildDiagnostics();
    append(main, this.screenTheater, this.canvasPane, this.boardPane, this.diagnosticsPane);
  }

  private buildBoard(): void {
    this.boardPane = node('section', 'sv-panel sv-board-pane');
    const boardBack=button(msg('← Volver'),'sv-button sv-board-back');
    setDisplayAttribute(boardBack,'aria-label',msg('Volver de la pizarra'));boardBack.dataset.testid='board-back';
    boardBack.onclick=()=>this.headingAction.click();this.boardPane.append(boardBack);
    const toolbar = node('div', 'sv-toolbar sv-board-primary');
    toolbar.setAttribute('role', 'group');
    setDisplayAttribute(toolbar, 'aria-label', msg('Herramientas de pizarra'));
    const tools = node('div', 'sv-segment');
    const extraTools = node('div', 'sv-segment sv-board-extra-tools');
    this.boardAdvancedPanel = node('section', 'sv-board-options-panel');
    this.boardAdvancedPanel.id = 'board-advanced-options';
    setDisplayAttribute(this.boardAdvancedPanel, 'aria-label', msg('Opciones avanzadas de pizarra'));
    this.boardAdvancedPanel.hidden = true;
    this.boardAdvancedToggle = button(msg('Más'), 'sv-button sv-button-small sv-board-more');
    setDisplayAttribute(this.boardAdvancedToggle, 'aria-label', msg('Opciones avanzadas'));
    this.boardAdvancedToggle.setAttribute('aria-expanded', 'false');
    this.boardAdvancedToggle.setAttribute('aria-controls', this.boardAdvancedPanel.id);
    this.boardAdvancedToggle.addEventListener('click', () => {
      this.commitBoardText();
      this.boardAdvancedPanel.hidden = !this.boardAdvancedPanel.hidden;
      this.boardAdvancedToggle.setAttribute('aria-expanded', String(!this.boardAdvancedPanel.hidden));
    });
    const labels: [BoardUiTool, DisplayText, DisplayText][] = [
      ['pen', msg('Lápiz'), msg('Dibujo libre')], ['text', msg('Texto'), msg('Texto y fórmulas: escribe $x^2$ para LaTeX')],
      ['eraser', msg('Borrador'), msg('Borra tus propios trazos pasando por encima')], ['select', msg('Seleccionar'), msg('Selecciona, mueve y copia objetos')], ['hand', msg('Mano'), msg('Mover la vista (también: botón central o rueda)')],
      ['line', msg('Línea'), msg('Línea recta')], ['rectangle', msg('Rectángulo'), msg('Rectángulo')],
    ];
    for (const [tool, label, hint] of labels) {
      const item = button(label, 'sv-segment-button');
      setDisplayAttribute(item, 'title', hint);
      item.addEventListener('click', () => {
        this.commitBoardText();
        this.prepareBoardToolChange();
        this.richBoardTool = null;
        this.boardTool = tool;
        this.refreshBoardControls();
      });
      item.dataset.boardTool=tool;
      this.boardToolButtons.set(tool, item);
      (MAIN_BOARD_TOOLS.includes(tool) ? tools : extraTools).append(item);
    }
    const richLabels: ['circle' | 'arrow', DisplayText, DisplayText][] = [
      ['circle', msg('Círculo'), msg('Dibuja un círculo en la pizarra')],
      ['arrow', msg('Flecha'), msg('Dibuja una flecha direccional en la pizarra')],
    ];
    for (const [rTool, rLabel, rHint] of richLabels) {
      const item = button(rLabel, 'sv-segment-button');
      setDisplayAttribute(item, 'title', rHint);
      item.dataset.testid = `board-tool-${rTool}`;
      item.addEventListener('click', () => {
        this.commitBoardText();
        this.prepareBoardToolChange();
        this.richBoardTool = rTool;
        this.refreshBoardControls();
      });
      this.richToolButtons.set(rTool, item);
      extraTools.append(item);
    }
    const eraserMode = select([
      { value: 'stroke', label: msg('Borrador de trazos') },
      { value: 'precision', label: msg('Borrador de precisión') },
    ]);
    setDisplayAttribute(eraserMode, 'aria-label', msg('Modo del borrador'));
    eraserMode.value = this.eraserPrefs.mode;
    eraserMode.onchange = () => { this.eraserPrefs.mode = eraserMode.value as 'stroke' | 'precision'; saveEraserPreferences(this.eraserPrefs); };
    const eraserSize = select([
      { value: '8', label: msg('Pequeño') }, { value: '16', label: msg('Mediano') }, { value: '32', label: msg('Grande') },
    ]);
    setDisplayAttribute(eraserSize, 'aria-label', msg('Tamaño del borrador'));
    eraserSize.value = String(this.eraserPrefs.diameter);
    eraserSize.onchange = () => { this.eraserPrefs.diameter = Number(eraserSize.value) as 8 | 16 | 32; saveEraserPreferences(this.eraserPrefs); this.lastBoardRenderSig = ''; };
    const eraserOptions = node('div', 'sv-eraser-options');
    append(eraserOptions, field(msg('Modo del borrador'), eraserMode), field(msg('Tamaño del borrador'), eraserSize), node('p', 'sv-tiny', msg('Trazos: borra el objeto entero. Precisión: borra solo la parte del dibujo que tocas; el texto se conserva.')));
    this.boardNameInput = node('input', 'sv-input');
    this.boardNameInput.maxLength = 40;
    setDisplayAttribute(this.boardNameInput, "placeholder", msg('Nombre de esta pizarra…'));
    this.boardNameInput.style.maxWidth = '175px';
    setDisplayAttribute(this.boardNameInput, 'aria-label', msg('Nombre de esta pizarra'));
    this.boardNameInput.dataset.testid = 'board-rename-input';
    this.boardNameInput.addEventListener('change', () => {
      const view = this.view;
      if (!view) return;
      const bId = this.boardId();
      const newName = this.boardNameInput.value.trim().slice(0, 40) || t('Pizarra');
      this.expansion.boardRegistry.ensureBoard(
        bId,
        newName,
        this.customBoardId ? this.currentArea : 'house',
        this.houseOwnerId || view.identity.fingerprint,
      );
      this.expansion.boardRegistry.renameBoard(
        bId,
        newName,
        view.identity.fingerprint,
        view.network.isHost,
      );
      if (!this.customBoardId && (!this.houseOwnerId || this.houseOwnerId === view.identity.fingerprint)) {
        const fId = this.activeBoardFurnitureId || 'board';
        const updated = setFurnitureAlias(this.ownDecoratedHouse(), fId, newName, view.identity.fingerprint);
        if (updated !== view.ownHouse) this.actions.updateOwnHouse(updated);
      }
      this.notify(t("Pizarra renombrada a «{p0}».", { p0: newName }));
      this.refreshBoardControls();
    });

    this.boardAccessSelect = select([
      { value: 'public_edit', label: msg('🔓 Edición compartida') },
      { value: 'view_only', label: msg('👁️ Solo lectura') },
      { value: 'owner_only', label: msg('🔒 Solo propietario') },
    ]);
    setDisplayAttribute(this.boardAccessSelect, 'aria-label', msg('Permisos de esta pizarra'));
    this.boardAccessSelect.dataset.testid = 'board-access-select';
    this.boardAccessSelect.addEventListener('change', () => {
      const view = this.view;
      if (!view) return;
      const bId = this.boardId();
      this.expansion.boardRegistry.setAccessLevel(
        bId,
        this.boardAccessSelect.value as BoardAccessLevel,
        view.identity.fingerprint,
        view.network.isHost,
      );
      this.refreshBoardControls();
    });
    this.boardColor = node('input', 'sv-color-input');
    this.boardColor.type = 'color';
    this.boardColor.value = '#1d1d1f';
    setDisplayAttribute(this.boardColor, 'aria-label', msg('Color del trazo'));
    this.boardColor.addEventListener('input', () => this.refreshBoardSwatches());
    const swatchRow = node('div', 'sv-swatch-row');
    for (const hex of BOARD_COLORS) {
      const swatch = button('', 'sv-color-swatch');
      swatch.style.backgroundColor = hex;
      setDisplayAttribute(swatch, "title", msg("Color {p0}", { p0: hex }));
      setDisplayAttribute(swatch, 'aria-label', msg("Color {p0}", { p0: hex }));
      swatch.addEventListener('click', () => {
        this.boardColor.value = hex;
        this.refreshBoardSwatches();
      });
      this.boardSwatchButtons.set(hex.toLowerCase(), swatch);
      swatchRow.append(swatch);
    }
    this.refreshBoardSwatches();

    this.boardWidth = select([{ value: '2', label: msg('Fino') }, { value: '4', label: msg('Medio') }, { value: '8', label: msg('Grueso') }]);
    setDisplayAttribute(this.boardWidth, 'aria-label', msg('Grosor del trazo'));
    this.boardUndoButton = button('↶', 'sv-button sv-button-small');
    setDisplayAttribute(this.boardUndoButton, 'aria-label', msg('↶ Deshacer'));
    setDisplayAttribute(this.boardUndoButton, "title", msg('Deshacer'));
    this.boardUndoButton.addEventListener('click', () => this.undoStroke());
    this.boardRedoButton = button(msg('↷ Rehacer'), 'sv-button sv-button-small');
    this.boardRedoButton.dataset.testid = 'board-redo-btn';
    this.boardRedoButton.addEventListener('click', () => this.redoStroke());
    // Two-step clear instead of a confirm() dialog, which would block the app.
    this.boardClearButton = button(msg('Borrar lo mío'), 'sv-button sv-button-small');
    this.boardClearButton.addEventListener('click', () => {
      if (!this.boardClearArmed) {
        this.boardClearArmed = true;
        this.refreshBoardControls();
        setTimeout(() => { this.boardClearArmed = false; this.refreshBoardControls(); }, 3_000);
        return;
      }
      this.boardClearArmed = false;
      this.clearOwnStrokes();
    });
    const zoom = node('div', 'sv-zoom');
    const zoomOut = button('−', 'sv-button sv-button-small');
    setDisplayAttribute(zoomOut, 'aria-label', msg('Alejar'));
    zoomOut.addEventListener('click', () => this.zoomBoard(1 / 1.25));
    this.boardZoomLabel = node('span', 'sv-zoom-label', '100%');
    const zoomIn = button('+', 'sv-button sv-button-small');
    setDisplayAttribute(zoomIn, 'aria-label', msg('Acercar'));
    zoomIn.addEventListener('click', () => this.zoomBoard(1.25));
    const fit = button(msg('Centrar'), 'sv-button sv-button-small');
    setDisplayAttribute(fit, "title", msg('Encuadrar todo lo dibujado'));
    fit.addEventListener('click', () => this.fitBoard());
    append(zoom, zoomOut, this.boardZoomLabel, zoomIn, fit);
    append(toolbar, tools, this.boardColor, this.boardUndoButton, this.boardAdvancedToggle);
    // Manual formulas remain available without AI.
    const latexBar = node('div', 'sv-latex-bar');
    append(latexBar, node('span', 'sv-field-label', msg('Inserción rápida LaTeX y estudio:')));
    const quickFormulas: [string, string][] = [
      [t('+ Nota de texto'), t('Apunte de estudio')],
      ['f(x) = x²', '$f(x) = x^2 + 2x + 1$'],
      [t('Fracción a/b'), '$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$'],
      ['Integral ∫', '$\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)$'],
      [t('Sumatorio ∑'), '$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$'],
      [t('Raíz √'), '$\\sqrt{a^2 + b^2}$'],
      [t('Matriz / Sistema'), '$\\alpha + \\beta = \\gamma$'],
    ];
    for (const [label, formula] of quickFormulas) {
      const chip = button(label, 'sv-latex-chip');
      chip.addEventListener('click', () => this.insertBoardFormula(formula));
      latexBar.append(chip);
    }
    const axesChip = button(msg('⊞ Ejes XY'), 'sv-latex-chip');
    setDisplayAttribute(axesChip, "title", msg('Dibujar ejes de coordenadas en el centro de la vista'));
    axesChip.addEventListener('click', () => this.insertCoordinateAxes());
    latexBar.append(axesChip);

    // Item 1: Multimodal AI Whiteboard Assistant ("Pizarra Inteligente")
    const aiBoardBar = node('div', 'sv-ai-board-bar');
    const aiBoardLabel = node('span', 'sv-field-label', msg('✨ IA en Pizarra:'));
    this.aiBoardPromptInput = node('input', 'sv-input sv-ai-board-input');
    setDisplayAttribute(this.aiBoardPromptInput, "placeholder", msg('Tema, ecuación o duda (ej. ecuación cuadrática, integral)…'));
    this.aiBoardPromptInput.maxLength = 160;
    setDisplayAttribute(this.aiBoardPromptInput, 'aria-label', msg('Consulta para IA en pizarra'));
    this.aiBoardPromptInput.dataset.testid = 'ai-board-prompt';
    const aiLatexBtn = button(msg('✨ Pasar a LaTeX'), 'sv-button sv-button-small sv-button-primary');
    aiLatexBtn.dataset.testid = 'ai-board-latex-btn';
    setDisplayAttribute(aiLatexBtn, "title", msg('Convierte los trazos o apuntes de la pizarra en una fórmula LaTeX limpia y la publica en la pizarra'));
    aiLatexBtn.addEventListener('click', () => this.runBoardAiLatex());
    const aiTutorStepsBtn = button(msg('✨ Explicar paso a paso'), 'sv-button sv-button-small');
    aiTutorStepsBtn.dataset.testid = 'ai-board-tutor-btn';
    setDisplayAttribute(aiTutorStepsBtn, "title", msg('Analiza la pizarra y añade notas adhesivas con la explicación paso a paso sin borrar tu capa'));
    aiTutorStepsBtn.addEventListener('click', () => this.runBoardAiTutor('steps'));
    const aiTutorHintBtn = button(msg('💡 Dar pista'), 'sv-button sv-button-small');
    aiTutorHintBtn.dataset.testid = 'ai-board-hint-btn';
    setDisplayAttribute(aiTutorHintBtn, "title", msg('Inserta una pista socrática en la pizarra'));
    aiTutorHintBtn.addEventListener('click', () => this.runBoardAiTutor('hint'));
    append(aiBoardBar, aiBoardLabel, this.aiBoardPromptInput, aiLatexBtn, aiTutorStepsBtn, aiTutorHintBtn);

    const wrap = node('div', 'sv-canvas-wrap sv-board-wrap');
    this.boardWrap = wrap;
    this.boardCanvas = node('canvas', 'sv-canvas');
    // 2x HiDPI resolution (1536x864) for crisp strokes, text, and LaTeX formulas
    this.boardCanvas.width = 1536;
    this.boardCanvas.height = 864;
    setDisplayAttribute(this.boardCanvas, 'aria-label', msg('Pizarra para dibujar'));
    this.boardCanvas.addEventListener('pointerdown', this.onBoardPointerDown);
    this.boardCanvas.addEventListener('pointermove', this.onBoardPointerMove);
    this.stopBoardSurface=installDrawingSurface(this.boardCanvas);
    window.addEventListener('pointerup', this.onBoardPointerUp);
    window.addEventListener('pointercancel', this.onBoardPointerUp);
    document.addEventListener('visibilitychange',this.boardHidden);window.addEventListener('orientationchange',this.boardRotated);
    this.boardCanvas.addEventListener('lostpointercapture', this.onBoardPointerUp);
    this.boardCanvas.addEventListener('pointerleave', () => { this.boardCursor = null; });
    this.boardCanvas.addEventListener('wheel', this.onBoardWheel, { passive: false });
    this.boardCanvas.addEventListener('auxclick', (event) => event.preventDefault());
    wrap.append(this.boardCanvas);
    this.boardEditor = new BoardEditor({ wrap, canvas:this.boardCanvas, board:()=>this.boardId(), author:()=>this.view?.identity.fingerprint||'', strokes:()=>visibleStrokes(this.allStrokes(this.boardId()),this.boardId(),this.hiddenAuthors), all:()=>this.allStrokes(this.boardId()), canEdit:()=>this.canDrawBoard(),moderate:()=>this.moderatesBoard(), camera:()=>this.boardCamera(), world:e=>this.boardWorldPoint(e), changed:()=>{this.lastBoardRenderSig='';this.boardExtraFrames=3;this.scheduleBoardControls();},notify:message=>this.notify(message),commit:changes=>this.commitBoardChanges(changes) });
    this.boardCanvas.addEventListener('dblclick',event=>{if(this.boardTool==='text'||this.boardTool==='select'){event.preventDefault();this.boardEditor.editAt(this.boardWorldPoint(event));}});

    const bottom = node('div', 'sv-board-bottom');
    this.boardStatus = node('p', 'sv-subtle');
    const exportGroup = node('div', 'sv-inline');
    this.boardExportMode = select([
      { value: 'all', label: msg('Todas las capas') }, { value: 'visible', label: msg('Capas visibles') },
    ]);
    setDisplayAttribute(this.boardExportMode, 'aria-label', msg('Capas que se exportarán'));
    const exportButton = button(msg('↓ Exportar PNG'), 'sv-button sv-button-small');
    exportButton.addEventListener('click', () => this.exportBoard());
    append(exportGroup, this.boardExportMode, exportButton);
    append(bottom, this.boardStatus);
    this.boardLayers = node('div', 'sv-layers');
    const hint = node('p', 'sv-tiny sv-board-hint',
      msg('Rueda: desplazar · Ctrl + rueda: zoom · Texto: haz clic en cualquier punto o usa los botones LaTeX ($\\frac{a}{b}$) · Borrador: arrastra sobre tus trazos.'));
    const category = (title: DisplayText, ...children: HTMLElement[]): HTMLDetailsElement => {
      const group = node('details', 'sv-board-option-group sv-board-category');
      group.name = 'board-options-category';
      const summary = node('summary', '', title);
      const content = node('div', 'sv-board-category-content');
      append(content, ...children);
      append(group, summary, content);
      return group;
    };
    this.pencilModeInput=node('input');this.pencilModeInput.type='checkbox';this.pencilModeInput.checked=this.pencilMode;
    setDisplayAttribute(this.pencilModeInput,'aria-label',msg('Modo lápiz'));this.pencilModeInput.dataset.testid='board-pencil-mode';
    this.pencilModeInput.onchange=()=>setPencilMode(this.pencilModeInput.checked);
    const pencilModeLabel=node('label','sv-pencil-mode');pencilModeLabel.append(this.pencilModeInput,node('span','',msg('Modo lápiz')));
    const pencilOptions=node('div','sv-pencil-mode-option');pencilOptions.append(pencilModeLabel,node('p','sv-tiny',msg('El lápiz escribe y borra. Los dedos mueven, amplían y seleccionan sin dibujar ni borrar.')));
    this.offPencilMode=subscribePencilMode(enabled=>{this.pencilMode=enabled;this.pencilModeInput.checked=enabled;this.cancelBoardGesture(false);this.startBoardTouch();});
    append(this.boardAdvancedPanel,pencilOptions,
      category(msg('Formas'), extraTools),
      category(msg('Trazo y edición'), swatchRow, field(msg('Grosor'), this.boardWidth), eraserOptions, this.boardRedoButton, this.boardClearButton),
      category(msg('Vista'), zoom, hint),
      category(msg('Fórmulas'), latexBar),
      category(msg('Asistente IA'), aiBoardBar),
      category(msg('Capas'), this.boardLayers, bottom),
      category(msg('Pizarra y archivo'), field(msg('Nombre'), this.boardNameInput), field(msg('Permisos'), this.boardAccessSelect), exportGroup),
    );
    this.boardReadOnlyStatus = node('p', 'sv-board-readonly');
    this.boardReadOnlyStatus.setAttribute('role', 'status');
    this.boardReadOnlyStatus.hidden = true;
    append(this.boardPane, toolbar, this.boardAdvancedPanel, this.boardReadOnlyStatus, wrap);
  }

  private buildContacts(): void {
    this.contactsPane = node('section', 'sv-panel');
    const intro = node('div', 'sv-panel-intro');
    append(intro, node('div', 'sv-eyebrow', msg('TU AGENDA')), node('h2', '', msg('Personas de confianza')),
      node('p', 'sv-subtle', msg('Comparte tu tarjeta pública o añade contactos desde un archivo. Tu clave privada nunca aparece en la tarjeta.')));
    const codeCard = node('div', 'sv-contact-code');
    append(codeCard, node('span', 'sv-field-label', msg('MI CÓDIGO DE AMISTAD')));
    this.friendCodeValue = node('strong', 'sv-friend-code');
    codeCard.append(this.friendCodeValue);
    const codeButtons = node('div', 'sv-inline');
    const exportButton = button(msg('↓ Exportar mi tarjeta'), 'sv-button sv-button-primary');
    exportButton.addEventListener('click', () => this.run(() => this.actions.exportContact()));
    const rotateButton = button(msg('Renovar código'), 'sv-button sv-button-outline');
    rotateButton.addEventListener('click', () => this.run(() => this.actions.rotateFriendCode()));
    const shareButton=button(msg('Enviar tarjeta por WhatsApp'),'sv-button sv-button-primary sv-contact-share');
    shareButton.onclick=()=>this.run(()=>this.actions.shareContact());
    append(codeButtons, exportButton, rotateButton,shareButton);
    codeCard.append(codeButtons);
    const importCard = node('div', 'sv-contact-import');
    append(importCard, node('h3', '', msg('Enviar solicitud de amistad')), node('p', 'sv-subtle', msg('Selecciona una tarjeta .json que te haya enviado esa persona.')));
    this.importInput = node('input', 'sv-file-input');
    this.importInput.type = 'file';
    this.importInput.accept = '.json,application/json';
    setDisplayAttribute(this.importInput, 'aria-label', msg('Importar contacto'));
    this.importInput.addEventListener('change', () => {
      const file = this.importInput.files?.[0];
      if (file) this.run(() => this.actions.importContact(file));
      this.importInput.value = '';
    });
    importCard.append(this.importInput);
    this.contactsList = node('div', 'sv-contact-list');
    this.sessionContacts=node('div','sv-session-contacts');
    append(this.contactsPane, intro, codeCard, this.sessionContacts, importCard, node('h3', 'sv-section-title', msg('Contactos guardados')), this.contactsList);
  }

  private buildDiagnostics(): void {
    this.diagnosticsPane = node('section', 'sv-panel');
    const back=button(msg('← Volver al juego'),'sv-button');back.dataset.testid='diagnostics-back';back.onclick=()=>this.leaveDiagnostics();this.diagnosticsPane.append(back);
    append(this.diagnosticsPane, node('div', 'sv-eyebrow', msg('COMPROBACIONES LOCALES')),
      node('h2', '', msg('Diagnóstico')),
      node('p', 'sv-subtle', msg('Estas pruebas muestran lo que se ha observado en este equipo. Las pruebas no verificadas siguen marcadas como tales.')));
    const controls = node('div', 'sv-diagnostic-controls');
    const items: [DiagnosticKind, DisplayText][] = [
      ['capabilities', msg('Capacidades')], ['microphone', msg('Micrófono')], ['screen', msg('Pantalla')],
      ['stop', msg('Detener captura')], ['loopback', msg('Bucle local')],
    ];
    for (const [kind, label] of items) {
      const item = button(label, 'sv-button sv-button-outline');
      item.addEventListener('click', () => this.run(() => this.actions.runDiagnostic(kind)));
      controls.append(item);
    }
    this.diagnosticList = node('div', 'sv-diagnostic-list');
    const standalone = node('a', 'sv-link-button', msg('Abrir diagnóstico con vista previa y exportación ↗'));
    standalone.href = '?diagnostic=1'; standalone.target = '_blank'; standalone.rel = 'noopener noreferrer';
    append(this.diagnosticsPane, controls, standalone, this.diagnosticList);
  }

  private buildInspector(): void {
    const context = node('section', 'sv-context-card');
    this.contextTitle = node('h3');
    this.contextText = node('p', 'sv-subtle');
    append(context, this.contextTitle, this.contextText);
    this.housesList = node('div', 'sv-house-list');
    this.peopleList = node('div', 'sv-people-list');
    append(context, this.housesList, this.peopleList);

    this.approvalBox = node('section', 'sv-approval-card');
    this.approvalBox.setAttribute('role', 'status');
    const approvalHead = node('div', 'sv-approval-head');
    const hideApprovals = button('×', 'sv-icon-button sv-notice-close');
    setDisplayAttribute(hideApprovals, 'aria-label', msg('Cerrar aviso'));
    hideApprovals.addEventListener('click', () => {
      const view = this.view; if (!view) return;
      for (const id of this.approvalIds(view)) this.hiddenApprovals.add(id);
      this.refresh();
    });
    append(approvalHead, node('strong', 'sv-approval-title', msg('Llaman a la puerta')), hideApprovals);
    append(this.approvalBox, approvalHead);
    this.approvalList = node('div', 'sv-approval-list');
    this.approvalBox.append(this.approvalList);

    this.buildHouseEditor();
    this.buildMedia();
    const identityCard = node('section', 'sv-stack');
    append(identityCard, node('h3', '', msg('Identidad protegida')));
    this.unlockToggleButton = button(msg('Desbloquear identidad'), 'sv-button sv-button-small');
    this.unlockToggleButton.addEventListener('click', () => { this.settingsDialog.close(); this.lockDismissed = false; this.refresh(); this.unlockInput.focus(); });
    identityCard.append(this.unlockToggleButton);
    this.identityStatus = node('p', 'sv-subtle');
    identityCard.append(this.identityStatus);
    const saveForm = node('form', 'sv-stack');
    this.saveIdentityInput = node('input', 'sv-input');
    this.saveIdentityInput.type = 'password';
    this.saveIdentityInput.autocomplete = 'new-password';
    this.saveIdentityInput.minLength = 12;
    this.saveIdentityInput.required = true;
    this.saveIdentityButton = button(msg('Cifrar y guardar'), 'sv-button sv-button-small');
    this.saveIdentityButton.type = 'submit';
    append(saveForm, field(msg('Contraseña (12+ caracteres)'), this.saveIdentityInput), this.saveIdentityButton);
    saveForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const passphrase = this.saveIdentityInput.value;
      this.run(() => this.actions.saveIdentity(passphrase));
      this.saveIdentityInput.value = '';
    });
    identityCard.append(saveForm,identityTransferControls(this.actions),backupControls(this.actions));
    this.villageCard = context;
    const diagnostics = node('a', 'sv-link-button', msg('Diagnóstico de micrófono y pantalla'));
    diagnostics.href = '#diagnostics';
    diagnostics.onclick = event => { event.preventDefault(); this.settingsDialog.close(); this.navigate('diagnostics'); };
    append(this.settingsSection('Identidad'), identityCard); this.settingsSection('Controles').append(diagnostics);
  }

  private buildHouseEditor(): void {
    this.houseEditBox = node('section', 'sv-house-editor');
    this.houseNameInput = node('input', 'sv-input');
    this.houseNameInput.maxLength = 32;
    this.houseNameInput.addEventListener('change', () => this.patchOwnHouse({ name: this.houseNameInput.value.trim().slice(0, 32) || 'Mi casa' }));
    this.houseAccessSelect = select([
      { value: 'open', label: msg('Puerta abierta') }, { value: 'ask', label: msg('Pedir permiso') }, { value: 'locked', label: msg('Cerrada') },
    ]);
    this.houseAccessSelect.addEventListener('change', () => this.patchOwnHouse({ access: this.houseAccessSelect.value as PublicHouse['access'] }));
    this.houseThemeSelect = select([{ value: 'mint', label: msg('Menta') }, { value: 'peach', label: msg('Melocotón') }]);
    this.houseThemeSelect.addEventListener('change', () => this.patchOwnHouse({ theme: this.houseThemeSelect.value as PublicHouse['theme'] }));
    append(this.houseEditBox, field(msg('Nombre público'), this.houseNameInput), field(msg('Acceso'), this.houseAccessSelect), field(msg('Ambiente'), this.houseThemeSelect));
    const furnitureHeader = node('div', 'sv-list-heading');
    this.furnitureCount = node('span', 'sv-tiny');
    append(furnitureHeader, node('strong', '', msg('Muebles')), this.furnitureCount);
    this.furnitureList = node('div', 'sv-furniture-list');
    this.furnitureKindSelect = select(FURNITURE_KINDS.map((kind) => ({ value: kind, label: msg(FURNITURE_LABELS[kind]) })));
    const addButton = button(msg('+ Añadir'), 'sv-button sv-button-small');
    addButton.addEventListener('click', () => {
      const view = this.view;
      if (!view) return;
      if(this.localPosition.space?.roomId===null&&!isFloorDecoration(this.furnitureKindSelect.value as FurnitureKind))return;
      const house = addFurniture(this.ownDecoratedHouse(), this.furnitureKindSelect.value as FurnitureKind, view.identity.fingerprint, crypto.randomUUID());
      if (house === this.ownDecoratedHouse()) this.notify(t('La casa ya tiene el máximo de 32 muebles.'));
      else { this.selectedFurnitureId = house.furniture[house.furniture.length - 1].id; this.commitDecoration(house, this.selectedFurnitureId); }
    });
    const addRow = node('div', 'sv-inline');
    this.kindSpritePreview=node('canvas','sv-selected-sprite');this.kindSpritePreview.width=120;this.kindSpritePreview.height=90;this.kindSpriteDescription=node('small');this.furnitureKindSelect.addEventListener('change',()=>this.refreshFurnitureKindPreview());
    append(addRow,this.kindSpritePreview,this.furnitureKindSelect, addButton,this.kindSpriteDescription);
    this.furnitureDetail = node('div', 'sv-furniture-detail');
    this.furnitureUseButton = button(msg('⚡ Usar mueble (E)'), 'sv-button sv-button-small sv-button-primary sv-wide');
    this.furnitureUseButton.style.marginBottom = '8px';
    this.furnitureUseButton.addEventListener('click', () => {
      const view = this.view;
      if (!view || !this.selectedFurnitureId) return;
      const item = this.ownDecoratedHouse().furniture.find((f) => f.id === this.selectedFurnitureId);
      if (item) this.interactWithFurniture(item);
    });
    this.aliasInput = node('input', 'sv-input');
    this.aliasInput.maxLength = 40;
    setDisplayAttribute(this.aliasInput, "placeholder", msg('Nombre público opcional'));
    this.aliasInput.addEventListener('change', () => {
      const view = this.view;
      if (!view || !this.selectedFurnitureId) return;
      const item = this.ownDecoratedHouse().furniture.find((f) => f.id === this.selectedFurnitureId);
      const updated = setFurnitureAlias(this.ownDecoratedHouse(), this.selectedFurnitureId, this.aliasInput.value, view.identity.fingerprint);
      if (updated !== this.ownDecoratedHouse()) this.actions.updateOwnHouse(updated);
      if(item)this.syncFurnitureName({...item,publicAlias:this.aliasInput.value.trim()});
    });

    // Custom furniture color & sprite upload
    const customRow = node('div', 'sv-furniture-actions');
    this.furnitureColorInput = node('input', 'sv-color-input');
    this.furnitureColorInput.type = 'color';
    this.furnitureColorInput.value = '#a67b51';
    setDisplayAttribute(this.furnitureColorInput, "title", msg('Cambiar color de este tipo de mueble'));
    this.furnitureColorInput.addEventListener('input', () => {
      const item = (this.view ? this.ownDecoratedHouse() : undefined)?.furniture.find((f) => f.id === this.selectedFurnitureId);
      if(item){if(this.localPosition.space){const house=this.ownDecoratedHouse();this.actions.updateOwnHouse({...house,furniture:house.furniture.map(f=>f.id===item.id?{...f,color:this.furnitureColorInput.value}:f)});}else setFurnitureCustomColor(item.kind,this.furnitureColorInput.value);}
    });
    const spriteInput = node('input');
    spriteInput.type = 'file';
    spriteInput.accept = 'image/png,image/webp,image/jpeg';
    spriteInput.hidden = true;
    spriteInput.addEventListener('change', () => {
      const file = spriteInput.files?.[0];
      const item = (this.view ? this.ownDecoratedHouse() : undefined)?.furniture.find((f) => f.id === this.selectedFurnitureId);
      if (!file || !item) return;
      if (file.size > 512 * 1024) {
        this.notify(t('El sprite supera el límite de 512 KB.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === 'string') {
          if(!await confirmSprite(reader.result).catch(()=>{this.notify(t('No se pudo leer la imagen.'));return false;}))return;
          if (item.kind === 'board') {
            const bId = this.localBoardFor(item.id);
            this.expansion.boardRegistry.ensureBoard(bId, item.publicAlias || 'Pizarra de estudio', 'house', this.view!.identity.fingerprint);
            this.expansion.boardRegistry.setBoardSprite(bId, reader.result, this.view!.identity.fingerprint, true);
          } else {
            if(!this.applyFurnitureSprite(item,reader.result))return;
          }
          this.lastStageRenderSig = '';
          this.notify(t("Sprite personalizado aplicado a {p0}{p1}.", { p0: t(FURNITURE_LABELS[item.kind]), p1: item.publicAlias ? ` (${defaultText(item.publicAlias)})` : '' }));
        }
      };
      reader.readAsDataURL(file);
      spriteInput.value = '';
    });
    const uploadSpriteBtn = button(msg('Sprite PNG'), 'sv-button sv-button-small');
    setDisplayAttribute(uploadSpriteBtn, "title", msg('Subir imagen PNG personalizada para este mueble'));
    uploadSpriteBtn.addEventListener('click', () => spriteInput.click());
    const resetAssetBtn = button(msg('Restaurar'), 'sv-button sv-button-small');
    setDisplayAttribute(resetAssetBtn, "title", msg('Restaurar aspecto original del mueble'));
    resetAssetBtn.addEventListener('click', () => {
      const item = (this.view ? this.ownDecoratedHouse() : undefined)?.furniture.find((f) => f.id === this.selectedFurnitureId);
      if (item) {
        if(this.localPosition.space){const house=this.ownDecoratedHouse();this.actions.updateOwnHouse({...house,furniture:house.furniture.map(f=>{if(f.id!==item.id)return f;const{sprite,color,...base}=f;return base;})});}else setFurnitureCustomColor(item.kind, null);
        if (item.kind === 'board') {
          this.expansion.boardRegistry.setBoardSprite(this.localBoardFor(item.id), null, this.view!.identity.fingerprint, true);
        } else {
          if(!this.localPosition.space)setFurnitureCustomSprite(item.kind, null);
        }
        this.lastStageRenderSig = '';
        this.notify(t("Aspecto original restaurado para {p0}.", { p0: t(FURNITURE_LABELS[item.kind]) }));
      }
    });
    this.selectedSpritePreview=node('canvas','sv-selected-sprite');this.selectedSpritePreview.width=160;this.selectedSpritePreview.height=120;setDisplayAttribute(this.selectedSpritePreview,'aria-label',msg('Aspecto actual del objeto'));
    append(customRow, this.selectedSpritePreview,this.furnitureColorInput, uploadSpriteBtn, resetAssetBtn, spriteInput);

    // Item 3: AI Pixel-Art Sprite Generator & Furniture AI Actions
    const aiSpriteBox = node('div', 'sv-ai-sprite-box'); aiSpriteBox.dataset.aiFeature = 'sprites';
    const aiSpriteHead = node('span', 'sv-field-label', msg('✨ Generador Pixel-Art IA (32×32)'));
    const aiSpriteRow = node('div', 'sv-ai-sprite-row');
    this.aiSpritePromptInput = node('input', 'sv-input');
    this.aiSpritePromptInput.maxLength = 48;
    setDisplayAttribute(this.aiSpritePromptInput, "placeholder", msg('Describe el aspecto del mueble'));
    setDisplayAttribute(this.aiSpritePromptInput, 'aria-label', msg('Descripción para generar sprite pixel-art'));
    this.aiSpritePromptInput.dataset.testid = 'ai-sprite-prompt';
    const aiSpriteBtn = button(msg('✨ Sprite IA'), 'sv-button sv-button-small sv-button-primary');
    aiSpriteBtn.dataset.testid = 'ai-sprite-btn';
    setDisplayAttribute(aiSpriteBtn, "title", msg('Sintetiza un sprite pixel-art 32×32 con la paleta de StudyVillage'));
    aiSpriteBtn.addEventListener('click', () => this.runFurnitureSpriteGenerator());
    this.aiSpritePreview = node('img', 'sv-ai-sprite-preview');
    setDisplayAttribute(this.aiSpritePreview, "alt", msg('Vista previa del sprite pixel-art'));
    this.aiSpritePreview.hidden = true;
    append(aiSpriteRow, this.aiSpritePromptInput, aiSpriteBtn, this.aiSpritePreview);

    const furnitureAiRow = node('div', 'sv-furniture-actions');
    const houseQuizBtn = button(msg('📚 Tarjetas / Quiz IA'), 'sv-button sv-button-small');
    setDisplayAttribute(houseQuizBtn, "title", msg('Abrir estudio de tarjetas y autoevaluación IA de la librería'));
    houseQuizBtn.addEventListener('click', () => this.openStudyAiModal());
    append(furnitureAiRow, houseQuizBtn);
    append(aiSpriteBox, aiSpriteHead, aiSpriteRow, furnitureAiRow);

    const deleteButton = button(msg('Quitar mueble'), 'sv-link-button sv-danger-text');
    deleteButton.addEventListener('click', () => {
      const view = this.view;
      if (!view || !this.selectedFurnitureId) return;
      const updated = deleteFurniture(this.ownDecoratedHouse(), this.selectedFurnitureId, view.identity.fingerprint);
      if (updated !== this.ownDecoratedHouse()) this.commitDecoration(updated, this.selectedFurnitureId);
      this.selectedFurnitureId = null;
      this.refresh();
    });
    this.guideTextInput=node('textarea','sv-input');this.guideTextInput.maxLength=320;this.guideTextInput.rows=4;
    setDisplayAttribute(this.guideTextInput,'aria-label',msg('Diálogo del guía'));
    this.guideTextInput.onchange=()=>{const h=this.ownDecoratedHouse();if(this.selectedFurnitureId)this.commitDecoration({...h,furniture:h.furniture.map(f=>f.id===this.selectedFurnitureId?{...f,guideText:this.guideTextInput.value.trim()}:f)},this.selectedFurnitureId);};
    this.guideTextField=field(msg('Diálogo del guía'),this.guideTextInput);
    this.frameToggle=node('input');this.frameToggle.type='checkbox';
    this.frameToggle.onchange=()=>{const h=this.ownDecoratedHouse();this.actions.updateOwnHouse({...h,furniture:h.furniture.map(f=>f.id===this.selectedFurnitureId?{...f,showFrame:this.frameToggle.checked}:f)});};
    this.frameField=field(msg('Mostrar marco'),this.frameToggle);
    append(this.furnitureDetail,this.guideTextField,this.frameField, this.furnitureUseButton, field(msg('Alias visible para todos'), this.aliasInput),
      node('span', 'sv-field-label', msg('Aspecto modificable (color / PNG)')), node('small','',msg('Imagen de objeto · PNG, WebP o JPEG · hasta 512 KB. Se ajusta al tamaño del objeto.')),customRow, aiSpriteBox, deleteButton);
    const enterDecor = this.enterDecorationButton = button(msg('Decorar en la habitación'), 'sv-button sv-button-primary');
    enterDecor.onclick = () => this.beginDecoration();
    const catalog = this.furnitureCatalog = node('div', 'sv-furniture-catalog');
    for (const kind of FURNITURE_KINDS) {
      const tile = button('', 'sv-button'); tile.dataset.furnitureKind=kind; setDisplayAttribute(tile, 'aria-label', msg("Colocar {p0}", { p0: msg(FURNITURE_LABELS[kind]) }));
      const canvas = node('canvas'); canvas.width = 100; canvas.height = 90; drawFurniturePreview(canvas.getContext('2d')!, kind);
      append(tile, canvas, node('span', '', msg(FURNITURE_LABELS[kind])),node('small','',msg(FURNITURE_DESCRIPTIONS[kind])));
      tile.onclick = () => this.beginDecoration(kind); catalog.append(tile);
    }
    const advanced = node('details'); append(advanced, node('summary', '', msg('Más opciones de muebles')), furnitureHeader, this.furnitureList, addRow, this.furnitureDetail);
    append(this.houseEditBox, enterDecor, node('p','sv-subtle',msg('En modo decoración, arrastra las puertas para mover las entradas a plantas y habitaciones.')), catalog, advanced);
    this.decorationToolbar = node('div', 'sv-decoration-toolbar'); this.decorationToolbar.hidden = true;
    this.decorationToolbar.setAttribute('role', 'group'); setDisplayAttribute(this.decorationToolbar, 'aria-label', msg('Decorar habitación'));
    const catalogButton = button(msg('Catálogo'), 'sv-button'); catalogButton.onclick = () => this.openPhone('decorate');
    this.editGuideButton=button(msg('Editar texto'),'sv-button');this.editGuideButton.onclick=()=>this.openGuideText();
    this.renameFurnitureButton=button(msg('Cambiar nombre'),'sv-button');this.renameFurnitureButton.onclick=()=>this.openFurnitureName();
    const rotate = button(msg('Girar'), 'sv-button'); rotate.onclick = () => {
      const house = (this.view ? this.ownDecoratedHouse() : undefined); const item = house?.furniture.find(f => f.id === this.selectedFurnitureId);
      if (!house || !item) { this.notify(t('Selecciona un mueble.')); return; }
      const next = { ...house, revision: house.revision + 1, furniture: house.furniture.map(f => f.id === item.id ? { ...f, rotation: (((f.rotation || 0) + 90) % 360) as 0 | 90 | 180 | 270 } : f) };
      this.commitDecoration(next, item.id);
    };
    setDisplayAttribute(rotate,'title',msg('Cambiar orientación'));
    const remove = button(msg('Retirar'), 'sv-button'); remove.onclick = () => { const h = (this.view ? this.ownDecoratedHouse() : undefined); if (h && this.selectedFurnitureId) this.commitDecoration(deleteFurniture(h, this.selectedFurnitureId, h.ownerId), this.selectedFurnitureId); };
    const undo = button(msg('Deshacer'), 'sv-button'); undo.onclick = () => { const h = (this.view ? this.ownDecoratedHouse() : undefined); if (h) { const previous = this.decorationHistory.undo(h); if (previous) this.actions.updateOwnHouse(previous); } };
    const redo = button(msg('Rehacer'), 'sv-button'); redo.onclick = () => { const h = (this.view ? this.ownDecoratedHouse() : undefined); if (h) { const next = this.decorationHistory.redo(h); if (next) this.actions.updateOwnHouse(next); } };
    const grid = button(msg('Cuadrícula: sí'), 'sv-button'); grid.onclick = () => { this.decorationGrid = !this.decorationGrid; setDisplayText(grid, msg("Cuadrícula: {p0}", { p0: this.decorationGrid ? msg('sí') : msg('no') })); this.lastStageRenderSig = ''; };
    const done = button(msg('Terminar'), 'sv-button sv-button-primary'); done.onclick = () => this.endDecoration();
    append(this.decorationToolbar, catalogButton, this.renameFurnitureButton,this.editGuideButton, rotate, remove, undo, redo, grid, done);
    this.furnitureNameDialog=node('dialog','sv-furniture-name');setDisplayAttribute(this.furnitureNameDialog,'aria-label',msg('Nombre del mueble'));
    const form=node('form');this.furnitureNameInput=node('input','sv-input');this.furnitureNameInput.maxLength=40;this.furnitureNameInput.autocomplete='off';setDisplayAttribute(this.furnitureNameInput,'aria-label',msg('Nombre del mueble'));
    const cancel=button(msg('Cancelar'),'sv-button');cancel.onclick=()=>this.furnitureNameDialog.close();const save=button(msg('Guardar'),'sv-button sv-button-primary');save.type='submit';const actions=node('div','sv-inline');actions.append(cancel,save);
    form.append(node('h3','',msg('Nombre del mueble')),this.furnitureNameInput,actions);
    form.onsubmit=event=>{event.preventDefault();const house=this.ownDecoratedHouse();if(!this.furnitureNameTarget||!house.furniture.some(item=>item.id===this.furnitureNameTarget))return;this.decorationHistory.remember(house);const updated=setFurnitureAlias(house,this.furnitureNameTarget,this.furnitureNameInput.value.trim(),house.ownerId);this.actions.updateOwnHouse(updated);this.syncFurnitureName(updated.furniture.find(item=>item.id===this.furnitureNameTarget)!);this.furnitureNameDialog.close();};
    this.furnitureNameDialog.append(form);this.furnitureNameDialog.addEventListener('close',()=>{this.furnitureNameTarget=null;this.stageCanvas.focus();});
    this.shell.append(this.decorationToolbar,this.furnitureNameDialog);
  }

  private buildMedia(): void {
    this.mediaBox = node('section', 'sv-media-card');
    this.mediaEyebrow = node('div', 'sv-eyebrow', msg('EN LA ALDEA'));
    append(this.mediaBox, this.mediaEyebrow);
    this.privateBox = node('div', 'sv-private');
    this.voicePanel = new VoicePanel(this.actions);
    this.privateBox.append(this.voicePanel.root);
    this.mediaAudience = node('p', 'sv-subtle');
    this.mediaStatus = node('p', 'sv-tiny');
    this.mediaError = node('p', 'sv-error');

    const meterWrap = node('div', 'sv-mic-meter-wrap');
    const meterBar = node('div', 'sv-mic-meter-bar');
    this.micMeterFill = node('div', 'sv-mic-meter-fill');
    meterBar.append(this.micMeterFill);
    append(meterWrap, node('span', 'sv-field-label', msg('Voz')), meterBar);

    const controls = node('div', 'sv-media-controls');
    this.micButton = button(msg('Activar micro'), 'sv-button sv-button-small');
    this.micButton.addEventListener('click', () => this.run(() => this.actions.toggleMicrophone()));
    this.muteButton = button(msg('Silenciar'), 'sv-button sv-button-small');
    this.muteButton.addEventListener('click', () => { if (this.view) this.actions.setMuted(!this.view.network.media.muted); });
    this.deafenButton = button(msg('No escuchar'), 'sv-button sv-button-small');
    this.deafenButton.addEventListener('click', () => { if (this.view) this.actions.setDeafened(!this.view.network.media.deafened); });
    this.pttButton = button(msg('Pulsar para hablar'), 'sv-button sv-button-small');
    this.pttButton.addEventListener('click', () => { if (this.view) this.actions.setPushToTalk(!this.view.network.media.pushToTalk); });
    this.screenButton = button(msg('Compartir pantalla'), 'sv-button sv-button-small');
    this.screenButton.addEventListener('click', () => this.run(() => this.actions.startScreen(this.shareAudio)));
    const audioOption=node('label','sv-inline'),audioCheck=node('input');audioCheck.type='checkbox';audioCheck.onchange=()=>{this.shareAudio=audioCheck.checked;};audioOption.append(audioCheck,node('span','',msg('Compartir audio')));

    this.stopScreenButton = button(msg('Detener pantalla'), 'sv-button sv-button-small sv-danger-text');
    this.stopScreenButton.addEventListener('click', () => this.actions.stopScreen());
    append(controls, this.micButton, this.muteButton, this.deafenButton, this.pttButton, this.screenButton, audioOption, this.stopScreenButton);
    this.mediaTiles = node('div', 'sv-media-tiles');
    append(this.mediaBox, this.mediaAudience, meterWrap, controls, this.mediaStatus, this.mediaError, this.privateBox, this.mediaTiles,
      node('p', 'sv-tiny', msg('Con «Pulsar para hablar», mantén la barra espaciadora para hablar.')));
  }

  private refresh(): void {
    const view = this.view;
    if (!view) return;
    for(const request of view.network.friends?.incoming??[]){const key=`friend:${request.id}`;if(!this.seenRequests.has(key)){this.seenRequests.add(key);this.requestNoticeTarget='contacts';this.localNotice=t('{name} te envía una solicitud de amistad',{name:request.from.displayName});this.localNoticeSeq++;}}
    for(const invitation of view.network.voice?.invitations??[]){const key=`voice:${invitation.id}`;if(!this.seenRequests.has(key)){this.seenRequests.add(key);this.requestNoticeTarget='voice';const name=view.network.voiceDirectory?.find(p=>p.fingerprint===invitation.from)?.displayName??view.network.members.find(p=>p.identity.fingerprint===invitation.from)?.identity.displayName??t('Vecino');this.localNotice=t('{name} te invita a una llamada',{name});this.localNoticeSeq++;}}
    const phase = view.network.phase;
    const joined = phase === 'JOINED';
    const ready = !view.lockedIdentity;
    setText(this.statusBadge, PHASE_LABEL[phase]);
    this.statusBadge.classList.toggle('is-online', joined);
    setText(this.profileName, defaultMsg(view.identity.displayName));
    this.profileColor.style.backgroundColor = view.identity.color;
    setInput(this.nameInput, defaultText(view.identity.displayName));
    setInput(this.colorInput, /^#[0-9a-fA-F]{6}$/.test(view.identity.color) ? view.identity.color : '#e88d79');
    setText(this.phaseText, view.network.hostGraceRemainingMs !== null
      ? msg('Reconectando al anfitrión · {seconds} s restantes', { seconds: Math.ceil(view.network.hostGraceRemainingMs / 1000) })
      : PHASE_LABEL[phase]);
    this.openButton.disabled = !ready || !['IDLE', 'CLOSED', 'DENIED', 'EXPIRED_INVITE', 'NETWORK_FAILED', 'KICKED'].includes(phase);
    this.joinButton.disabled = this.openButton.disabled;
    this.joinInput.disabled = this.openButton.disabled;
    show(this.inviteBox, view.network.isHost && !!view.network.invite);
    setInput(this.inviteValue, view.network.invite || '');
    this.copyInviteButton.disabled = !view.network.invite;
    this.rotateInviteButton.disabled = !joined || !view.network.isHost;
    show(this.leaveButton, !['IDLE', 'CLOSED'].includes(phase));
    const notice = this.currentNotice(view);
    show(this.noticeBox, !!notice);
    // Notices are app text (never user content), so they follow the chosen language.
    setText(this.noticeText, notice ? t(notice) : '');
    show(this.lockOverlay, view.lockedIdentity && !this.lockDismissed);
    show(this.unlockToggleButton, view.lockedIdentity);
    setText(this.lockMessage, view.notice ? t(view.notice) : '');
    setText(this.identityStatus, view.identitySaved
      ? msg('Identidad cifrada en este equipo. No se usa el llavero del sistema.')
      : msg('Puedes cifrarla para recuperarla al volver. Sin guardar, vive solo en esta sesión.'));
    this.saveIdentityButton.disabled = view.lockedIdentity;
    this.refreshPane();
    this.refreshLists();
    this.refreshHouseEditor();
    this.refreshBoardControls();
    this.refreshContacts();
    this.refreshDiagnostics();
    this.refreshMedia();
    this.refreshHud();
    this.refreshTouchControls();
  }

  private refreshPane(): void {
    const view = this.view!;
    this.accessPendingCard.hidden=!view.network.pendingAccess;
    const house = this.currentHouse();
    const titles: Record<Pane, [DisplayText, DisplayText]> = {
      world: [this.currentArea === 'residential' ? defaultMsg(this.villageName) : msg(WORLD_AREAS[this.currentArea].displayName), ''],
      house: [house?.name ? defaultMsg(house.name) : msg('La casa'), house?.ownerId === view.identity.fingerprint
        ? msg('Tu espacio sigue disponible incluso sin conexión.') : msg('Un rincón compartido para estudiar en compañía.')],
      board: [defaultMsg(this.expansion.boardRegistry.listBoards().find((board) => board.boardId === this.boardId())?.displayName || '') || msg('La pizarra'), msg('Un espacio para tus ideas.')],
      contacts: [msg('Contactos'), msg('Tu pequeña agenda de personas de confianza.')],
      diagnostics: [msg('Diagnóstico'), msg('Comprueba las capacidades observadas en este equipo.')],
    };
    this.shell.classList.toggle('is-board-focused', this.pane === 'board');
    this.boardPane.classList.toggle('is-display-board',this.isDisplayBoard());
    const boardScene = this.pane === 'board' ? this.boardId() : null;
    if (this.pane !== 'board') { this.eraserGesture = null; this.boardErasing = null; }
    if (this.lastBoardScene && this.lastBoardScene !== boardScene) { this.expansion.ollamaGateway.cancel('board'); this.expansion.ollamaGateway.cancel('boardVision'); }
    if(this.lastBoardScene!==boardScene){this.cancelBoardGesture();this.boardEditor?.cancel();if(!boardScene){this.boardEditor?.deselect();this.actions.selectBoard(null);}}
    this.lastBoardScene = boardScene;
    if (this.pane !== 'board' && this.boardAdvancedPanel) {
      this.boardAdvancedPanel.hidden = true;
      this.boardAdvancedToggle.setAttribute('aria-expanded', 'false');
      for (const group of this.boardAdvancedPanel.querySelectorAll('details')) group.open = false;
    }
    const inRoom = !!this.houseOwnerId;
    const ownRoom = this.houseOwnerId === view.identity.fingerprint;
    if (this.pane === 'board') setText(this.headingAction, inRoom ? (ownRoom ? msg('← Volver a mi casa') : msg('← Volver a la casa')) : msg('← Volver'));
    else setText(this.headingAction, msg('← Salir'));
    show(this.headingAction, this.pane === 'board' || this.pane === 'house');
    setDisplayAttribute(this.headingAction, "title", this.pane === 'house' ? msg('Salir a la aldea (Esc)') : msg('Volver (Esc)'));
    setText(this.title, titles[this.pane][0]);
    setText(this.subtitle, titles[this.pane][1]);
    show(this.canvasPane, this.pane === 'world' || this.pane === 'house');
    show(this.boardPane, this.pane === 'board');
    show(this.diagnosticsPane, this.pane === 'diagnostics');
    for (const [pane, item] of this.navButtons) {
      item.classList.toggle('is-active', this.pane === pane);
      item.setAttribute('aria-current', this.pane === pane ? 'page' : 'false');
    }
    setDisplayAttribute(this.stageCanvas, 'aria-label', this.pane === 'house' ? msg('Interior de la casa') : msg('Aldea interactiva'));
  }

  private refreshLists(): void {
    const view = this.view!;
    const occupied = occupiedParcels(view);
    const house = this.currentHouse();
    setText(this.contextTitle, this.pane === 'house' || this.pane === 'board' ? (house?.name ? defaultMsg(house.name) : msg('Tu casa')) : msg('Casas de la aldea'));
    setText(this.contextText, this.pane === 'house' || this.pane === 'board'
      ? msg('{count} persona(s) aquí', { count: view.network.members.filter((member) => member.connected && member.houseId === (house?.ownerId || view.identity.fingerprint)).length || 1 })
      : msg('{count} de 6 parcelas ocupadas', { count: occupied.length }));
    const signature = JSON.stringify({
      houses: occupied.map((item) => [item.ownerId, item.house.name, item.house.access, item.parcel.slot]),
      members: view.network.members.map((member) => [member.identity.fingerprint, member.identity.displayName, member.connected, member.houseId]),
      joins: view.network.pendingJoins.map((request) => [request.requestId, request.identity.displayName]),
      visits: view.network.pendingVisits.map((request) => [request.requestId, request.identity.displayName, request.houseId]),
      spaces:view.network.workspace?.requests,
      contacts:view.contacts.map(c=>[c.identity.fingerprint,c.nickname]),
      isHost: view.network.isHost,
    });
    if (signature === this.lastListsSignature) return;
    this.lastListsSignature = signature;
    this.housesList.replaceChildren();
    for (const item of occupied) {
      const row = button('', 'sv-house-row');
      const houseIcon = node('span', 'sv-house-icon');
      houseIcon.append(monoIcon('house'));
      const info = node('span', 'sv-house-row-text');
      append(info, node('strong', '', defaultMsg(item.house.name)), node('small', '', item.isOwn ? msg('Tu casa') : `${defaultText(item.name)} · ${t(this.accessLabel(item.house.access))}`));
      append(row, houseIcon, info, node('span', '', '→'));
      row.disabled = !item.isOwn && (view.network.phase !== 'JOINED' || item.house.access === 'locked' && !hasHouseAccess(item.house,view.identity.fingerprint));
      row.addEventListener('click', () => this.openHouse(item.ownerId));
      this.housesList.append(row);
    }
    this.peopleList.replaceChildren();
    if (view.network.members.length) {
      this.peopleList.append(node('div', 'sv-eyebrow sv-list-divider', msg('VECINDARIO')));
      for (const member of view.network.members.filter((person) => person.connected)) {
        const row = node('div', 'sv-person-row');
        const dot = node('span', 'sv-person-dot');
        dot.style.backgroundColor = member.identity.color;
        const label = node('span', '', `${defaultText(member.identity.displayName)} · ${member.identity.fingerprint.slice(0, 8)}`);
        append(row, dot, label);
        if(member.identity.fingerprint!==view.identity.fingerprint){
          const saved=view.contacts.some(c=>c.identity.fingerprint===member.identity.fingerprint);
          const add=button(saved?msg('En contactos'):msg('Enviar solicitud de amistad'),'sv-link-button');add.disabled=saved;
          add.onclick=()=>this.run(()=>this.actions.addSessionContact(member.identity.fingerprint));row.append(add);
        }
        if (view.network.isHost && member.identity.fingerprint !== view.identity.fingerprint) {
          const kick = button(msg('Sacar'), 'sv-link-button sv-danger-text');
          setDisplayAttribute(kick, 'aria-label', msg("Sacar a {p0} de la sesión", { p0: defaultText(member.identity.displayName) }));
          kick.addEventListener('click', () => this.actions.kickMember(member.identity.fingerprint));
          row.append(kick);
        } else if (member.houseId === view.identity.fingerprint && member.identity.fingerprint !== view.identity.fingerprint) {
          const kick = button(msg('Salir'), 'sv-link-button sv-danger-text');
          setDisplayAttribute(kick, 'aria-label', msg("Sacar a {p0} de tu casa", { p0: defaultText(member.identity.displayName) }));
          kick.addEventListener('click', () => this.actions.kickVisitor(member.identity.fingerprint));
          row.append(kick);
        }
        this.peopleList.append(row);
      }
    }
    this.approvalList.replaceChildren();
    const live = new Set(this.approvalIds(view));
    for (const id of this.hiddenApprovals) if (!live.has(id)) this.hiddenApprovals.delete(id); // forget resolved ones
    const visible = <T,>(id: string, item: T) => !this.hiddenApprovals.has(id) ? [item] : [];
    const joins = (view.network.isHost ? view.network.pendingJoins : []).flatMap(r => visible(`join:${r.requestId}`, r));
    const visits = view.network.pendingVisits.filter((request) => request.houseId === view.identity.fingerprint).flatMap(r => visible(`visit:${r.requestId}`, r));
    const spaces=(view.network.workspace?.requests??[]).flatMap(r => visible(`space:${r.id}`, r));
    show(this.approvalBox, joins.length + visits.length + spaces.length > 0);
    for(const request of spaces)this.approvalList.append(this.approvalRow(view.network.voiceDirectory?.find(p=>p.fingerprint===request.visitor)?.displayName??request.visitor.slice(0,8),request.space.roomId?msg('Quiere entrar a una habitación privada'):msg('Quiere entrar a una planta privada'),()=>this.actions.workspaceCommand({action:'decide',request:request.id,accept:true}),()=>this.actions.workspaceCommand({action:'decide',request:request.id,accept:false})));
    for (const request of joins) this.approvalList.append(this.approvalRow(`${defaultText(request.identity.displayName)} · ${request.identity.fingerprint.slice(0, 12)}`, msg('Quiere entrar en la aldea'),
      () => this.actions.decideJoin(request.requestId, true), () => this.actions.decideJoin(request.requestId, false)));
    for (const request of visits) this.approvalList.append(this.approvalRow(`${defaultText(request.identity.displayName)} · ${request.identity.fingerprint.slice(0, 12)}`, msg('Quiere visitar tu casa'),
      () => this.actions.decideVisit(request.requestId, true), () => this.actions.decideVisit(request.requestId, false)));
  }

  private approvalIds(view: AppView): string[] {
    return [
      ...(view.network.isHost ? view.network.pendingJoins : []).map(r => `join:${r.requestId}`),
      ...view.network.pendingVisits.filter(r => r.houseId === view.identity.fingerprint).map(r => `visit:${r.requestId}`),
      ...(view.network.workspace?.requests ?? []).map(r => `space:${r.id}`),
    ];
  }

  private approvalRow(name: string, detail: DisplayText, accept: () => void, deny: () => void): HTMLElement {
    const row = node('div', 'sv-approval-row');
    append(row, node('strong', '', name), node('small', '', detail));
    const controls = node('div', 'sv-inline');
    const yes = button(msg('Permitir'), 'sv-button sv-button-small sv-button-primary');
    const no = button(msg('Rechazar'), 'sv-button sv-button-small');
    yes.addEventListener('click', () => this.run(accept));
    no.addEventListener('click', () => this.run(deny));
    append(controls, yes, no);
    row.append(controls);
    return row;
  }

  private refreshHouseEditor(): void {
    const view = this.view!;
    show(this.houseEditBox, this.pane === 'house' && this.houseOwnerId === view.identity.fingerprint);
    if (this.houseEditBox.hidden) return;
    const house = this.ownDecoratedHouse(),floor=this.localPosition.space?.roomId===null;
    this.houseNameInput.closest('label')!.hidden=!!this.localPosition.space;
    this.houseAccessSelect.closest('label')!.hidden=!!this.localPosition.space;
    setText(this.enterDecorationButton,msg(floor?'Decorar planta':'Decorar en la habitación'));
    setDisplayAttribute(this.decorationToolbar,'aria-label',msg(floor?'Decorar planta':'Decorar habitación'));
    for(const tile of this.furnitureCatalog.querySelectorAll<HTMLButtonElement>('[data-furniture-kind]'))tile.hidden=floor&&!isFloorDecoration(tile.dataset.furnitureKind as FurnitureKind);
    const kinds=FURNITURE_KINDS.filter(kind=>!floor||isFloorDecoration(kind));
    const signatureKinds=kinds.join(',');
    if(this.furnitureKindSelect.dataset.kinds!==signatureKinds){
      const selectedKind=this.furnitureKindSelect.value;
      this.furnitureKindSelect.replaceChildren(...kinds.map(kind=>{const option=node('option');option.value=kind;setText(option,msg(FURNITURE_LABELS[kind]));return option;}));
      if(kinds.includes(selectedKind as FurnitureKind))this.furnitureKindSelect.value=selectedKind;
      this.furnitureKindSelect.dataset.kinds=signatureKinds;
    }
    setInput(this.houseNameInput, defaultText(house.name));
    setInput(this.houseAccessSelect, house.access);
    setInput(this.houseThemeSelect, house.theme);
    setText(this.furnitureCount,`${house.furniture.length}/${LIMITS.furniture} · ${t('Casas de mascotas: {count}/5',{count:this.pets.count()})}`);
    this.refreshFurnitureKindPreview();
    const selected = house.furniture.find((item) => item.id === this.selectedFurnitureId) || null;
    show(this.furnitureDetail, !!selected);
    this.renameFurnitureButton.disabled=!selected;this.editGuideButton.hidden=selected?.kind!=='guide';
    for(const canvas of this.furnitureCatalog.querySelectorAll<HTMLCanvasElement>('canvas')){const kind=canvas.parentElement!.dataset.furnitureKind as FurnitureKind;drawFurniturePreview(canvas.getContext('2d')!,kind,0,undefined,!!this.localPosition.space);}
    this.guideTextField.hidden=selected?.kind!=='guide';this.frameField.hidden=selected?.kind!=='sketchboard';
    if (selected) {
      drawFurniturePreview(this.selectedSpritePreview.getContext('2d')!,selected.kind,selected.rotation,selected,!!this.localPosition.space,(selected.kind==='board'||selected.kind==='sketchboard')?this.expansion.boardRegistry.getDecodedBoardSprite(this.localBoardFor(selected.id)):null);
      if(document.activeElement!==this.guideTextInput)this.guideTextInput.value=selected.guideText??'';this.frameToggle.checked=selected.showFrame!==false;
      setInput(this.aliasInput, defaultText(selected.publicAlias));
      show(this.furnitureUseButton, isInteractiveFurniture(selected.kind));
      if (isInteractiveFurniture(selected.kind)) setText(this.furnitureUseButton, `⚡ ${t(FURNITURE_ACTION_LABELS[selected.kind])} (E)`);
      const customColor = selected.color ?? getFurnitureCustomColor(selected.kind);
      if (customColor) setInput(this.furnitureColorInput, customColor);
    }
    // Rebuilding on every selection would swap the row under a double-click,
    // so the list is only rebuilt when the furniture itself changes.
    const signature = JSON.stringify(house.furniture.map((item) => [item.id, item.kind, item.publicAlias]));
    if (this.furnitureList.dataset.signature !== signature) {
      this.furnitureList.dataset.signature = signature;
      this.furnitureList.replaceChildren();
      for (const item of house.furniture) {
        const row = button(`${t(FURNITURE_LABELS[item.kind])}${item.publicAlias ? ` · ${defaultText(item.publicAlias)}` : ''}`, 'sv-furniture-item');
        row.dataset.id = item.id;
        row.addEventListener('click', () => { this.selectedFurnitureId = item.id; this.refreshHouseEditor(); });
        row.addEventListener('dblclick', () => this.interactWithFurniture(item));
        this.furnitureList.append(row);
      }
    }
    for (const row of this.furnitureList.children) {
      if (row instanceof HTMLElement) row.classList.toggle('is-selected', row.dataset.id === this.selectedFurnitureId);
    }
  }

  private refreshBoardControls(): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const house = this.currentHouse() || view.ownHouse;
    const activeFurniture = !this.customBoardId
      ? house.furniture.find((f) => f.id === (this.activeBoardFurnitureId || 'board') && f.kind === 'board')
      : null;
    const defaultBoardTitle = activeFurniture?.publicAlias || 'Pizarra de estudio';
    const boardMeta = this.expansion.boardRegistry.ensureBoard(
      boardId,
      defaultBoardTitle,
      this.customBoardId ? this.currentArea : 'house',
      house.ownerId || view.identity.fingerprint,
    );
    if (this.boardNameInput) {
      setInput(this.boardNameInput, defaultText(boardMeta.displayName));
    }
    if (this.boardAccessSelect) {
      setInput(this.boardAccessSelect, boardMeta.access);
    }
    const strokes = this.allStrokes(boardId);
    for (const [tool, item] of this.boardToolButtons) {
      item.classList.toggle('is-active', !this.richBoardTool && tool === this.boardTool);
      item.setAttribute('aria-pressed', String(!this.richBoardTool && tool === this.boardTool));
    }
    for (const [rTool, item] of this.richToolButtons) {
      item.classList.toggle('is-active', this.richBoardTool === rTool);
      item.setAttribute('aria-pressed', String(this.richBoardTool === rTool));
    }
    const advancedTool = this.richBoardTool
      ? this.richToolButtons.get(this.richBoardTool)?.textContent
      : !MAIN_BOARD_TOOLS.includes(this.boardTool) ? this.boardToolButtons.get(this.boardTool)?.textContent : null;
    setText(this.boardAdvancedToggle, advancedTool ? msg('Más · {tool}', { tool: advancedTool }) : msg('Más'));
    this.boardEditor?.sync();this.boardEditor?.setActive(this.boardTool==='select',this.boardTool==='text');
    if(this.pane==='board'&&view.network.phase==='JOINED'&&view.network.boardRef!==this.wireBoardId())this.actions.selectBoard(this.wireBoardId());
    const hasOwn=strokes.some(s=>!s.deleted&&s.author===view.identity.fingerprint);
    this.boardUndoButton.disabled = !this.boardEditor?.canUndo();
    if (this.boardRedoButton) {
      this.boardRedoButton.disabled = !this.boardEditor?.canRedo();
    }
    this.boardClearButton.disabled = !hasOwn;
    if (!hasOwn) this.boardClearArmed = false;
    setText(this.boardClearButton, this.boardClearArmed ? msg('¿Borrar todo lo tuyo?') : msg('Borrar lo mío'));
    this.boardClearButton.classList.toggle('is-armed', this.boardClearArmed);
    this.boardCanvas.dataset.tool = this.richBoardTool || this.boardTool;
    setText(this.boardZoomLabel, `${Math.round(this.boardCamera().zoom * 100)}%`);
    const canDraw = this.canDrawBoard();
    show(this.boardReadOnlyStatus, !canDraw || boardAtCapacity(strokes, boardId));
    setText(this.boardReadOnlyStatus, !canDraw ? msg('Esta pizarra es de solo lectura. Puedes consultar los permisos en Más.') : msg('La pizarra ha alcanzado su capacidad.'));
    setText(this.boardStatus, !canDraw
      ? msg('Entra en la casa o solicita permisos de edición para dibujar en esta pizarra.')
      : boardAtCapacity(strokes, boardId)
        ? msg('Pizarra llena · {count}/{count} operaciones', { count: LIMITS.boardOperations })
        : msg('{count} trazos en esta pizarra', { count: strokes.filter(stroke => !stroke.deleted).length }));
    this.boardCanvas.classList.toggle('is-disabled', !canDraw || boardAtCapacity(strokes, boardId));
    const authors = [...new Set(strokes.map((stroke) => stroke.author))].sort();
    const moderator = this.moderatesBoard() && canDraw;
    const live = (author: string) => strokes.filter(stroke => stroke.author === author && !stroke.deleted);
    const signature = JSON.stringify([boardId, authors, moderator, authors.map(a => live(a).length), view.network.members.map((member) => [member.identity.fingerprint, member.identity.displayName])]);
    if (signature === this.lastLayersSignature) return;
    this.lastLayersSignature = signature;
    this.boardLayers.replaceChildren();
    if (!authors.length) this.boardLayers.append(node('p', 'sv-subtle', msg('Todavía no hay trazos.')));
    for (const author of authors) {
      const label = node('label', 'sv-layer');
      const input = node('input');
      input.type = 'checkbox';
      input.checked = !this.hiddenAuthors.has(author);
      input.addEventListener('change', () => {
        if (input.checked) this.hiddenAuthors.delete(author);
        else this.hiddenAuthors.add(author);
      });
      const name: DisplayText = author === view.identity.fingerprint ? msg('Mis trazos') :
        defaultText(view.network.members.find((member) => member.identity.fingerprint === author)?.identity.displayName || '') || `${author.slice(0, 10)}…`;
      append(label, input, node('span', '', name), node('small', '', msg('Solo en mi vista')));
      this.boardLayers.append(label);
      // In my own house I can clear anyone's layer (one undoable step).
      if (moderator && author !== view.identity.fingerprint && live(author).length) {
        const clear = button(msg('Borrar capa'), 'sv-button sv-button-small sv-layer-clear');
        setDisplayAttribute(clear, 'aria-label', msg('Borrar la capa de {name}', { name: typeof name === 'string' ? name : t(name) }));
        clear.addEventListener('click', () => { void (async () => {
          const objects = live(author);
          // Commits hold up to 128 objects; a big layer is cleared in several steps.
          for (let i = 0; i < objects.length; i += 100) if (!await this.boardEditor.apply(objects.slice(i, i + 100).map(stroke => ({ ...stroke, deleted: true })))) return;
          this.notify(t('Capa borrada ({count} objetos). Puedes deshacerlo.', { count: objects.length }));
        })(); });
        this.boardLayers.append(clear);
      }
    }
  }

  private refreshContacts(): void {
    const view = this.view!;
    setText(this.friendCodeValue, view.friendCode);
    const people=view.network.phase==='JOINED'?[...new Map([...view.network.members.filter(m=>m.connected).map(m=>m.identity),...(view.network.voiceDirectory??[])].map(p=>[p.fingerprint,p])).values()].filter(p=>p.fingerprint!==view.identity.fingerprint):[];
    const signature = JSON.stringify([view.contacts,people,view.network.friends,!!view.network.server]);
    if (this.contactsList.dataset.signature === signature) return;
    this.contactsList.dataset.signature = signature;
    this.contactsList.replaceChildren();this.sessionContacts.replaceChildren();
    if(view.network.server&&!view.network.friends)this.sessionContacts.append(node('p','sv-subtle',msg('Actualiza el servidor para usar solicitudes de amistad.')));
    for(const request of view.network.friends?.incoming??[]){const row=node('div','sv-contact-row');row.append(node('span','',msg('{name} te envía una solicitud de amistad',{name:request.from.displayName})));for(const [label,accept]of [['Aceptar',true],['Rechazar',false]] as const){const b=button(msg(label),'sv-button');b.onclick=()=>this.actions.friendCommand({action:'respond',id:request.id,accept});row.append(b);}this.sessionContacts.append(row);}
    for(const request of view.network.friends?.outgoing??[]){const row=node('div','sv-contact-row'),cancel=button(msg('Cancelar'),'sv-button');cancel.onclick=()=>this.actions.friendCommand({action:'cancel',id:request.id});row.append(node('span','',msg('Solicitud enviada a {name}',{name:request.to.displayName})),cancel);this.sessionContacts.append(row);}
    if(people.length)this.sessionContacts.append(node('h3','sv-section-title',msg('Personas en esta sesión')));
    for(const person of people){
      const row=node('div','sv-contact-row'),saved=view.contacts.some(c=>c.identity.fingerprint===person.fingerprint);
      const add=button(saved?msg('En contactos'):msg('Enviar solicitud de amistad'),'sv-button sv-button-small');add.disabled=saved||!!view.network.server&&!view.network.friends||!!view.network.friends?.outgoing.some(r=>r.to.fingerprint===person.fingerprint);
      setDisplayAttribute(add,'aria-label',saved?msg('En contactos'):msg('Añadir a {name} a contactos',{name:person.displayName}));
      add.onclick=()=>this.run(()=>this.actions.addSessionContact(person.fingerprint));
      append(row,node('strong','',person.displayName),add);this.sessionContacts.append(row);
    }
    if (!view.contacts.length) this.contactsList.append(node('p', 'sv-subtle', msg('Aún no has añadido contactos.')));
    for (const contact of view.contacts) {
      const card = node('div', 'sv-contact-row');
      const avatar = node('span', 'sv-person-dot');
      avatar.style.backgroundColor = contact.identity.color;
      const copy = node('div');
      append(copy, node('strong', '', contact.nickname||defaultMsg(contact.identity.displayName)), node('small', '', `${contact.identity.displayName} · ${contact.identity.fingerprint.slice(0, 12)}`));
      const nickname=node('input','sv-input');nickname.type='text';nickname.maxLength=48;nickname.value=contact.nickname??'';
      setDisplayAttribute(nickname,'aria-label',msg('Apodo de {name}',{name:contact.identity.displayName}));setDisplayAttribute(nickname,'placeholder',msg('Apodo privado'));
      nickname.onchange=()=>this.run(()=>this.actions.setContactNickname(contact.identity.fingerprint,nickname.value));
      append(card, avatar, copy,nickname);this.contactsList.append(card);
    }
  }

  private refreshDiagnostics(): void {
    const entries = this.view!.diagnostics;
    const signature = JSON.stringify(entries);
    if (this.diagnosticList.dataset.signature === signature) return;
    this.diagnosticList.dataset.signature = signature;
    this.diagnosticList.replaceChildren();
    if (!entries.length) this.diagnosticList.append(node('p', 'sv-subtle', msg('Ejecuta una prueba para ver resultados.')));
    for (const entry of entries) {
      const row = node('div', 'sv-diagnostic-row');
      const badge = node('span', `sv-diagnostic-badge is-${entry.status.toLowerCase()}`, entry.status);
      const copy = node('div');
      append(copy, node('strong', '', entry.test), node('p', 'sv-subtle', entry.detail));
      append(row, badge, copy);
      this.diagnosticList.append(row);
    }
  }

  private refreshPrivate(view: AppView, connected: boolean): void {
    this.voicePanel.refresh(view);
    show(this.privateBox, connected);
  }

  private refreshMedia(): void {
    const view = this.view!;
    const media = view.network.media;
    const ownMember = view.network.members.find((member) => member.identity.fingerprint === view.identity.fingerprint);
    // Voice now works wherever you are: the open village, a house, or a
    // private call. The manager already scopes who can hear you.
    const showingCurrentRoom = view.network.phase === 'JOINED';
    const connected = view.network.phase === 'JOINED' && !view.lockedIdentity;
    const call = view.network.privateCall;
    setText(this.mediaEyebrow, call.active ? msg('LLAMADA PRIVADA') : ownMember?.houseId ? msg('EN ESTA CASA') : msg('EN LA ALDEA'));
    setText(this.mediaAudience, connected ? (media.audience || msg('Nadie recibe tu audio o pantalla ahora.')) : msg('Conéctate a una aldea para hablar con otras personas.'));
    this.refreshPrivate(view, connected);
    setText(this.mediaStatus, SCREEN_LABEL[media.screenPhase]);
    setText(this.mediaError, media.error || '');
    show(this.mediaError, !!media.error);
    setText(this.micButton, media.micEnabled ? msg('Apagar micro') : msg('Activar micro'));
    setText(this.muteButton, media.muted ? msg('Quitar silencio') : msg('Silenciar'));
    setText(this.deafenButton, media.deafened ? msg('Volver a escuchar') : msg('No escuchar'));
    setText(this.pttButton, media.pushToTalk ? msg('PTT activo') : msg('Pulsar para hablar'));
    this.pttButton.classList.toggle('is-active', media.pushToTalk);
    this.muteButton.classList.toggle('is-active', media.muted);
    this.deafenButton.classList.toggle('is-active', media.deafened);
    this.micButton.disabled = !connected;
    this.muteButton.disabled = !connected || !media.micEnabled;
    this.deafenButton.disabled = !connected;
    this.pttButton.disabled = !connected || !media.micEnabled;
    show(this.screenButton,media.screenAvailable!==false);
    show(this.stopScreenButton,media.screenAvailable!==false||!!media.localScreen);
    this.screenButton.disabled = !connected || !['OFF', 'SOURCE_ENDED', 'DENIED', 'NETWORK_FAILED'].includes(media.screenPhase);
    this.stopScreenButton.disabled = !['REQUESTING_OS_PERMISSION', 'CAPTURING_LOCAL', 'NEGOTIATING', 'SENDING'].includes(media.screenPhase);
    this.micMeterFill.style.width = media.talking ? '82%' : media.micEnabled && !media.muted ? '28%' : '0%';

    const desired = new Map<string, { stream: MediaStream; kind: 'audio' | 'screen'; name: string; local: boolean }>();
    if (media.localScreen && showingCurrentRoom) desired.set('local-screen', { stream: media.localScreen, kind: 'screen', name: t(media.localScreen.getAudioTracks().some(track=>track.readyState==='live')?'Tu pantalla · con audio':'Tu pantalla · sin audio'), local: true });
    for (const remote of showingCurrentRoom ? media.remote : []) {
      const name = defaultText(view.network.voiceDirectory?.find(person=>person.fingerprint===remote.identityId)?.displayName || view.network.members.find((member) => member.identity.fingerprint === remote.identityId)?.identity.displayName || '') || remote.identityId.slice(0, 10);
      desired.set(`${remote.kind}:${remote.identityId}`, { stream: remote.stream, kind: remote.kind, name, local: false });
    }
    for (const [key, mount] of this.mediaMounts) {
      if (!desired.has(key)) {
        mount.element.pause();
        mount.element.srcObject = null;
        mount.dispose?.();mount.wrapper.remove();
        this.mediaMounts.delete(key);
        if (this.spotlightKey === key) this.spotlightKey = null;
      }
    }
    let screenCount = 0;
    for (const [key, item] of desired) {
      if (item.kind === 'screen') {
        screenCount++;
        if (!this.spotlightKey) this.spotlightKey = key;
      }
      let mount = this.mediaMounts.get(key);
      if (!mount) {
        const wrapper = node('div', 'sv-media-tile');
        const element = document.createElement(item.kind === 'screen' ? 'video' : 'audio');
        element.autoplay = true;
        element.controls = !item.local;
        element.setAttribute('playsinline', '');
        if (item.local) element.muted = true;
        if (item.kind === 'screen') {
          const head = node('div', 'sv-media-tile-head');
          const titleEl = node('strong', '', item.name);
          const btnGroup = node('div', 'sv-inline');
          const spotBtn = button(msg('★ Destacar'), 'sv-button sv-button-small');
          spotBtn.addEventListener('click', () => {
            this.spotlightKey = key;
            this.screenLayoutMode = 'spotlight';
            this.refreshMedia();
          });
          const fullBtn = button(msg('⛶ Ampliar'), 'sv-button sv-button-small');
          fullBtn.addEventListener('click', () => {
            const video=element as HTMLVideoElement & {webkitEnterFullscreen?:()=>void};
            const fallback=()=>{try{if(video.webkitEnterFullscreen){video.webkitEnterFullscreen();return;}}catch{}wrapper.classList.toggle('is-expanded-screen');};
            try{if(element.requestFullscreen)void element.requestFullscreen().catch(fallback);else fallback();}catch{fallback();}
          });
          if(item.local){const stop=button(msg('Detener emisión'),'sv-button sv-button-small');stop.onclick=()=>this.actions.stopScreen();btnGroup.append(stop);}append(btnGroup, fullBtn);
          append(head, titleEl, btnGroup);
          append(wrapper, head, element);
          this.screenTheaterGrid.append(wrapper);
        } else {
          append(wrapper, node('strong', '', item.name), element);
          this.mediaTiles.append(wrapper);
        }
        mount = { wrapper, element, stream: item.stream, kind: item.kind };
        if(item.kind==='screen')mount.dispose=mediaWindow(wrapper,wrapper.querySelector<HTMLElement>('.sv-media-tile-head')!,screenCount-1);
        this.mediaMounts.set(key, mount);
        element.srcObject = item.stream;
        void element.play().catch(() => this.offerMediaPlayback(wrapper,element));
      } else {
        setText(mount.wrapper.querySelector('strong')!, item.name);
        if (mount.stream !== item.stream) {
          mount.stream = item.stream;
          mount.element.srcObject = item.stream;
          void mount.element.play().catch(() => this.offerMediaPlayback(mount!.wrapper,mount!.element));
        }
      }
      if (item.kind === 'screen' && mount) {
        mount.wrapper.classList.toggle('is-spotlight', this.spotlightKey === key);
      }
    }
    show(this.screenTheater, screenCount > 0);
  }

  private offerMediaPlayback(wrapper:HTMLElement,media:HTMLMediaElement):void {
    if(wrapper.querySelector('[data-play-media]'))return;
    const play=button(msg('Tocar para reproducir'),'sv-button sv-button-small');play.dataset.playMedia='true';
    play.onclick=()=>{void media.play().then(()=>play.remove()).catch(()=>{});};wrapper.append(play);
  }
  private navigate(pane: Pane): void {
    this.speech.clear();
    if (!this.view) return;
    if (pane === 'contacts') { this.openPhone('contacts'); return; }
    this.closePhone();
    if (pane === 'world') {
      if (this.houseOwnerId || this.waitingHouseId) this.leaveCurrentHouse();
      else { this.pane = 'world'; this.refresh(); }
      return;
    }
    else if (pane === 'house') {
      // Already inside your own house (for example, back from the board):
      // return to it as you left it instead of re-entering at the doormat.
      if (this.houseOwnerId === this.view.identity.fingerprint) { this.returnToRoom(); return; }
      this.enterOwnHouse(); return;
    }
    if(pane==='diagnostics'){if(this.pane!=='diagnostics')this.diagnosticsReturn=this.pane;this.stopMoving();}
    this.pane = pane;
    this.refresh();
  }

  private leaveDiagnostics():void {this.pane=this.diagnosticsReturn;this.stopMoving();this.refresh();if(this.pane==='board')this.boardCanvas.focus();else this.stageCanvas.focus();}

  /** Back to the room the player is in, keeping their position. */
  private returnToRoom(): void {
    const item=this.currentHouse()?.furniture.find(f=>f.id===this.activeBoardFurnitureId);
    if(this.pane==='board'&&item?.kind==='sketchboard'&&this.view&&this.houseOwnerId===this.view.identity.fingerprint){
      const canvas=document.createElement('canvas');canvas.width=192;canvas.height=108;const ctx=canvas.getContext('2d')!;ctx.scale(.25,.25);drawBoard(ctx,this.allStrokes(this.boardId()),null,undefined,768,432,false);
      try{this.expansion.boardRegistry.setBoardSprite(this.boardId(),canvas.toDataURL('image/png'),this.view.identity.fingerprint,true);}catch(error){this.notify(errorMessage(error));}
    }
    if (!this.houseOwnerId) return;
    this.pane = 'house';
    this.refresh();
  }

  private enterOwnHouse(): void { this.openHouse(this.view?.identity.fingerprint || ''); }

  private beginDecoration(kind?: FurnitureKind): void {
    if (!this.view || this.pane !== 'house' || this.houseOwnerId !== this.view.identity.fingerprint) return;
    if(this.localPosition.space&&!this.view.network.workspace?.document)return;
    if(kind&&this.localPosition.space?.roomId===null&&!isFloorDecoration(kind))return;
    this.decorating = true; this.pendingFurniture = kind ?? null; this.keys.clear(); this.dpadKeys.clear(); this.moveTarget = null; this.movePath = []; this.pendingInteraction = null;
    this.closePhone(); this.decorationToolbar.hidden = false;
    // Phones: the walking controls would cover the toolbar and the room, and do nothing while decorating.
    document.documentElement.classList.add('sv-decorating');
    // Start the preview next to the player, which is always on screen (the portrait camera follows them).
    if (kind) this.previewNewFurniture(Math.max(40, Math.min(700, this.localPosition.x)), Math.max(150, Math.min(330, this.localPosition.y - 56)));
    this.lastStageRenderSig = '';
  }
  private syncFurnitureName(item:Furniture):void {
    if(!this.view||(item.kind!=='board'&&item.kind!=='sketchboard'))return;
    const id=this.localBoardFor(item.id),name=item.publicAlias.trim()||'Pizarra de estudio',owner=this.view.identity.fingerprint;
    const metadata=this.expansion.boardRegistry.ensureBoard(id,name,'house',owner);
    if(metadata.displayName!==name)this.expansion.boardRegistry.renameBoard(id,name,owner,true);
  }
  private refreshFurnitureKindPreview():void {
    const kind=this.furnitureKindSelect.value as FurnitureKind;if(!FURNITURE_LABELS[kind])return;
    drawFurniturePreview(this.kindSpritePreview.getContext('2d')!,kind,0,undefined,!!this.localPosition.space);setDisplayText(this.kindSpriteDescription,msg(FURNITURE_DESCRIPTIONS[kind]));
  }
  private openGuideText():void {
    if(!this.view)return;const house=this.ownDecoratedHouse(),item=house.furniture.find(f=>f.id===this.selectedFurnitureId);
    if(!item||item.kind!=='guide'||house.ownerId!==this.view.identity.fingerprint)return;
    this.stopMoving();const scope=JSON.stringify(this.localPosition.space??null);
    editGuideText(item.guideText??'',text=>{const current=this.ownDecoratedHouse();if(!this.view||current.ownerId!==this.view.identity.fingerprint||scope!==JSON.stringify(this.localPosition.space??null)||!current.furniture.some(f=>f.id===item.id))throw Error('El objeto ya no está disponible.');this.decorationHistory.remember(current);this.actions.updateOwnHouse({...current,revision:current.revision+1,furniture:current.furniture.map(f=>f.id===item.id?{...f,guideText:text}:f)});});
  }
  private openFurnitureName():void {
    if(!this.view)return;const item=this.ownDecoratedHouse().furniture.find(f=>f.id===this.selectedFurnitureId);if(!item)return;
    this.stopMoving();this.furnitureNameTarget=item.id;this.furnitureNameInput.value=defaultText(item.publicAlias);setDisplayAttribute(this.furnitureNameInput,'placeholder',msg(FURNITURE_LABELS[item.kind]));this.furnitureNameDialog.showModal();this.furnitureNameInput.focus();this.furnitureNameInput.select();
  }
  private async savePetHome(home:PetHome,config:PetConfig){
    const view=this.view;if(!view||home.owner!==view.identity.fingerprint)throw Error('network');
    const patch=(f:Furniture)=>f.id===home.furnitureId?{...f,pet:config,...(config.custom?{kind:config.custom.house}:{})}:f;
    if(home.scene==='area:residential')await this.actions.saveHouseLayout({...view.ownHouse,garden:view.ownHouse.garden?.map(f=>f.id===home.furnitureId?{...f,pet:config,...(config.custom?{kind:config.custom.house}:{})}:f)});
    else{const key=home.scene.split(':').slice(2);if(key[0]==='lobby')await this.actions.saveHouseLayout({...view.ownHouse,furniture:view.ownHouse.furniture.map(patch)});else{this.actions.workspaceCommand({action:'pet',space:{floorId:key[0],roomId:key[1]==='-'?null:key[1]},furniture:home.furnitureId,config});await this.waitForPetHome(home,config);}}
    this.pets.sync();this.lastStageRenderSig='';
  }
  private async waitForPetHome(home:PetHome,config:PetConfig){
    const until=Date.now()+6000;
    while(Date.now()<until){const saved=this.pets.homesList().find(h=>h.furnitureId===home.furnitureId&&h.scene===home.scene);if(saved&&JSON.stringify(saved.config)===JSON.stringify(config))return;await new Promise(r=>setTimeout(r,80));}
    throw Error(t('No se pudo guardar la asignación. Vuelve a intentarlo.'));
  }
  private placeCustomPet(pet:OwnedPet){if(this.pets.count()>=5){this.notify(t('Puedes colocar un máximo de 5 casas de mascotas entre todas las habitaciones y el jardín.'));return;}if(this.houseOwnerId!==this.view?.identity.fingerprint||this.pane!=='house')this.enterOwnHouse();this.closePhone();this.beginDecoration(pet.appearance.house);this.placingPet=pet;}
  private endDecoration(): void {this.placingPet=null; if(this.furnitureNameDialog?.open)this.furnitureNameDialog.close(); document.documentElement.classList.remove('sv-decorating'); this.doorDrag=null; this.decorating = false; this.pendingFurniture = null; this.previewHouse = null; this.drag = null; this.decorationInvalid = null; if (this.decorationToolbar) this.decorationToolbar.hidden = true; this.lastStageRenderSig = ''; }
  private previewNewFurniture(x: number, y: number): void {
    const house = (this.view ? this.ownDecoratedHouse() : undefined); if (!house || !this.pendingFurniture) return;
    const snap = (n: number) => this.decorationGrid ? Math.round(n / 8) * 8 : Math.round(n);
    const item: Furniture = { id: 'placing-preview', kind: this.pendingFurniture,...(this.placingPet?{pet:{id:this.placingPet.appearance.id,mode:'roam' as const,custom:this.placingPet.appearance,name:this.placingPet.appearance.name,phrase:this.placingPet.appearance.phrase}}:{}), x: snap(x), y: snap(y), publicAlias: '' };
    this.previewHouse = { ...house, revision: house.revision + 1, furniture: [...house.furniture, item] };
    this.decorationInvalid = house.furniture.length >= 32 ? t('La casa ya tiene 32 muebles.') : placementError(this.previewHouse, item.id,spacePortals(this.previewHouse,this.localPosition.space)); this.lastStageRenderSig = '';
  }
  private commitDecoration(next: PublicHouse, changedId: string): boolean {
    const house = (this.view ? this.ownDecoratedHouse() : undefined); if (!house || next.ownerId !== house.ownerId) return false;
    const error = placementError(next, changedId,spacePortals(next,this.localPosition.space)); if (error) { this.notify(error); return false; }
    this.decorationHistory.remember(house);
    try{assertPetLimit(ownerPetGroups(this.localPosition.space?this.view!.ownHouse:next,space=>sameSpace(space,this.localPosition.space)?{furniture:next.furniture}:new PetWorkspaces(next.ownerId).get(next.ownerId,space)));}catch(e){this.notify(errorMessage(e));return false;}
    const furniture = next.furniture.map(f => {const id=f.id==='placing-preview'?crypto.randomUUID():f.id;return {...f,id,...(petSpecies(f.kind)&&!f.pet?{pet:newPetConfig(id)}:{})};});
    this.selectedFurnitureId = furniture.find(f => f.id === changedId)?.id || furniture.at(-1)?.id || null;
    this.actions.updateOwnHouse({ ...next, furniture, revision: house.revision + 1 }); this.lastStageRenderSig = ''; return true;
  }

  private openHouse(ownerId: string): void {
    const view = this.view;
    if (!view || !ownerId || view.network.pendingAccess) return;
    const isOwn = ownerId === view.identity.fingerprint;
    const house = isOwn ? view.ownHouse : view.network.houses.find((item) => item.ownerId === ownerId);
    if (!house) return;
    if (!isOwn && (view.network.phase !== 'JOINED' || house.access === 'locked' && !hasHouseAccess(house,view.identity.fingerprint))) return;
    if (view.network.phase === 'JOINED') this.run(() => this.actions.visitHouse(ownerId));
    this.expansion.closeModal();
    if (isOwn) {
      this.houseOwnerId = ownerId;
      this.waitingHouseId = null;
      this.pane = 'house';
      this.currentArea = 'residential';
      this.localPosition = { ...HOUSE_SPAWN };
    } else {
      this.waitingHouseId = ownerId;
      this.notify(house.access === 'ask' ? t('Solicitud enviada. Espera a que te abran la puerta.') : t('Entrando en la casa…'));
    }
    this.refresh();
  }

  private changeWorldArea(area: BuiltinAreaId, spawn: Position): void {
    if (this.pane !== 'world') this.leaveCurrentHouse();
    this.expansion.closeModal();
    this.pendingInteraction = null;
    this.currentArea = area;
    this.localPosition = { ...spawn, moving: false };
    this.moveTarget = null;
    this.lastStageRenderSig = '';
    this.actions.move({ ...this.localPosition, areaId: area });
    this.expansion.refreshStageControls();
    this.refreshPane();
  }

  private leaveCurrentHouse(): void {
    this.wardrobe.close(true);
    this.endDecoration();
    this.spaces.root.close();this.roomWorkspace.root.close();
    const view = this.view;
    if (!view) return;
    if (view.network.phase === 'JOINED' && (this.houseOwnerId || this.waitingHouseId)) this.run(() => this.actions.leaveHouse());
    if(view.network.phase!=='JOINED'&&this.localPosition.space)this.actions.workspaceCommand({action:'enter',owner:view.identity.fingerprint,space:null});
    const leftHouse = this.houseOwnerId;
    this.houseOwnerId = null;
    this.waitingHouseId = null;
    this.selectedFurnitureId = null;
    this.expansion.closeModal();
    this.pane = 'world';
    // Step out onto the street in front of the house you were in.
    const parcel = leftHouse ? occupiedParcels(view).find((item) => item.ownerId === leftHouse)?.parcel : undefined;
    if (leftHouse) this.currentArea = 'residential';
    this.localPosition = parcel
      ? { x: parcel.doorX, y: parcel.doorY + (parcel.doorY < 200 ? 16 : -16), direction: parcel.doorY < 200 ? 'down' : 'up', moving: false }
      : { ...WORLD_AREAS[this.currentArea].defaultSpawn };
    this.stopMoving();
    this.lastStageRenderSig = '';
    this.actions.move({ ...this.localPosition, areaId: this.currentArea });
    this.refresh();
  }

  private baseHouse():PublicHouse|null {
    const view=this.view;if(!view)return null;
    return !this.houseOwnerId||this.houseOwnerId===view.identity.fingerprint?(view.network.serverHouse??view.ownHouse):view.network.houses.find(h=>h.ownerId===this.houseOwnerId)??null;
  }
  private currentHouse(): PublicHouse | null {
    const house=this.baseHouse();if(!house)return null;
    const space=this.localPosition.space;if(!space)return house;
    const workspace=this.view?.network.workspace;
    const doc=workspace?.houseId===house.ownerId&&sameSpace(workspace.space,space)?workspace.document:null;
    return {...house,theme:doc?.theme??house.theme,name:workspaceTitle(house,space),furniture:doc?.furniture??[]};
  }
  private ownDecoratedHouse():PublicHouse { return this.houseOwnerId===this.view?.identity.fingerprint?this.currentHouse()??this.view!.ownHouse:this.view!.ownHouse; }
  private enterSpace(space:HouseSpace|null):void {
    this.wardrobe.close(true);
    if(this.view?.network.pendingAccess)return;
    const owner=this.houseOwnerId;if(!owner)return;this.endDecoration();this.stopMoving();this.actions.workspaceCommand({action:'enter',owner,space});
  }
  private leaveInterior():void {
    const space=this.localPosition.space;
    if(space)this.enterSpace(space.roomId?{floorId:space.floorId,roomId:null}:null);else this.leaveCurrentHouse();
  }
  private patchOwnHouse(patch: Partial<PublicHouse>): void {
    const view = this.view;
    if (!view) return;
    const house=this.ownDecoratedHouse();this.actions.updateOwnHouse({ ...house, ...patch, revision: house.revision + 1 });
  }

  private boardId(): string {
    if (this.customBoardId) return this.customBoardId;
    const view = this.view;
    const isOwn = !this.houseOwnerId || this.houseOwnerId === view?.identity.fingerprint;
    const scope = isOwn ? 'own' : this.houseOwnerId!;
    if(this.localPosition.space?.roomId)return scopedBoard(scope,this.localPosition.space,this.activeBoardFurnitureId||'board');
    return houseBoardId(scope, this.activeBoardFurnitureId || 'board');
  }

  private applyFurnitureSprite(item:Furniture,data:string):boolean {
    if(!this.localPosition.space){setFurnitureCustomSprite(item.kind,data);return true;}
    const doc=this.view?.network.workspace?.document,house=this.currentHouse();if(!doc||!house)return false;
    const furniture=house.furniture.map(f=>f.id===item.id?{...f,sprite:data}:f);
    if(!workspaceSchema.safeParse({...doc,furniture}).success){this.notify(t('La imagen y el contenido de la habitación deben ocupar menos de 40 KB. Usa una imagen más pequeña.'));return false;}
    this.actions.updateOwnHouse({...house,furniture});return true;
  }
  private localBoardFor(furniture:string):string {
    const scope=!this.houseOwnerId||this.houseOwnerId===this.view?.identity.fingerprint?'own':this.houseOwnerId;
    return this.localPosition.space?.roomId?scopedBoard(scope,this.localPosition.space,furniture):houseBoardId(scope,furniture);
  }
  private wireBoardId(): string {
    if(this.customBoardId)return `area:${this.currentArea}:${this.customBoardId}`;
    if(this.localPosition.space?.roomId)return scopedBoard(this.houseOwnerId||this.view!.identity.fingerprint,this.localPosition.space,this.activeBoardFurnitureId||'board');
    return `house:${this.houseOwnerId||this.view?.identity.fingerprint||'0'.repeat(64)}:${this.activeBoardFurnitureId||'board'}`;
  }
  private allStrokes(boardId: string): BoardStroke[] {
    const byId=new Map<string,BoardStroke>();for(const stroke of this.expansion.boardRegistry.getStrokes(boardId))byId.set(stroke.id,{...stroke,boardId});
    if(this.view?.network.boardRef===this.wireBoardId())for(const stroke of this.view.network.strokes){const old=byId.get(stroke.id);if(!old||stroke.seq>=old.seq)byId.set(stroke.id,{...stroke,boardId});}
    return [...byId.values()];
  }
  private boardCommits=new Map<string,Promise<void>>();
  private async commitBoardChanges(changes: BoardStroke[]): Promise<void> {
    // Capture scope before any await: a completed gesture belongs to its original board.
    const boardId=this.boardId(),ref=this.wireBoardId(),online=this.view?.network.phase==='JOINED';
    const original=new Map(this.expansion.boardRegistry.getStrokes(boardId).map(s=>[s.id,structuredClone(s)]));
    this.expansion.boardRegistry.commitStrokes(boardId,changes);
    this.lastBoardRenderSig='';this.boardExtraFrames=3;
    const previous=this.boardCommits.get(ref)??Promise.resolve();
    const job=previous.catch(()=>{}).then(async()=>{
      if(online&&!await this.actions.commitBoard(ref,changes.map(s=>({...s,boardId:ref}))))throw new Error(t('No se pudo guardar la selección.'));
    });
    this.boardCommits.set(ref,job);
    try { await job; }
    catch(error){
      const rejected=new Map(changes.map(s=>[s.id,s]));
      // Roll back only this operation, never a newer stroke or remote revision.
      const restored=this.expansion.boardRegistry.getStrokes(boardId).flatMap(s=>{
        const failed=rejected.get(s.id);if(!failed||s.seq!==failed.seq)return [s];
        const old=original.get(s.id);return old?[old]:[];
      });
      this.expansion.boardRegistry.replaceStrokes(boardId,restored);throw error;
    } finally {
      if(this.boardCommits.get(ref)===job)this.boardCommits.delete(ref);
      this.lastBoardRenderSig='';this.boardExtraFrames=3;this.refreshBoardControls();
    }
  }

  private canDrawBoard(): boolean {
    const view = this.view;
    if (!view || view.lockedIdentity) return false;
    const boardId = this.boardId();
    if (!this.expansion.boardRegistry.canEdit(boardId, view.identity.fingerprint, view.network.isHost)) {
      return false;
    }
    if (this.customBoardId) {
      return true;
    }
    const targetOwner = this.houseOwnerId || view.identity.fingerprint;
    if (view.network.phase !== 'JOINED') return targetOwner === view.identity.fingerprint;
    const own = view.network.members.find((member) => member.identity.fingerprint === view.identity.fingerprint);
    return own?.houseId === targetOwner;
  }

  private boardControlsQueued = false;
  /** History changes after an async commit; refresh undo/redo once the editor has recorded it. */
  private scheduleBoardControls(): void {
    if (this.boardControlsQueued) return; this.boardControlsQueued = true;
    queueMicrotask(() => { this.boardControlsQueued = false; if (this.boardEditor) this.refreshBoardControls(); });
  }

  private undoStroke(): void { void this.boardEditor.undo(); }

  private redoStroke(): void { void this.boardEditor.redo(); }

  /** Deletes one of your own strokes, wherever it currently lives. */
  private removeOwnStroke(stroke: BoardStroke): void { void this.boardEditor.apply([{...stroke,deleted:true}]); }

  private clearOwnStrokes(): void {
    if(!this.view)return;const changes=this.allStrokes(this.boardId()).filter(s=>!s.deleted&&s.author===this.view!.identity.fingerprint).map(s=>({...s,deleted:true}));
    void this.boardEditor.apply(changes).then(ok=>{if(ok)this.notify(t("Se borraron {p0} trazo(s) tuyos.", { p0: changes.length }));});
  }

  /** Boards of my own house: there I may erase, move and edit everyone's layers. */
  private moderatesBoard(): boolean {
    const me = this.view?.identity.fingerprint;
    return !!me && !this.customBoardId && (!this.houseOwnerId || this.houseOwnerId === me);
  }

  private eraserRadius(): number {
    return this.eraserPrefs.diameter / 2 * 768 / Math.max(1, this.boardCanvas.clientWidth) / this.boardCamera().zoom;
  }

  private eraseAt(point: BoardPoint): void {
    this.eraserGesture?.erase(point);
    this.lastBoardRenderSig = '';
    this.boardExtraFrames = 2;
  }

  private isDisplayBoard():boolean{return !this.customBoardId&&this.currentHouse()?.furniture.some(f=>f.id===this.activeBoardFurnitureId&&f.kind==='sketchboard')===true;}

  private boardCamera(): BoardCamera {
    if(this.isDisplayBoard())return DEFAULT_CAMERA;
    return this.boardCameras.get(this.boardId()) ?? DEFAULT_CAMERA;
  }

  private setBoardCamera(camera: BoardCamera): void {
    if(this.isDisplayBoard())return;
    this.boardCameras.set(this.boardId(), camera);
    setText(this.boardZoomLabel, `${Math.round(camera.zoom * 100)}%`);
    this.positionBoardTextInput();
  }

  private zoomBoard(factor: number): void {
    this.setBoardCamera(zoomAt(this.boardCamera(), 384, this.boardHeight / 2, factor));
  }

  private fitBoard(): void {
    const boardId = this.boardId();
    const strokes = visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
    this.setBoardCamera(fitCamera(strokesBounds(strokes, textBox), 768, this.boardHeight));
  }

  private boardWorldPoint(event: MouseEvent): BoardPoint {
    const local = this.canvasPoint(event, this.boardCanvas);
    if(this.isDisplayBoard())return{x:Math.max(0,Math.min(768,local.x)),y:Math.max(0,Math.min(432,local.y))};
    return screenToWorld(this.boardCamera(), local.x, local.y);
  }

  // ------------------------------------------------------------ text tool --

  /** Opens an inline editor at a world point; Enter commits, Escape cancels. */
  private openBoardText(at: BoardPoint): void { if(!this.boardEditor.editAt(at))this.boardEditor.editText(at); }
  private positionBoardTextInput(): void { this.boardEditor?.positionText(); }
  private cancelBoardText(): void { this.boardEditor?.cancel(); }
  private commitBoardText(): void { this.boardEditor?.commitText(); }

  private exportBoard(): void {
    const boardId = this.boardId();
    const strokes = this.boardExportMode.value === 'all'
      ? this.allStrokes(boardId).filter((stroke) => !stroke.deleted)
      : visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
    // The board is infinite, so the export frames everything that was drawn
    // rather than whatever happens to be on screen.
    this.run(async () => this.actions.exportBoard(await renderBoardForExport(strokes)));
  }

  private refreshBoardSwatches(): void {
    const active = this.boardColor.value.toLowerCase();
    for (const [hex, btn] of this.boardSwatchButtons) {
      btn.classList.toggle('is-active', hex === active);
    }
  }

  private insertBoardFormula(formula: string): void {
    if (!this.canDrawBoard()) {
      this.notify(t('Entra en una casa para escribir en su pizarra.'));
      return;
    }
    if (this.boardTextInput) {
      const input = this.boardTextInput;
      const { text, caret } = insertAtSelection(input.value, formula, input.selectionStart, input.selectionEnd);
      input.value = text;
      input.focus();
      input.setSelectionRange(caret, caret);
      return;
    }
    const cam = this.boardCamera();
    const center = clampBoardPoint({
      x: Math.round(cam.x + 384 / cam.zoom - 60),
      y: Math.round(cam.y + 216 / cam.zoom - 16),
    });
    this.boardTool = 'text';
    this.refreshBoardControls();
    this.openBoardText(center);
    const activeInput = this.boardTextInput as HTMLTextAreaElement | null;
    if (activeInput) {
      activeInput.value = formula;
      activeInput.select();
    }
  }

  private insertCoordinateAxes(): void {
    if (!this.canDrawBoard()) {
      this.notify(t('Entra en una casa para dibujar en su pizarra.'));
      return;
    }
    const cam = this.boardCamera();
    const cx = Math.round(cam.x + 384 / cam.zoom);
    const cy = Math.round(cam.y + 216 / cam.zoom);
    const span = Math.round(110 / cam.zoom);
    const color = this.boardColor.value;
    this.saveStroke({
      points: [clampBoardPoint({ x: cx - span, y: cy }), clampBoardPoint({ x: cx + span, y: cy })],
      tool: 'line',
      color,
      width: 2,
    });
    this.saveStroke({
      points: [clampBoardPoint({ x: cx, y: cy - span }), clampBoardPoint({ x: cx, y: cy + span })],
      tool: 'line',
      color,
      width: 2,
    });
  }

  private petScene():string{return this.houseOwnerId?`house:${this.houseOwnerId}:${this.localPosition.space?`${this.localPosition.space.floorId}:${this.localPosition.space.roomId??'-'}`:'lobby'}`:`area:${this.currentArea}`;}
  private interactWithFurniture(item: Furniture): void {
    const view = this.view;
    if (!view || !isInteractiveFurniture(item.kind)) return;
    this.wardrobe.close(true);this.selectedFurnitureId = item.id;
    this.refreshHouseEditor();
    // Room furniture works like the lobby's; activityScope() gives it that room's own projects, flashcards, quizzes and notes.
    if(petSpecies(item.kind)){this.closePhone();this.pets.openHouse(item.pet?.id??item.id);return;}
    switch (item.kind) {
      case 'mailbox': this.openMailbox(this.houseOwnerId||view.identity.fingerprint,this.currentHouse()?.name||'');break;
      case 'pet-atelier': this.stopMoving();this.closePhone();this.petCollection.create();break;
      case 'vanity': this.stopMoving();this.closePhone();this.vanity.open(view.identity);break;
      case 'jukebox': this.stopMoving();this.jukebox.open();break;
      case 'clock': this.stopMoving();this.focusClock.open();break;
      case 'inkdesk': this.stopMoving(); void this.notebooks.open(); break;
      case 'guide': this.closePhone();this.stopMoving();this.speech.say(item.guideText?.trim()||msg('Guía: usa el teléfono para estudiar, visitar amigos y decorar. Mueve o retira esta guía desde Decorar.'),item.x+24,item.y,this.speechScene());break;
      case 'sketchboard':
      case 'board': {
        if(this.houseOwnerId===view.identity.fingerprint)this.syncFurnitureName(item);
        if(item.kind==='sketchboard')this.boardTool='pen';
        this.customBoardId = null;
        this.activeBoardFurnitureId = item.id;
        const house = this.currentHouse() || view.ownHouse;
        const bId = this.boardId();
        this.expansion.boardRegistry.ensureBoard(
          bId,
          item.publicAlias || 'Pizarra de estudio',
          'house',
          house.ownerId || view.identity.fingerprint,
        );
        this.lastLayersSignature = '';
        this.lastBoardRenderSig = '';
        this.navigate('board');
        break;
      }
      case 'desk':
        this.expansion.openActivity('projects');
        break;
      case 'bookshelf':
        this.openStudyAiModal();
        break;
      case 'cabinet':
        this.closePhone(); this.expansion.closeModal(); this.stopMoving();
        this.wardrobe.open(view.identity);
        break;
      case 'flashcards':
        this.closePhone(); this.stopMoving();
        this.expansion.openActivity('study');
        break;
      case 'table':
        this.openPhone('voice');
        break;
    }
  }

  private openStudyAiModal(): void { this.expansion.openActivity('study'); }

  /** '' in the village and the lobby; inside a room, that room's own scope for projects and study apps. */
  private activityScope(): string {
    const space = this.localPosition.space, me = this.view?.identity.fingerprint;
    if (this.pane !== 'house' || !space?.roomId || !me) return '';
    return activityScope(this.houseOwnerId ?? me, space.floorId, space.roomId);
  }

  private runBoardAiLatex(): void {
    if (!this.canDrawBoard()) {
      this.notify(t('Entra en una casa para usar el asistente IA en su pizarra.'));
      return;
    }
    if (this.aiBoardBusy) return;
    this.aiBoardBusy = true;
    const boardId = this.boardId();
    const visible = visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
    const textContext = visible
      .filter((s) => s.tool === 'text' && s.text)
      .map((s) => s.text!)
      .join(' ; ');
    const prompt = this.aiBoardPromptInput.value.trim();
    this.notify(t('✨ Convirtiendo pizarra a fórmula LaTeX…'));

    void (async () => {
      try {
        let imagePngBase64: string | undefined;
        if (visible.length > 0) {
          try {
            const exportedCanvas = await renderBoardForExport(visible);
            imagePngBase64 = exportedCanvas.toDataURL('image/png');
          } catch {
            imagePngBase64 = undefined;
          }
        }
        const res = await this.expansion.ollamaGateway.latex(textContext, prompt, imagePngBase64 || this.boardCanvas.toDataURL('image/png'));
        if (this.pane !== 'board' || this.boardId() !== boardId) return;
        const cam = this.boardCamera();
        const existingCount = visible.length;
        const targetPt = clampBoardPoint({
          x: Math.round(cam.x + 280 / cam.zoom),
          y: Math.round(cam.y + (130 + (existingCount % 5) * 44) / cam.zoom),
        });
        this.saveStroke(
          { points: [targetPt], tool: 'text', color: this.boardColor.value, width: 4 },
          res.latex,
        );
        this.boardExtraFrames = 4;
        this.notify(`✨ ${res.summary} (${res.latex})`);
      } catch (error) { this.notify(errorMessage(error)); } finally {
        this.aiBoardBusy = false;
      }
    })();
  }

  private runBoardAiTutor(mode: 'steps' | 'hint'): void {
    if (!this.canDrawBoard()) {
      this.notify(t('Entra en una casa para usar el tutor IA en su pizarra.'));
      return;
    }
    if (this.aiBoardBusy) return;
    this.aiBoardBusy = true;
    const boardId = this.boardId();
    const visible = visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
    const strokesText = visible
      .filter((s) => s.tool === 'text' && s.text)
      .map((s) => s.text!);
    const prompt = this.aiBoardPromptInput.value.trim();
    this.notify(mode === 'steps' ? t('✨ Generando explicación paso a paso en la pizarra…') : t('💡 Generando pista en la pizarra…'));

    void (async () => {
      try {
        const res = await this.expansion.ollamaGateway.tutor(strokesText, prompt);
        if (this.pane !== 'board' || this.boardId() !== boardId) return;
        const cam = this.boardCamera();
        const baseX = Math.round(cam.x + 420 / cam.zoom);
        const baseY = Math.round(cam.y + 84 / cam.zoom);
        if (mode === 'hint') {
          const pt = clampBoardPoint({ x: baseX, y: baseY });
          this.saveStroke({ points: [pt], tool: 'text', color: '#315f51', width: 8 }, res.hint);
          this.boardExtraFrames = 4;
          this.notify(t('💡 Pista añadida como nota adhesiva en tu capa de la pizarra.'));
        } else {
          res.steps.forEach((stepText, idx) => {
            const pt = clampBoardPoint({
              x: baseX,
              y: baseY + idx * Math.round(86 / cam.zoom),
            });
            this.saveStroke({ points: [pt], tool: 'text', color: BOARD_COLORS[idx % BOARD_COLORS.length], width: 8 }, stepText);
          });
          this.boardExtraFrames = 4;
          this.notify(t("✨ Se añadieron {p0} notas paso a paso en la pizarra.", { p0: res.steps.length }));
        }
      } catch (error) { this.notify(errorMessage(error)); } finally {
        this.aiBoardBusy = false;
      }
    })();
  }

  private runFurnitureSpriteGenerator(targetItem?: Furniture): void {
    const view = this.view;
    if (!view) return;
    const item = targetItem || view.ownHouse.furniture.find((f) => f.id === this.selectedFurnitureId) || view.ownHouse.furniture[0];
    if (!item) {
      this.notify(t('Selecciona un mueble en Mi casa para generarle un sprite pixel-art.'));
      return;
    }
    const prompt = this.aiSpritePromptInput?.value.trim() || item.publicAlias || `${FURNITURE_LABELS[item.kind]} de estudio`;
    this.notify(t("✨ Sintetizando sprite pixel-art para {p0}…", { p0: t(FURNITURE_LABELS[item.kind]) }));
    void this.expansion.ollamaGateway.sprite(item.kind, prompt).then(({ dataUrl }) => {
      if (item.kind === 'board') {
        const bId = this.localBoardFor(item.id);
        this.expansion.boardRegistry.ensureBoard(bId, item.publicAlias || 'Pizarra de estudio', 'house', view.identity.fingerprint);
        this.expansion.boardRegistry.setBoardSprite(bId, dataUrl, view.identity.fingerprint, true);
      } else {
        if(!this.applyFurnitureSprite(item,dataUrl))return;
      }
      if (this.aiSpritePreview) {
        this.aiSpritePreview.src = dataUrl;
        this.aiSpritePreview.hidden = false;
      }
      this.lastStageRenderSig = '';
      this.notify(t("Sprite aplicado a {p0}.", { p0: t(FURNITURE_LABELS[item.kind]) }));
    }).catch(error => this.notify(errorMessage(error)));
  }

  private run(action: () => void | Promise<void>): void {
    try { void Promise.resolve(action()).catch((error: unknown) => this.notify(this.errorMessage(error))); }
    catch (error) { this.notify(this.errorMessage(error)); }
  }

  private errorMessage(error: unknown): string {
    return errorMessage(error);
  }

  private speechScene():string {return `${this.pane}:${this.currentArea}:${this.houseOwnerId}:${spaceKey(this.localPosition.space)}`;}

  private notify(message: string): void {
    this.requestNoticeTarget=null;this.localNotice = message;
    this.localNoticeSeq++;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { this.noticeTimer = null; if (this.localNotice === message) { this.localNotice = null; this.refresh(); } }, 6_000);
    this.refresh();
  }

  /** Only the newest notice counts: a new one replaces what is shown, and older ones just disappear. */
  private currentNotice(view: AppView): string | null {
    const action=this.noticeBox.querySelector<HTMLElement>('[data-request-notice]');if(action)action.hidden=!this.requestNoticeTarget;
    const now = { error: view.network.error || null, local: this.localNotice ? `${this.localNoticeSeq}\u0000${this.localNotice}` : null, app: view.notice || null };
    for (const key of ['error', 'app', 'local'] as const) {
      const value = now[key];
      if (value === this.noticeSources[key]) continue;
      const previous = this.noticeSources[key];
      this.noticeSources[key] = value;
      const text = key === 'local' ? this.localNotice : value;
      if (text) {if(key!=='local')this.requestNoticeTarget=null;this.showNotice(text, key === 'error' ? 10_000 : this.requestNoticeTarget?6_000:7_000);}
      else if (previous && this.shownNotice === (key === 'local' ? previous.slice(previous.indexOf('\u0000') + 1) : previous)) this.shownNotice = null;
    }
    return this.shownNotice;
  }

  private showNotice(text: string, ms: number): void {
    if (/^(Entrando|Entering|Entrée|Entrer|Pizarra abierta|Board opened|Tableau ouvert)/i.test(text)) return;
    this.shownNotice = text;
    if (this.shownNoticeTimer) clearTimeout(this.shownNoticeTimer);
    this.shownNoticeTimer = setTimeout(() => { this.shownNoticeTimer = null; if (this.shownNotice === text) { this.shownNotice = null; this.refresh(); } }, ms);
  }

  /** Closing removes every pending notice, including a network error, until something new happens. */
  private dismissNotices(): void {
    this.requestNoticeTarget=null;this.shownNotice = null;
    if (this.shownNoticeTimer) clearTimeout(this.shownNoticeTimer);
    this.shownNoticeTimer = null;
    this.localNotice = null;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
    this.actions.dismissNotice();
    this.refresh();
  }

  private canvasPoint(event: MouseEvent, canvas: HTMLCanvasElement): BoardPoint {
    const rect = canvas.getBoundingClientRect();
    // Map client coordinates to the logical 768x432 coordinate system even when physical bitmap is 2x HiDPI (1536x864)
    return {
      x: (event.clientX - rect.left) * 768 / (rect.width || 768),
      y: (event.clientY - rect.top) * (canvas === this.boardCanvas ? this.boardHeight : 432) / (rect.height || 432),
    };
  }

  private isTouchDevice(): boolean {
    const touches = navigator.maxTouchPoints || ('ontouchstart' in window ? 1 : 0);
    return touchEnabled(this.controlPrefs.touch, touches);
  }

  private setTouchPreference(touch: ControlPreferences['touch']): void {
    this.controlPrefs = { touch };
    try { saveControls(this.controlPrefs); } catch { this.notify(t('No se pudo guardar la preferencia en este equipo.')); }
    if (this.touchSelect && this.touchSelect.value !== touch) this.touchSelect.value = touch;
    if (!this.isTouchDevice()) { this.moveTarget = null; this.movePath = []; }
    this.refreshTouchControls();
  }

  /** Stable identity of what a tap hit, so two taps on the same object form a double tap. */
  private interactionKey(target: Interaction): string { return `${this.pane}:${this.currentArea}:${Math.round(target.x)}:${Math.round(target.y)}`; }

  private refreshTouchControls(): void {
    if (!this.touchControlsRoot) return;
    const show = this.isTouchDevice();
    this.touchControlsRoot.style.display = show ? 'flex' : 'none';
    if (this.touchToggleBtn) {
      this.touchToggleBtn.classList.toggle('is-active', show);
    }
    if (this.touchPttBtn) {
      this.touchPttBtn.hidden = !Boolean(this.view?.network.media.pushToTalk && this.view?.network.media.micEnabled);
    }
  }

  private triggerInteraction(): void {
    if (!this.view) return;
    if (this.decorating) return;
    if(this.pets.interact())return;
    try { navigator.vibrate?.(15); } catch {}
    if (this.pane === 'world') {
      if(this.currentArea==='residential'&&this.view){const used=new Set(occupiedParcels(this.view).map(p=>p.parcel.slot));if(PARCELS.some(p=>!used.has(p.slot)&&Math.hypot(this.localPosition.x-p.doorX,this.localPosition.y-p.doorY)<60)){this.explainPlot();return;}}
      const portal = closestPortal(this.currentArea, this.localPosition);
      if (portal && closestPortal(this.currentArea, this.localPosition)?.id === portal.id) {
        this.changeWorldArea(portal.toArea, portal.spawnAtTarget);
        this.notify(t("Entrando en {p0}…", { p0: t(WORLD_AREAS[portal.toArea].displayName) }));
        return;
      }
      if (this.currentArea === 'residential') {
        const mailbox=this.nearestGardenMailbox();if(mailbox){this.openMailbox(mailbox.owner,mailbox.name);return;}
        const closest = closestDoor(this.localPosition, occupiedParcels(this.view));
        if (closest) {
          this.openHouse(closest.ownerId);
          return;
        }
      }
      const nearObj = this.expansion.objectRegistry.closestInteractable(
        this.currentArea,
        this.localPosition.x,
        this.localPosition.y,
        this.view.identity.fingerprint,
      );
      if (nearObj) {
        this.expansion.interactWithWorldObject(nearObj);
        return;
      }

    } else if (this.pane === 'house') {
      const entrance=nearestSpacePortal(this.baseHouse()!,this.localPosition);
      if(entrance){this.enterSpace(entrance.target);return;}
      if (atHouseDoor(this.localPosition)) {
        this.leaveInterior();
      } else {
        const house = this.currentHouse() || this.view.ownHouse;
        const near = closestFurniture(this.localPosition, house);
        if (near) {
          this.interactWithFurniture(near);
        }
      }
    }
  }

  private updateTouchActionPrompt(prompt: string | null): void {
    if (!this.touchActionBtn) return;
    this.touchActionBtn.disabled = !prompt;
    if (prompt) {
      this.touchActionBtn.classList.add('is-active-prompt');
      if (prompt.includes(t('Entrar'))) {
        setText(this.touchActionIcon, '🚪');
        setText(this.touchActionLabel, msg('Entrar'));
      } else if (prompt.includes(t('Salir'))) {
        setText(this.touchActionIcon, '🚪');
        setText(this.touchActionLabel, msg('Salir'));
      } else if (prompt.includes(t('Pizarra'))) {
        setText(this.touchActionIcon, '📋');
        setText(this.touchActionLabel, msg('Pizarra'));
      } else if (prompt.includes('Quiz') || prompt.includes(t('Estantería'))) {
        setText(this.touchActionIcon, '📚');
        setText(this.touchActionLabel, msg('Quiz AI'));
      } else if (prompt.includes(t('Planificar')) || prompt.includes(t('Escritorio'))) {
        setText(this.touchActionIcon, '🪑');
        setText(this.touchActionLabel, msg('Estudiar'));
      } else {
        setText(this.touchActionIcon, '⚡');
        setText(this.touchActionLabel, prompt.replace(/^E · /, ''));
      }
    } else {
      this.touchActionBtn.classList.remove('is-active-prompt');
      setText(this.touchActionIcon, '⚡');
      setText(this.touchActionLabel, msg('E · Usar'));
    }
  }

  private buildTouchControls(stageWrap: HTMLElement): void {
    this.touchControlsRoot = node('div', 'sv-touch-controls');
    this.touchControlsRoot.id = 'sv-touch-controls';

    // D-Pad
    const dpad = node('div', 'sv-dpad');
    dpad.setAttribute('role', 'group');
    setDisplayAttribute(dpad, 'aria-label', msg('Cruceta de movimiento táctil'));
    this.touchDpad = dpad;

    const upBtn = button('▲', 'sv-dpad-btn sv-dpad-up');
    setDisplayAttribute(upBtn, 'aria-label', msg('Mover arriba'));
    const middleRow = node('div', 'sv-dpad-middle');
    const leftBtn = button('◀', 'sv-dpad-btn sv-dpad-left');
    setDisplayAttribute(leftBtn, 'aria-label', msg('Mover izquierda'));
    const centerPad = node('div', 'sv-dpad-center');
    const rightBtn = button('▶', 'sv-dpad-btn sv-dpad-right');
    setDisplayAttribute(rightBtn, 'aria-label', msg('Mover derecha'));
    append(middleRow, leftBtn, centerPad, rightBtn);

    const downBtn = button('▼', 'sv-dpad-btn sv-dpad-down');
    setDisplayAttribute(downBtn, 'aria-label', msg('Mover abajo'));

    append(dpad, upBtn, middleRow, downBtn);

    let activeDpadPointer: number | null = null;
    const updateDpad = (clientX: number, clientY: number) => {
      const rect = dpad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const deadzone = 12;

      this.dpadKeys.clear();
      this.moveTarget = null; // direct D-pad cancels tap-to-walk

      if (Math.hypot(dx, dy) >= deadzone) {
        // One direction at a time: a finger slightly off-centre on «up» must not also press «left».
        // Both only when the touch is clearly on a diagonal (within ~15° of 45°).
        const ax = Math.abs(dx), ay = Math.abs(dy);
        const diagonal = Math.min(ax, ay) / Math.max(ax, ay) > 0.75;
        if (diagonal || ay > ax) this.dpadKeys.add(dy < 0 ? 'arrowup' : 'arrowdown');
        if (diagonal || ax > ay) this.dpadKeys.add(dx < 0 ? 'arrowleft' : 'arrowright');
      }

      upBtn.classList.toggle('is-pressed', this.dpadKeys.has('arrowup'));
      downBtn.classList.toggle('is-pressed', this.dpadKeys.has('arrowdown'));
      leftBtn.classList.toggle('is-pressed', this.dpadKeys.has('arrowleft'));
      rightBtn.classList.toggle('is-pressed', this.dpadKeys.has('arrowright'));
    };

    dpad.addEventListener('pointerdown', (e) => {
      activeDpadPointer = e.pointerId;this.heldTouchPointers.set(e.pointerId,dpad);
      try { dpad.setPointerCapture(e.pointerId); } catch {}
      updateDpad(e.clientX, e.clientY);
      try { navigator.vibrate?.(10); } catch {}
      e.preventDefault();
      e.stopPropagation();
    });

    dpad.addEventListener('pointermove', (e) => {
      if (activeDpadPointer === e.pointerId) {
        updateDpad(e.clientX, e.clientY);
        e.preventDefault();
        e.stopPropagation();
      }
    });

    const stopDpad = (e: PointerEvent) => {
      if (activeDpadPointer === e.pointerId) {
        activeDpadPointer = null;this.heldTouchPointers.delete(e.pointerId);
        this.dpadKeys.clear();
        upBtn.classList.remove('is-pressed');
        downBtn.classList.remove('is-pressed');
        leftBtn.classList.remove('is-pressed');
        rightBtn.classList.remove('is-pressed');
        try { if (dpad.hasPointerCapture(e.pointerId)) dpad.releasePointerCapture(e.pointerId); } catch {}
      }
    };
    dpad.addEventListener('pointerup', stopDpad);
    dpad.addEventListener('pointercancel', stopDpad);
    dpad.addEventListener('lostpointercapture',stopDpad);

    // Touch Action Cluster
    const actions = node('div', 'sv-touch-actions');

    this.touchActionBtn = button('', 'sv-touch-action-btn sv-touch-btn-action');
    setDisplayAttribute(this.touchActionBtn, 'aria-label', msg('Interactuar'));
    this.touchActionBtn.dataset.testid = 'touch-action-btn';
    this.touchActionIcon = node('span', 'sv-touch-btn-icon', '⚡');
    this.touchActionLabel = node('span', 'sv-touch-btn-label', msg('E · Usar'));
    append(this.touchActionBtn, this.touchActionIcon, this.touchActionLabel);
    this.touchActionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.triggerInteraction();
    });

    this.touchPttBtn = button('', 'sv-touch-action-btn sv-touch-btn-ptt');
    setDisplayAttribute(this.touchPttBtn, 'aria-label', msg('Pulsar para hablar'));
    const pttIcon = node('span', 'sv-touch-btn-icon', '🎙️');
    const pttLabel = node('span', 'sv-touch-btn-label', msg('PTT'));
    append(this.touchPttBtn, pttIcon, pttLabel);
    this.touchPttBtn.hidden = true;

    this.touchPttBtn.addEventListener('pointerdown', (e) => {
      this.heldTouchPointers.set(e.pointerId,this.touchPttBtn);try{this.touchPttBtn.setPointerCapture(e.pointerId);}catch{}
      e.preventDefault();
      e.stopPropagation();
      if (this.view?.network.media.pushToTalk) {
        this.actions.setTalking(true);
        this.touchPttBtn.classList.add('is-talking');
        try { navigator.vibrate?.(12); } catch {}
      }
    });
    const releasePtt = (e: PointerEvent) => {
      this.heldTouchPointers.delete(e.pointerId);
      if (this.view?.network.media.pushToTalk) {
        this.actions.setTalking(false);
        this.touchPttBtn.classList.remove('is-talking');
      }
    };
    this.touchPttBtn.addEventListener('pointerup', releasePtt);
    this.touchPttBtn.addEventListener('pointercancel', releasePtt);
    this.touchPttBtn.addEventListener('lostpointercapture',releasePtt);

    const sprint = button(msg('Correr'), 'sv-touch-action-btn');
    sprint.dataset.testid='touch-sprint-btn';
    setDisplayAttribute(sprint, 'aria-label', msg('Mantener para correr'));
    sprint.addEventListener('pointerdown', event => { this.heldTouchPointers.set(event.pointerId,sprint);this.touchSprint = true; sprint.setPointerCapture(event.pointerId); event.preventDefault(); });
    sprint.addEventListener('pointerup', () => { this.touchSprint = false; });
    sprint.addEventListener('pointercancel', () => { this.touchSprint = false; });
    sprint.addEventListener('lostpointercapture', () => { this.touchSprint = false; });
    append(actions, sprint, this.touchPttBtn, this.touchActionBtn);
    append(this.touchControlsRoot, dpad, actions);

    // Floating toggle button on stage
    this.touchToggleBtn = button(msg('Mostrar u ocultar controles táctiles'), 'sv-button');
    setDisplayAttribute(this.touchToggleBtn, 'aria-label', msg('Alternar controles táctiles en pantalla'));
    this.touchToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const on = !this.isTouchDevice();
      this.setTouchPreference(on ? 'on' : 'off');
      this.notify(on ? t('Controles táctiles activados') : t('Controles táctiles ocultados'));
    });

    append(stageWrap, this.touchControlsRoot);
    this.touchToggleBtn.hidden = true; this.settingsSection('Controles').append(this.touchToggleBtn);
    this.refreshTouchControls();
  }

  private openMailbox(owner:string,name:string):void {this.closePhone();this.stopMoving();this.speech.clear();this.mailbox.open(owner,defaultText(name));}
  private gardenMailboxes(){
    if(!this.view||this.pane!=='world'||this.currentArea!=='residential'||this.garden.active)return [];
    return occupiedParcels(this.view).flatMap(parcel=>(parcel.house.garden??[]).filter(item=>item.kind==='mailbox').map(item=>({owner:parcel.ownerId,name:parcel.house.name,id:item.id,rect:gardenItemRect(parcel.parcel,resolveGardenItem(parcel.parcel,item))})));
  }
  private nearestGardenMailbox(){
    return this.gardenMailboxes().map(item=>({...item,distance:Math.hypot(this.localPosition.x-(item.rect.x+16),this.localPosition.y-(item.rect.y+28))})).filter(item=>item.distance<=INTERACTION_REACH+12).sort((a,b)=>a.distance-b.distance)[0]??null;
  }

  /** What a click on the stage would use, and where to stand to use it. */
  private explainPlot():void{
    this.stopMoving();const dialog=node('dialog','sv-pet-panel');setDisplayAttribute(dialog,'aria-label',msg('Cómo obtener una parcela'));
    dialog.append(node('h2','',msg('Cómo obtener una parcela')),node('p','',msg('La parcela es gratuita. En un servidor se asigna al entrar como residente con una identidad guardada. Las identidades temporales son visitantes. En una aldea temporal tu casa recibe una parcela durante la sesión.')));
    const settings=button(msg('Ajustes'),'sv-button');settings.onclick=()=>{dialog.close();this.settingsDialog.showModal();};const close=button(msg('Cerrar'),'sv-button');close.onclick=()=>dialog.close();dialog.append(settings,close);dialog.onclose=()=>dialog.remove();this.shell.append(dialog);dialog.showModal();
  }
  private interactionAt(point: BoardPoint): Interaction | null {
    const view = this.view!;
    if (this.pane === 'world') {
      if(this.currentArea==='residential'){const used=new Set(occupiedParcels(view).map(p=>p.parcel.slot));const empty=PARCELS.find(p=>!used.has(p.slot)&&pointInRect(point.x,point.y,p));if(empty)return{x:empty.doorX,y:empty.doorY,near:()=>Math.hypot(this.localPosition.x-empty.doorX,this.localPosition.y-empty.doorY)<72,run:()=>this.explainPlot()};}
      const portal = WORLD_AREAS[this.currentArea].portals.find((p) => pointInRect(point.x, point.y, p.rect));
      if (portal) {
        return {
          x: portal.rect.x + portal.rect.w / 2, y: portal.rect.y + portal.rect.h / 2,
          near: () => closestPortal(this.currentArea, this.localPosition)?.id === portal.id,
          run: () => { this.changeWorldArea(portal.toArea, portal.spawnAtTarget); this.notify(t("Entrando en {p0}…", { p0: t(WORLD_AREAS[portal.toArea].displayName) })); },
        };
      }
      if (this.currentArea === 'residential') {
        const mailbox=this.gardenMailboxes().find(item=>pointInRect(point.x,point.y,item.rect));
        if(mailbox){
          const b=WORLD_AREAS.residential.bounds,obstacles=worldObstacles(occupiedParcels(view));
          const r=mailbox.rect,candidates=[{x:r.x+16,y:r.y+42},{x:r.x+16,y:r.y-12},{x:r.x-12,y:r.y+24},{x:r.x+44,y:r.y+24}];
          const target=candidates.find(p=>p.x>=b.x+9&&p.x<=b.x+b.w-9&&p.y>=b.y+9&&p.y<=b.y+b.h-9&&findPath(this.localPosition,p,obstacles,b))??candidates[0];
          return {...target,near:()=>Math.hypot(this.localPosition.x-(r.x+16),this.localPosition.y-(r.y+28))<=INTERACTION_REACH+12,run:()=>this.openMailbox(mailbox.owner,mailbox.name)};
        }
        const item = occupiedParcels(view).find((candidate) => pointInRect(point.x, point.y, candidate.parcel));
        if (!item) return null;
        const top = item.parcel.doorY < 200;
        return {
          x: item.parcel.doorX, y: item.parcel.doorY + (top ? 14 : -14),
          near: () => closestDoor(this.localPosition, occupiedParcels(this.view!))?.ownerId === item.ownerId,
          run: () => this.openHouse(item.ownerId),
        };
      }
      const obj = this.expansion.objectRegistry.hitTest(this.currentArea, point.x, point.y, view.identity.fingerprint);
      if (!obj) return null;
      const bounds = WORLD_AREAS[this.currentArea].bounds;
      const below = obj.y + obj.h + 14;
      return {
        x: obj.x + obj.w / 2,
        y: below <= bounds.y + bounds.h - 12 ? below : obj.y - 14,
        near: () => this.expansion.objectRegistry.closestInteractable(this.currentArea, this.localPosition.x, this.localPosition.y, this.view!.identity.fingerprint)?.id === obj.id,
        run: () => this.expansion.interactWithWorldObject(obj),
      };
    }
    if (this.pane !== 'house') return null;
    const house = this.currentHouse();
    if (!house) return null;
    const entrance=spacePortals(this.baseHouse()!,this.localPosition.space).find(p=>Math.abs(point.x-p.x)<=26&&point.y>=p.y-44&&point.y<=p.y+8);
    if(entrance)return{x:entrance.x,y:entrance.y+12,near:()=>nearestSpacePortal(this.baseHouse()!,this.localPosition)?.target.roomId===entrance.target.roomId&&nearestSpacePortal(this.baseHouse()!,this.localPosition)?.target.floorId===entrance.target.floorId,run:()=>this.enterSpace(entrance.target)};
    if (point.y >= 384 && point.x >= 340 && point.x <= 428) {
      return { x: HOUSE_DOOR.x, y: HOUSE_DOOR.y - 14, near: () => atHouseDoor(this.localPosition), run: () => this.leaveInterior() };
    }
    const item = hitInteractiveFurniture(house, point.x, point.y);
    if (!item) return null;
    const rect = furnitureRect(item);
    const below = rect.y + rect.h + 12;
    return {
      x: rect.x + rect.w / 2, y: below < 396 ? below : rect.y - 12,
      near: () => closestFurniture(this.localPosition, this.currentHouse() || house)?.id === item.id,
      run: () => this.interactWithFurniture(item),
    };
  }

  /** Walks around trees, fences and furniture to a point; false when there is no way there. */
  private walkTo(x: number, y: number): boolean {
    const view = this.view;
    if (!view) return false;
    const house = this.pane === 'house' ? this.currentHouse() || view.ownHouse : null;
    const obstacles = house ? houseObstacles(house)
      : this.currentArea === 'residential' ? worldObstacles(occupiedParcels(view)) : [...this.expansion.objectRegistry.obstaclesForArea(this.currentArea), ...lampObstacles(this.currentArea)];
    const path = findPath(this.localPosition, { x, y }, obstacles, house ? HOUSE_BOUNDS : WORLD_AREAS[this.currentArea].bounds);
    if (!path) { this.notify(t('No hay camino hasta ahí.')); return false; }
    this.moveTarget = path.shift() ?? { x, y };
    this.movePath = path;
    return true;
  }

  private onStagePointerDown = (event: PointerEvent): void => {
    const view = this.view;
    if (!view || this.settingsDialog.open || this.activityOpen || (this.wardrobe.isOpen()||this.vanity.root.open||this.petCollection.atelier.root.open||this.petCollection.root.open)) return;
    if (!this.phone.hidden) { this.closePhone(); return; }
    const point = this.canvasPoint(event, this.stageCanvas);
    if(!this.decorating&&!this.garden.active&&this.pets.hit(point)){event.preventDefault();return;}
    if(this.garden.active){this.garden.pointerDown(point);this.stageCanvas.setPointerCapture(event.pointerId);event.preventDefault();return;}
    if(this.decorating&&this.doorSaving)return;
    if(this.decorating&&!this.pendingFurniture&&this.pane==='house'&&this.houseOwnerId===view.identity.fingerprint){
      const house=this.currentHouse()!,portal=spacePortals(house,this.localPosition.space).find(p=>Math.abs(point.x-p.x)<=26&&point.y>=p.y-44&&point.y<=p.y+8);
      if(portal){this.doorDrag={id:portal.id,offsetX:point.x-portal.x,offsetY:point.y-portal.y,base:house};this.stageCanvas.setPointerCapture(event.pointerId);event.preventDefault();return;}
    }
    if (this.decorating && this.pendingFurniture && this.pane === 'house') {
      this.previewNewFurniture(point.x, point.y);
      if (this.previewHouse && !this.decorationInvalid) { const item = this.previewHouse.furniture.at(-1)!; if (this.commitDecoration(this.previewHouse, item.id)) { this.pendingFurniture = null; this.placingPet=null;this.previewHouse = null; } }
      else this.notify(this.decorationInvalid || t('Elige una posición libre.'));
      return;
    }
    this.stagePointers.add(event.pointerId);
    // A second finger is a pinch or a pan, never half of a double tap.
    if (this.stagePointers.size > 1 || !event.isPrimary) { this.stageTaps.reset(); return; }
    const allowTapMove = this.isTouchDevice();
    const target = this.interactionAt(point);
    if (this.pane === 'house') {
      const house = this.currentHouse();
      const item = house ? hitFurniture(house, point.x, point.y) : null;
      this.selectedFurnitureId = item && (this.decorating || isInteractiveFurniture(item.kind)) ? item.id : null;
      this.refreshHouseEditor();
      if (!this.decorating && item && !isInteractiveFurniture(item.kind)) { this.stageTaps.reset(); return; }
      // Furniture moves only while explicitly decorating.
      if (this.decorating && item && house && house.ownerId === view.identity.fingerprint) {
        this.drag = { id: item.id, offsetX: point.x - item.x, offsetY: point.y - item.y, baseHouse: house };
        this.dragMoved = false;
        this.stageCanvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }
    if (this.decorating) { this.stageTaps.reset(); return; }
    const double = this.stageTaps.accept({ x: event.clientX, y: event.clientY, time: event.timeStamp, target: target ? this.interactionKey(target) : null });
    if (target && double) {
      // A deliberate double tap approaches the target, then uses the same reach check as E.
      event.preventDefault();
      this.pendingInteraction = null; this.moveTarget = null; this.movePath = [];
      if(target.near())target.run();else if(this.walkTo(target.x,target.y))this.pendingInteraction=target;
      return;
    }
    // A single click never opens anything. With touch controls it walks closer,
    // but does not open on arrival, so a second tap cannot hit the next screen.
    if (!allowTapMove) return;
    this.pendingInteraction = null;
    if (target) this.walkTo(target.x, target.y); else this.walkTo(point.x, point.y);
  };

  private onStagePointerMove = (event: PointerEvent): void => {
    if(this.garden.active){this.garden.pointerMove(this.canvasPoint(event,this.stageCanvas));return;}
    if(this.doorDrag){
      const p=this.canvasPoint(event,this.stageCanvas),snap=(n:number)=>this.decorationGrid?Math.round(n/8)*8:Math.round(n);
      const x=Math.max(64,Math.min(704,snap(p.x-this.doorDrag.offsetX))),y=Math.max(128,Math.min(368,snap(p.y-this.doorDrag.offsetY)));
      const base=this.doorDrag.base;this.previewHouse={...base,doorPositions:{...base.doorPositions,[this.doorDrag.id]:{x,y}}};
      const other=spacePortals(base,this.localPosition.space).some(d=>d.id!==this.doorDrag!.id&&Math.abs(d.x-x)<56&&Math.abs(d.y-y)<64);
      const blocked=Math.hypot(x-HOUSE_DOOR.x,y-HOUSE_DOOR.y)<64||Math.hypot(x-HOUSE_SPAWN.x,y-HOUSE_SPAWN.y)<36||base.furniture.map(furnitureRect).some(r=>x+24>r.x&&x-24<r.x+r.w&&y+22>r.y&&y-44<r.y+r.h);
      this.decorationInvalid=other||blocked?t('Deja libre la puerta y separa las entradas.'):null;this.lastStageRenderSig='';event.preventDefault();return;
    }
    if (this.decorating && this.pendingFurniture) { const p = this.canvasPoint(event, this.stageCanvas); this.previewNewFurniture(p.x, p.y); return; }
    if (!this.drag || !this.view) return;
    const point = this.canvasPoint(event, this.stageCanvas);
    const snap = (n: number) => this.decorationGrid ? Math.round(n / 8) * 8 : n;
    const x = snap(point.x - this.drag.offsetX);
    const y = snap(point.y - this.drag.offsetY);
    const item = this.drag.baseHouse.furniture.find((f) => f.id === this.drag!.id);
    if (!this.dragMoved && item && Math.hypot(item.x - x, item.y - y) < 4) return;
    this.dragMoved = true;
    this.previewHouse = moveFurniture(this.drag.baseHouse, this.drag.id, x, y, this.view.identity.fingerprint);
    this.decorationInvalid = placementError(this.previewHouse, this.drag.id,spacePortals(this.previewHouse,this.localPosition.space));
  };

  private onStagePointerUp = (event: PointerEvent): void => {
    this.stagePointers.delete(event.pointerId);
    if(this.garden.active){this.garden.pointerUp(event.type!=='pointerup');if(this.stageCanvas.hasPointerCapture(event.pointerId))this.stageCanvas.releasePointerCapture(event.pointerId);return;}
    if(this.doorDrag){
      if(this.stageCanvas.hasPointerCapture(event.pointerId))this.stageCanvas.releasePointerCapture(event.pointerId);
      const preview=this.previewHouse;this.doorDrag=null;
      if(event.type==='pointerup'&&preview&&!this.decorationInvalid){
        this.doorSaving=true;this.run(async()=>{try{await this.actions.saveHouseLayout({...this.baseHouse()!,doorPositions:preview.doorPositions});}finally{this.doorSaving=false;this.previewHouse=null;this.lastStageRenderSig='';}});
      }else{if(this.decorationInvalid)this.notify(this.decorationInvalid);this.previewHouse=null;}
      this.decorationInvalid=null;this.stageTaps.reset();return;
    }
    if (!this.drag) return;
    if (this.stageCanvas.hasPointerCapture(event.pointerId)) this.stageCanvas.releasePointerCapture(event.pointerId);
    const clicked = !this.dragMoved && event.type === 'pointerup';
    if (event.type === 'pointerup' && this.previewHouse && this.previewHouse !== this.drag.baseHouse) this.commitDecoration(this.previewHouse, this.drag.id);
    this.previewHouse = null;
    this.drag = null;
    if (!clicked) this.stageTaps.reset();
  };

  private get boardHandMode():boolean{return this.boardTool==='hand'&&!this.richBoardTool;}
  /** In Pen mode fingers navigate instead of creating or erasing content. Selection stays available. */
  private get boardTouchNavigates():boolean{return this.boardHandMode||(this.pencilMode&&(this.boardTool!=='select'||!!this.richBoardTool));}
  private prepareBoardToolChange():void {
    this.cancelBoardGesture(false);this.boardPalms.quarantineTouches();this.activeBoardPointers.clear();
  }
  /** The pen owns its draft. Other contacts can never finish it or turn it into a pinch. */
  private cancelBoardGesture(clearTouches=true):void {
    if(this.boardPointer?.kind==='pen')this.boardPalms.penUp(performance.now());
    const id=this.boardPointer?.id;this.boardPointer=null;
    this.boardDraft=null;this.richBoardDraft=null;this.boardPan=null;this.boardErasing=null;this.eraserGesture=null;
    this.boardEditor?.cancelGesture();this.lastPinchDistance=0;this.lastPinchCenter=null;
    if(clearTouches){this.activeBoardPointers.clear();this.boardPalms.reset();}
    if(clearTouches&&id!==undefined&&this.boardCanvas?.hasPointerCapture(id))this.boardCanvas.releasePointerCapture(id);
    this.lastBoardRenderSig='';this.boardExtraFrames=2;
  }
  private captureBoardPointer(event:PointerEvent):void {try{this.boardCanvas.setPointerCapture(event.pointerId);}catch{/* A cancelled native contact may already have ended. */}}
  private startBoardTouch():void {
    const points=[...this.activeBoardPointers.values()];
    this.lastPinchDistance=points.length===2?Math.hypot(points[0].clientX-points[1].clientX,points[0].clientY-points[1].clientY):0;
    this.lastPinchCenter=points.length===2?{clientX:(points[0].clientX+points[1].clientX)/2,clientY:(points[0].clientY+points[1].clientY)/2}:null;
    this.boardPan=null;
    if(points.length===1&&this.boardTouchNavigates){const [id,point]=[...this.activeBoardPointers][0];this.boardPan={pointerId:id,x:point.clientX,y:point.clientY};}
  }
  private onBoardPointerDown = (event: PointerEvent): void => {
    const kind=event.pointerType;
    if(kind==='mouse'&&event.button!==0&&event.button!==1)return;
    event.preventDefault();
    if(kind==='pen'){
      detectPencil(kind);
      // Recover from a missing pointerup without keeping an orphaned draft owner.
      this.cancelBoardGesture(false);this.activeBoardPointers.clear();
      this.boardPalms.penDown();
    }else if(kind==='touch'){
      if(!this.boardPalms.touchDown(event,false,this.boardTouchNavigates)){
        let removed=false;for(const id of this.activeBoardPointers.keys())if(this.boardPalms.ignores(id)){this.activeBoardPointers.delete(id);removed=true;}
        if(removed)this.startBoardTouch();this.captureBoardPointer(event);return;
      }
      this.activeBoardPointers.set(event.pointerId,{clientX:event.clientX,clientY:event.clientY});this.captureBoardPointer(event);
      if(this.activeBoardPointers.size>1){this.cancelBoardGesture(false);this.startBoardTouch();return;}
      if(this.boardTouchNavigates){this.startBoardTouch();return;}
    }
    if(this.boardPointer)return;
    this.boardPointer={id:event.pointerId,kind};this.captureBoardPointer(event);
    if(this.boardEditor.pointerDown(event,this.boardTool==='select'))return;
    if(event.button===1||this.boardHandMode){
      this.boardPan={pointerId:event.pointerId,x:event.clientX,y:event.clientY};this.captureBoardPointer(event);return;
    }
    if(event.button!==0||!this.canDrawBoard())return;
    const point=clampBoardPoint(this.boardWorldPoint(event));
    if(this.boardTool==='eraser'){
      this.boardErasing=event.pointerId;this.boardCursor=this.canvasPoint(event,this.boardCanvas);
      this.eraserGesture=new EraserGesture(this.allStrokes(this.boardId()),s=>!this.hiddenAuthors.has(s.author)&&(s.author===this.view?.identity.fingerprint||this.moderatesBoard()),this.eraserPrefs.mode,this.eraserRadius(),textBox);
      this.captureBoardPointer(event);this.eraseAt(point);return;
    }
    if(boardAtCapacity(this.allStrokes(this.boardId()),this.boardId()))return;
    if(this.richBoardTool){this.richBoardDraft={kind:this.richBoardTool,start:point,current:point};this.captureBoardPointer(event);return;}
    if(this.boardTool==='text'){this.openBoardText(point);return;}
    const tool=this.boardTool;if(tool==='select'||tool==='hand')return;
    this.boardDraft={points:[point],tool,color:this.boardColor.value,width:Number(this.boardWidth.value)};
    this.captureBoardPointer(event);this.boardExtraFrames=2;
  };

  private onBoardPointerMove = (event: PointerEvent): void => {
    if(event.pointerType==='touch'&&!this.boardPalms.touchMove(event,false)){event.preventDefault();if(this.activeBoardPointers.delete(event.pointerId))this.startBoardTouch();return;}
    if(event.pointerType==='touch'&&this.boardPointer?.kind==='pen'){event.preventDefault();return;}
    if(this.activeBoardPointers.has(event.pointerId))this.activeBoardPointers.set(event.pointerId,{clientX:event.clientX,clientY:event.clientY});
    if(event.pointerType==='touch'&&this.activeBoardPointers.size===2){
      event.preventDefault();const points=[...this.activeBoardPointers.values()];
      const distance=Math.hypot(points[0].clientX-points[1].clientX,points[0].clientY-points[1].clientY);
      const center={clientX:(points[0].clientX+points[1].clientX)/2,clientY:(points[0].clientY+points[1].clientY)/2};
      if(this.lastPinchCenter){
        const scale=768/Math.max(1,this.boardCanvas.getBoundingClientRect().width),anchor=this.canvasPoint(this.lastPinchCenter as MouseEvent,this.boardCanvas);
        let camera=this.boardCamera();if(this.lastPinchDistance>8&&distance>8)camera=zoomAt(camera,anchor.x,anchor.y,distance/this.lastPinchDistance);
        this.setBoardCamera(panBy(camera,(center.clientX-this.lastPinchCenter.clientX)*scale,(center.clientY-this.lastPinchCenter.clientY)*scale));
      }
      this.lastPinchDistance=distance;this.lastPinchCenter=center;return;
    }
    this.boardCursor=this.canvasPoint(event,this.boardCanvas);
    if(this.boardPan?.pointerId===event.pointerId){
      event.preventDefault();const scale=768/Math.max(1,this.boardCanvas.getBoundingClientRect().width);
      this.setBoardCamera(panBy(this.boardCamera(),(event.clientX-this.boardPan.x)*scale,(event.clientY-this.boardPan.y)*scale));
      this.boardPan={pointerId:event.pointerId,x:event.clientX,y:event.clientY};return;
    }
    if(this.boardPointer?.id!==event.pointerId)return;
    event.preventDefault();if(this.boardEditor.pointerMove(event))return;
    if(this.boardErasing===event.pointerId){this.eraseAt(clampBoardPoint(this.boardWorldPoint(event)));return;}
    if(this.richBoardDraft){this.richBoardDraft.current=clampBoardPoint(this.boardWorldPoint(event));this.boardExtraFrames=2;return;}
    if(!this.boardDraft)return;
    const rect=this.boardCanvas.getBoundingClientRect(),camera=this.boardCamera();
    for(const sample of pointerSamples(event)){
      const point=clampBoardPoint(screenToWorld(camera,(sample.clientX-rect.left)*768/(rect.width||768),(sample.clientY-rect.top)*this.boardHeight/(rect.height||432))),points=this.boardDraft.points;
      if(this.boardDraft.tool==='pen'){
        const last=points.at(-1)!;if(points.length<LIMITS.strokePoints&&Math.hypot(point.x-last.x,point.y-last.y)>=.15/this.boardCamera().zoom)points.push(point);
      }else points[1]=point;
    }
    this.boardExtraFrames=2;
  };

  private onBoardPointerUp = (event: PointerEvent): void => {
    if(event.pointerType==='touch'){
      const ignored=this.boardPalms.ignores(event.pointerId);this.boardPalms.touchEnd(event.pointerId);
      if(ignored){if(this.activeBoardPointers.delete(event.pointerId))this.startBoardTouch();return;}
    }
    const owner=this.boardPointer?.id===event.pointerId&&this.boardPointer.kind===event.pointerType;
    if(owner&&event.type==='pointerup')this.onBoardPointerMove(event);
    const tracked=this.activeBoardPointers.delete(event.pointerId);
    if(!owner){if(tracked)this.startBoardTouch();return;}
    if(this.boardPointer?.kind==='pen')this.boardPalms.penUp(event.timeStamp);
    this.boardPointer=null;
    if(event.type!=='pointerup'){this.cancelBoardGesture(false);this.startBoardTouch();return;}
    if(this.boardEditor.pointerUp(event)){this.startBoardTouch();return;}
    if(this.boardCanvas.hasPointerCapture(event.pointerId))this.boardCanvas.releasePointerCapture(event.pointerId);
    if(this.boardPan?.pointerId===event.pointerId){this.boardPan=null;this.startBoardTouch();return;}
    if(this.boardErasing===event.pointerId){
      const conflict=this.eraserGesture?.conflicts(this.allStrokes(this.boardId())),changes=this.eraserGesture?.changes()??[];
      this.boardErasing=null;this.eraserGesture=null;
      if(conflict)this.notify(t('El dibujo cambió durante el borrado. Vuelve a intentarlo.'));else if(changes.length)void this.boardEditor.apply(changes);
      this.lastBoardRenderSig='';return;
    }
    if(this.richBoardDraft&&this.view){const draft=this.richBoardDraft;this.richBoardDraft=null;this.saveStroke({points:[draft.start,draft.current],tool:draft.kind,color:this.boardColor.value,width:Number(this.boardWidth.value)});this.boardExtraFrames=3;this.refreshBoardControls();return;}
    const draft=this.boardDraft;if(draft)this.saveStroke(draft);this.boardDraft=null;
  };

  private onBoardWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const local = this.canvasPoint(event, this.boardCanvas);
    // Ctrl+wheel is also what a trackpad pinch sends, so it zooms; a plain
    // wheel or two-finger swipe pans, as in other infinite canvases.
    if (event.ctrlKey || event.metaKey) {
      this.setBoardCamera(zoomAt(this.boardCamera(), local.x, local.y, Math.exp(-event.deltaY * 0.0025)));
    } else {
      const scale = 768 / (this.boardCanvas.clientWidth || 768);
      this.setBoardCamera(panBy(this.boardCamera(), -event.deltaX * scale, -event.deltaY * scale));
    }
  };

  /** Turns a finished draft into a stroke and sends or stores it. */
  private saveStroke(draft: { points: BoardPoint[]; tool: BoardStroke['tool']; color: string; width: number }, text?: string): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const existing = this.allStrokes(boardId);
    if (boardAtCapacity(existing, boardId)) return;
    const online = view.network.phase === 'JOINED';
    const stroke = makeStroke(
      boardId,
      view.identity.fingerprint,
      nextSequence(existing, view.identity.fingerprint, boardId),
      draft.tool,
      draft.color,
      draft.width,
      draft.points,
      undefined,
      text,
    );
    if(text)stroke.textStyle={...this.boardEditor.style};
    void this.boardEditor.apply([stroke]);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    // A locked identity prevents connecting, but local controls work after choosing offline mode.
    if (!this.view || this.pets.panel.open || this.jukebox.root.open || this.focusClock.root.open || this.notebooks.root.open || this.mailbox.root.open || this.settingsDialog.open || (this.wardrobe.isOpen()||this.vanity.root.open||this.petCollection.atelier.root.open||this.petCollection.root.open) || (this.view.lockedIdentity && !this.lockDismissed)) return;
    const key = event.key.toLowerCase();
    if(this.furnitureNameDialog.open)return;
    if(key==='escape'&&this.pane==='diagnostics'){this.leaveDiagnostics();event.preventDefault();return;}
    if(this.garden.active){if(key==='escape')this.garden.close();event.preventDefault();return;}
    if (this.decorating && key === 'escape') { if (this.pendingFurniture || this.drag || this.doorDrag || this.previewHouse) { this.pendingFurniture = null; this.drag = null; this.doorDrag=null; this.previewHouse = null; this.decorationInvalid = null; } else this.endDecoration(); event.preventDefault(); return; }
    if (this.decorating) return;
    if (key === 'escape' && this.activityOpen && !this.isTypingTarget(event.target)) { this.expansion.closeModal(); event.preventDefault(); return; }
    if (key === 'escape' && !this.phone.hidden) { if(!this.phoneEditor.handleEscape())this.closePhone(); event.preventDefault(); return; }
    if (this.spaces.root.open || this.roomWorkspace.root.open || this.mobileHud?.root.open) return;
    if (this.isTypingTarget(event.target) || this.activityOpen) return;
    if(this.pane==='board'&&this.boardEditor.key(event)){event.preventDefault();return;}
    if (key === 'm' && !event.repeat && !event.ctrlKey && !event.metaKey) {
      if (this.phone.hidden) this.openPhone('home'); else this.closePhone();
      event.preventDefault();
      return;
    }
    if (!this.phone.hidden) return;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'shift'].includes(key)) {
      this.keys.add(key);
      if (this.pane === 'world' || this.pane === 'house') event.preventDefault();
    }
    if (key === 'e' && !event.repeat) {
      this.triggerInteraction();
    }
    if (event.code === 'Space' && this.view.network.media.pushToTalk && this.view.network.media.micEnabled && !event.repeat) {
      this.actions.setTalking(true);
      event.preventDefault();
    }
    if (key === 'escape' && this.pane === 'board' && !this.boardAdvancedPanel.hidden) {
      this.boardAdvancedPanel.hidden = true;
      this.boardAdvancedToggle.setAttribute('aria-expanded', 'false');
      this.boardAdvancedToggle.focus();
      event.preventDefault();
      return;
    }
    // Escape steps back one level: board -> room, room -> village.
    if (key === 'escape' && this.pane === 'board' && this.houseOwnerId) this.returnToRoom();
    else if (key === 'escape' && this.pane === 'house') this.leaveInterior();
    else if(key==='escape'&&this.pane==='board')this.leaveCurrentHouse();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
    if (event.code === 'Space' && this.view?.network.media.pushToTalk) this.actions.setTalking(false);
  };

  private onBlur = (): void => {
    this.cancelBoardGesture();
    this.keys.clear();
    this.touchSprint = false;
    this.dpadKeys.clear();
    this.moveTarget = null;
    if (this.view?.network.media.pushToTalk) this.actions.setTalking(false);
  };

  private isTypingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
  }

  private lastStageRenderSig = '';
  private lastBoardRenderSig = '';
  private boardExtraFrames = 0;

  private tick = (now: number): void => {
    if (document.hidden || (this.lastFrame && now - this.lastFrame < 1000 / 61)) {
      if (document.hidden) this.lastFrame = now;
      this.raf = requestAnimationFrame(this.tick); return;
    }
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0;
    this.lastFrame = now;
    advanceAnim(dt);this.pets.tick(dt,now);
    const view = this.view;
    if (view && (this.pane === 'world' || this.pane === 'house')) {
      let vx = Number(this.keys.has('d') || this.keys.has('arrowright') || this.dpadKeys.has('arrowright'))
        - Number(this.keys.has('a') || this.keys.has('arrowleft') || this.dpadKeys.has('arrowleft'));
      let vy = Number(this.keys.has('s') || this.keys.has('arrowdown') || this.dpadKeys.has('arrowdown'))
        - Number(this.keys.has('w') || this.keys.has('arrowup') || this.dpadKeys.has('arrowup'));

      if (this.pets.panel.open || this.jukebox.root.open || this.focusClock.root.open || this.notebooks.root.open || this.mailbox.root.open || this.phone.hidden === false || this.settingsDialog.open || this.activityOpen || this.decorating || this.garden.active || (this.wardrobe.isOpen()||this.vanity.root.open||this.petCollection.atelier.root.open||this.petCollection.root.open) || this.spaces.root.open || this.roomWorkspace.root.open || this.mobileHud?.root.open) {
        vx = 0; vy = 0;
      }
      if (!this.moveTarget) this.movePath = [];
      if (vx !== 0 || vy !== 0) {
        this.moveTarget = null;
        this.movePath = [];
        this.pendingInteraction = null;
      } else if (this.moveTarget) {
        let dx = this.moveTarget.x - this.localPosition.x;
        let dy = this.moveTarget.y - this.localPosition.y;
        // Reaching a corner turns straight to the next one.
        if (Math.hypot(dx, dy) < 6 && this.movePath.length) {
          this.moveTarget = this.movePath.shift()!;
          dx = this.moveTarget.x - this.localPosition.x;
          dy = this.moveTarget.y - this.localPosition.y;
        }
        const dist = Math.hypot(dx, dy);
        if (dist < 6) {
          this.moveTarget = null;
        } else {
          vx = dx / dist;
          vy = dy / dist;
        }
      }

      const running = (this.keys.has('shift') || this.touchSprint) && this.phone.hidden && !this.activityOpen;
      const vector = { x: vx, y: vy };
      const previous = this.localPosition;
      const areaMeta = WORLD_AREAS[this.currentArea];
      const worldObs = this.currentArea === 'residential'
        ? worldObstacles(occupiedParcels(view))
        : [...this.expansion.objectRegistry.obstaclesForArea(this.currentArea), ...lampObstacles(this.currentArea)];
      const next = this.pane === 'world'
        ? stepPosition(previous, vector, dt, worldObs, areaMeta.bounds, running ? 275 : 110)
        : stepHousePosition(previous, vector, dt, this.currentHouse() || view.ownHouse, running ? 2.5 : 1);

      if (this.moveTarget && Math.hypot(next.x - previous.x, next.y - previous.y) < 0.01 && dt > 0) {
        this.moveTarget = null;
      }

      this.localPosition = next;
      this.maybeTravel(view, next, vector);
      if (!this.moveTarget && this.pendingInteraction) {
        const arrived = this.pendingInteraction;
        this.pendingInteraction = null;
        if (arrived.near()) arrived.run();
        else this.notify(t('No llego hasta ahí. Acércate caminando y vuelve a intentarlo.'));
      }
      if (view.network.phase === 'JOINED' && (next.x !== previous.x || next.y !== previous.y || next.moving !== previous.moving)
        && (now - this.lastMoveSent > 80 || !next.moving)) {
        this.lastMoveSent = now;
        this.actions.move({ ...next, areaId: this.currentArea });
      }
      const people = this.visiblePeople(view);
      const sceneLabel = this.pane === 'house' ? t('Interior de la casa') : t(WORLD_AREAS[this.currentArea].displayName);
      setDisplayAttribute(this.stageCanvas, 'aria-label', msg("{p0} · Personas aquí: {p1}", { p0: sceneLabel, p1: people.map(person => defaultText(person.identity.displayName)).join(', ') }));
      const activeHouse = this.previewHouse || this.currentHouse() || view.ownHouse;
      const occupied = this.garden.preview(occupiedParcels(view));
      const calm = reducedMotion();
      this.expansion.environment.tick(dt);
      const envState = this.expansion.environment.getState();
      const anyMoving = this.pets.active || this.speech.isOpen || this.garden.active || people.some((p) => p.position.moving) || !!this.moveTarget || !!view.network.gameCamera.local || view.network.gameCamera.remote.length>0
        || envState.cycleMode === 'auto' || envState.weather !== 'clear';
      const stageSig = calm && !anyMoving
        ? JSON.stringify([getLanguage(), this.pane, this.currentArea, envState.timeOfDay, envState.weather, this.selectedFurnitureId, activeHouse, inlineSpriteGeneration(), occupied.map((o) => [o.ownerId, o.house.revision]), people, getAvatarCustomization()])
        : '';
      if (!calm || anyMoving || stageSig !== this.lastStageRenderSig) {
        this.lastStageRenderSig = stageSig;
        const ctx = this.stageCanvas.getContext('2d');
        if (ctx) {
          const scaleX = this.stageCanvas.width / 768;
          const scaleY = this.stageCanvas.height / 432;
          ctx.save();
          ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
          const nearFurniture = this.pane === 'house' && !atHouseDoor(this.localPosition)
            ? closestFurniture(this.localPosition, activeHouse)
            : null;
          const nearWorldObj = this.pane === 'world'
            ? this.expansion.objectRegistry.closestInteractable(this.currentArea, this.localPosition.x, this.localPosition.y, view.identity.fingerprint)
            : null;
          const nearPortal = this.pane === 'world'
            ? closestPortal(this.currentArea, this.localPosition)
            : null;
          if (this.pane === 'world') {
            if (this.currentArea === 'residential') {
              drawWorld(ctx, occupied, people, dt,null,false,this.pets.entries(ctx,now));
              this.garden.draw(ctx);
              // Server mode: signs at the edges that lead to neighbouring neighbourhoods.
              const server = view.network.server;
              if (server && this.currentArea === 'residential' && view.network.phase === 'JOINED') {
                if (server.neighborhood > 0) drawPrompt(ctx, 52, WORLD_SPAWN.y - 26, t('← Barrio {n}', { n: server.neighborhood }));
                if (server.neighborhood < server.neighborhoods - 1) drawPrompt(ctx, LIMITS.worldWidth - 52, WORLD_SPAWN.y - 26, t('Barrio {n} →', { n: server.neighborhood + 2 }));
              }
            } else if (this.currentArea === 'community') {
              drawCommunityPlaza(
                ctx,
                people,
                this.expansion.objectRegistry,
                nearWorldObj?.id || null,
                null,
                nearPortal?.id || null,
                dt,this.pets.entries(ctx,now),
              );
            } else {
              drawStudyLibrary(
                ctx,
                people,
                this.expansion.objectRegistry,
                nearWorldObj?.id || null,
                null,
                nearPortal?.id || null,
                dt,this.pets.entries(ctx,now),
              );
            }
            this.expansion.environment.drawAtmosphere(
              ctx,
              768,
              432,
              areaMeta.lampPositions,
              areaMeta.isInterior,
            );
          } else {
            const isOwnHouse = !this.houseOwnerId || this.houseOwnerId === view.identity.fingerprint;
            const scope = isOwnHouse ? 'own' : activeHouse.ownerId;
            const perItemSprites = new Map<string, HTMLImageElement | null>();
            for (const f of activeHouse.furniture) {
              if (f.kind === 'board' || f.kind === 'sketchboard') {
                const bSprite = this.expansion.boardRegistry.getDecodedBoardSprite(this.localPosition.space?.roomId?scopedBoard(scope,this.localPosition.space,f.id):houseBoardId(scope, f.id));
                if (bSprite) perItemSprites.set(f.id, bSprite);
              }
            }
            drawHouseInterior(ctx, activeHouse, people, this.selectedFurnitureId, dt, this.decorating ? null : nearFurniture?.id || null, perItemSprites,spacePortals(activeHouse,this.localPosition.space),!!this.localPosition.space,this.pets.entries(ctx,now));
            if (this.decorating) {
              if (this.decorationGrid) { ctx.save(); ctx.fillStyle = '#ffffff55'; for (let x = HOUSE_BOUNDS.x; x < 740; x += 8) for (let y = HOUSE_BOUNDS.y; y < 406; y += 8) ctx.fillRect(x, y, 1, 1); ctx.restore(); }
              const candidate = !this.doorDrag&&this.previewHouse?.furniture.find(f => f.id === (this.drag?.id || this.previewHouse?.furniture.at(-1)?.id));
              if (candidate) { const r = furnitureRect(candidate); ctx.save(); ctx.fillStyle = this.decorationInvalid ? '#d8444450' : '#59b87140'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeStyle = this.decorationInvalid ? '#b52828' : '#387e45'; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore(); }
            }
          }
          this.pets.draw(ctx,now,!this.decorating&&!this.garden.active&&!this.activityOpen&&!!this.phone.hidden);this.headCameras.draw(ctx,people);
          this.speech.draw(ctx,this.speechScene(),()=>{const r=this.stageCanvas.getBoundingClientRect(),w=this.stageWrap.getBoundingClientRect();return{left:Math.max(0,(w.left-r.left)*768/r.width),right:Math.min(768,(w.right-r.left)*768/r.width),top:Math.max(0,(w.top-r.top)*432/r.height),screenLeft:Math.max(0,w.left),screenTop:Math.max(0,w.top),screenRight:Math.min(innerWidth,w.right),screenBottom:Math.min(innerHeight,w.bottom),canvasLeft:r.left,canvasTop:r.top,scale:r.width/768};});
          if (this.moveTarget) {
            ctx.save();
            ctx.strokeStyle = '#e0724c';
            ctx.fillStyle = 'rgba(224, 114, 76, 0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.moveTarget.x, this.moveTarget.y, 6 + Math.sin(now / 120) * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
          const petTarget=!this.decorating&&!this.garden.active?this.pets.target():null;
          const prompt = petTarget ? t('{button} · Interactuar',{button:interactionGlyph()}) : this.pane === 'world'
            ? nearPortal
              ? t(nearPortal.prompt)
              : this.nearestGardenMailbox()
                ? t('E · Buzón')
                : this.currentArea === 'residential' && closestDoor(this.localPosition, occupied)
                ? t('E · Entrar')
                : nearWorldObj
                  ? `E · ${defaultText(nearWorldObj.displayName)}`
                  : null
            : nearestSpacePortal(this.baseHouse()!,this.localPosition)
              ? t('E · Entrar')
              : atHouseDoor(this.localPosition)
              ? t('E · Salir')
              : nearFurniture
                ? t(FURNITURE_PROMPT_LABELS[nearFurniture.kind])
                : null;
          if (prompt&&!petTarget) drawPrompt(ctx, this.localPosition.x, this.localPosition.y - 66, prompt);
          this.updateTouchActionPrompt(prompt);
          ctx.restore();
        }
      }
    }
    if (view && this.pane === 'board') {
      const rect = this.boardWrap.getBoundingClientRect();
      const height = this.isDisplayBoard()?432:Math.max(1, Math.round(768 * rect.height / Math.max(1, rect.width)));
      if (height !== this.boardHeight) { this.boardHeight = height; this.boardCanvas.height = height * 2; this.lastBoardRenderSig = ''; this.positionBoardTextInput(); }
      const boardId = this.boardId();
      const committed = visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
      const visible = this.eraserGesture?.preview(committed) ?? this.boardEditor.displayed(committed);
      const richShapes = this.expansion.boardRegistry.getRichElements(boardId);
      const cam = this.boardCamera();
      const cursor = this.boardTool === 'eraser' ? this.boardCursor : null;
      const boardSig = JSON.stringify([boardId, this.boardEditor.version, visible, richShapes.map((s) => s.id), this.boardDraft, this.richBoardDraft, cam, cursor, getMathGeneration(), boardFontGeneration()]);
      if (boardSig !== this.lastBoardRenderSig) {
        this.lastBoardRenderSig = boardSig;
        this.boardExtraFrames = 2;
      }
      if (this.boardExtraFrames > 0) {
        this.boardExtraFrames--;
        const ctx = this.boardCanvas.getContext('2d');
        if (ctx) {
          const scale = this.boardCanvas.width / 768;
          ctx.save();
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
          drawBoard(ctx, visible, this.boardDraft, cam, 768, this.boardHeight, false, scale);
          this.boardEditor.draw(ctx);
          ctx.save();
          ctx.scale(cam.zoom, cam.zoom);
          ctx.translate(-cam.x, -cam.y);
          this.expansion.boardRegistry.drawRichLayer(ctx, boardId);
          if (this.richBoardDraft) {
            ctx.strokeStyle = this.boardColor.value;
            ctx.lineWidth = Number(this.boardWidth.value);
            if (this.richBoardDraft.kind === 'circle') {
              const cx = (this.richBoardDraft.start.x + this.richBoardDraft.current.x) / 2;
              const cy = (this.richBoardDraft.start.y + this.richBoardDraft.current.y) / 2;
              const rx = Math.max(4, Math.abs(this.richBoardDraft.current.x - this.richBoardDraft.start.x) / 2);
              const ry = Math.max(4, Math.abs(this.richBoardDraft.current.y - this.richBoardDraft.start.y) / 2);
              ctx.beginPath();
              ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
              ctx.stroke();
            } else {
              ctx.beginPath();
              ctx.moveTo(this.richBoardDraft.start.x, this.richBoardDraft.start.y);
              ctx.lineTo(this.richBoardDraft.current.x, this.richBoardDraft.current.y);
              ctx.stroke();
            }
          }
          ctx.restore();
          if (cursor) {
            ctx.strokeStyle = 'rgba(194, 84, 63, 0.85)';
            ctx.fillStyle = 'rgba(194, 84, 63, 0.14)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cursor.x, cursor.y, this.eraserPrefs.diameter / 2 * 768 / Math.max(1, this.boardCanvas.clientWidth), 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }
    this.updatePortraitCamera();
    this.raf = requestAnimationFrame(this.tick);
  };

  private setPortraitZoom(zoom: number): void {
    this.portraitZoom = clampZoom(zoom);
    savePortraitZoom(this.portraitZoom);
    setText(this.portraitZoomLabel, `×${this.portraitZoom}`);
    this.updatePortraitCamera();
  }

  /** On a phone held upright the scene is zoomed inside the screen window and follows the player. */
  private updatePortraitCamera(): void {
    const canvas = this.stageCanvas, wrap = this.stageWrap;
    const {width:viewportWidth,height:viewportHeight}=layoutViewport();
    if (!canvas || !wrap) return;
    // Same condition as the portrait rules in game.css.
    const active = document.documentElement.classList.contains('sv-mobile-device') && viewportHeight > viewportWidth && viewportWidth < 600 && (this.pane === 'world' || this.pane === 'house');
    if (!active) {
      if (this.portraitCameraSig) { this.portraitCameraSig = ''; canvas.style.removeProperty('width'); canvas.style.removeProperty('transform'); canvas.style.removeProperty('transform-origin'); }
      return;
    }
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    const view=portraitView(w,h,this.portraitZoom,this.localPosition);
    if (wrap.scrollLeft || wrap.scrollTop) { wrap.scrollLeft = 0; wrap.scrollTop = 0; } // focus must never scroll the window
    const sig = `${w}x${h}:${view.ppu}:${view.x}:${view.y}`;
    if (sig === this.portraitCameraSig) return;
    this.portraitCameraSig = sig;
    // Base size: the scene's width fits the window; the transform then scales and centres it on the player.
    const base = w / 768;
    canvas.style.width = `${w}px`;
    canvas.style.transformOrigin = '0 0';
    canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.ppu / base})`;
  }

  private visiblePeople(view: AppView): DrawPerson[] {
    const sceneHouse = this.pane === 'house' ? this.houseOwnerId : null;
    const people: DrawPerson[] = [{ identity: view.identity, position: this.localPosition, isOwn: true }];
    for (const member of view.network.members) {
      if (!member.connected || member.identity.fingerprint === view.identity.fingerprint || !isInScene(member, this.currentArea, sceneHouse, this.localPosition.space)) continue;
      people.push({ identity: member.identity, position: member.position, isOwn: false, appearance: member.appearance });
    }
    return people;
  }

  private accessLabel(access: PublicHouse['access']): string {
    return access === 'open' ? 'abierta' : access === 'ask' ? 'con permiso' : 'cerrada';
  }
}

export function createStudyUI(root: HTMLElement, actions: AppActions): { update(view: AppView): void; destroy(): void } {
  const ui = new StudyUI(root, actions);
  return { update: (view) => ui.update(view), destroy: () => ui.destroy() };
}

import './responsive-fixes.css';
