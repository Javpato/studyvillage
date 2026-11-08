import {PetMatch,PetReservations,type PetBot} from '../pets/protocol';
import {werewolfDecision} from '../pets/werewolves-policy';
import { pick, secureRandomInt, shuffle, type RoomEngine } from './room';

/**
 * Werewolves (Loup-Garou) as a classic turn-ordered game.
 *
 * Night is called role by role, always in the same order: the wolves choose
 * a victim, the seer looks at one card, the guard protects someone and the
 * witch may heal the victim or poison anyone. Dawn announces the dead, the
 * village votes in daylight, and the verdict reveals the card of whoever was
 * eliminated. The village wins when no wolf is left; wolves win once they are
 * at least as many as everyone else.
 *
 * The engine is authoritative and only ever hands out per-player views:
 * nobody sees a card they have not earned.
 */

export type WerewolfRole = 'werewolf' | 'seer' | 'guard' | 'witch' | 'villager' | 'cupid' | 'hunter' | 'girl' | 'thief' | 'elder' | 'idiot' | 'scapegoat' | 'piper' | 'whitewolf' | 'crow' | 'arsonist' | 'innocent' | 'sister' | 'brother' | 'fox' | 'bear' | 'judge' | 'knight' | 'actor' | 'maid' | 'wildchild' | 'dogwolf' | 'angel' | 'cultist' | 'bigwolf' | 'infectwolf' | 'gypsy';
export type WerewolvesPhase = 'lobby' | 'reveal' | 'night' | 'dawn' | 'day' | 'verdict' | 'hunter' | 'execution' | 'succession' | 'scapegoat' | 'end';
export type NightStep = 'thief' | 'actor' | 'dogwolf' | 'wildchild' | 'cupid' | 'sister' | 'brother' | 'fox' | 'wolves' | 'whitewolf' | 'infectwolf' | 'bigwolf' | 'seer' | 'guard' | 'witch' | 'crow' | 'arsonist' | 'piper' | 'gypsy' | 'baker';

export const NIGHT_ORDER: readonly NightStep[] = ['thief','actor','dogwolf','wildchild','cupid','sister','brother','fox','wolves','baker','whitewolf','infectwolf','bigwolf','seer','guard','witch','crow','arsonist','piper','gypsy'];
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 24;

export const ROLE_INFO: Record<WerewolfRole, { name: string; plural: string; team: 'aldea' | 'lobos' | 'solo'; goal: string }> = {
  werewolf: { name: 'Hombre lobo', plural: 'Hombres lobo', team: 'lobos', goal: 'Cada noche elige con tu manada a quién atacar. De día, disimula.' },
  seer: { name: 'Vidente', plural: 'Videntes', team: 'aldea', goal: 'Cada noche descubre la carta de una persona.' },
  guard: { name: 'Guardián', plural: 'Guardianes', team: 'aldea', goal: 'Cada noche protege a alguien del ataque. No a la misma persona dos noches seguidas.' },
  witch: { name: 'Bruja', plural: 'Brujas', team: 'aldea', goal: 'Una poción para salvar a la víctima y otra para eliminar a alguien. Una vez cada una.' },
  cupid: { name: 'Cupido', plural: 'Cupidos', team: 'aldea', goal: 'La primera noche une a dos enamorados: si muere uno, muere el otro. Si son de bandos distintos, ganan quedándose solos.' },
  hunter: { name: 'Cazador', plural: 'Cazadores', team: 'aldea', goal: 'Al morir puedes disparar una última vez a otra persona viva.' },
  girl: { name: 'Niña', plural: 'Niñas', team: 'aldea', goal: 'Puedes descubrir un lobo durante su turno. Hay un 33 % de riesgo de que la manada te identifique.' },
  villager: { name: 'Ciudadano', plural: 'Ciudadanos', team: 'aldea', goal: 'Sin poderes: escucha, sospecha y vota bien de día.' },
  thief: { name: 'Ladrón', plural: 'Ladrones', team: 'aldea', goal: 'La primera noche puedes tomar una de las dos cartas sobrantes. Si ambas son lobos, debes cambiar.' },
  elder: { name: 'Anciano', plural: 'Ancianos', team: 'aldea', goal: 'Resistes el primer ataque de los lobos. Si la aldea, la bruja o el cazador te mata, la aldea pierde sus poderes.' },
  idiot: { name: 'Inocente del pueblo', plural: 'Inocentes del pueblo', team: 'aldea', goal: 'Si te condenan en una votación, sobrevives y revelas tu carta, pero pierdes el voto.' },
  scapegoat: { name: 'Chivo expiatorio', plural: 'Chivos expiatorios', team: 'aldea', goal: 'Muere si la votación acaba en empate. Antes de irse elige quién podrá votar al día siguiente.' },
  piper: { name: 'Flautista', plural: 'Flautistas', team: 'solo', goal: 'Cada noche encanta a dos personas. Ganas si todos los demás supervivientes están encantados.' },
  whitewolf: { name: 'Lobo blanco', plural: 'Lobos blancos', team: 'solo', goal: 'Despierta con la manada. Cada dos noches puedes eliminar a otro lobo. Ganas si quedas solo.' },
  crow: { name: 'Cuervo', plural: 'Cuervos', team: 'aldea', goal: 'Cada noche marca una casa: su habitante recibe dos votos extra al día siguiente.' },
  arsonist: { name: 'Pirómano', plural: 'Pirómanos', team: 'aldea', goal: 'Una vez quema una casa. Si los lobos la atacan esa noche, salvas al habitante y muere el lobo más cercano por la derecha.' },
  innocent: { name: 'Aldeano conocido', plural: 'Aldeanos conocidos', team: 'aldea', goal: 'Tu carta de aldeano es pública desde el reparto.' },
  sister: { name: 'Hermana', plural: 'Hermanas', team: 'aldea', goal: 'Las dos hermanas se reconocen la primera noche y pueden confiar en ese vínculo.' },
  brother: { name: 'Hermano', plural: 'Hermanos', team: 'aldea', goal: 'Los tres hermanos se reconocen la primera noche.' },
  fox: { name: 'Zorro', plural: 'Zorros', team: 'aldea', goal: 'Elige a alguien: sabes si él o sus dos vecinos vivos incluyen un lobo. Un resultado negativo agota tu poder.' },
  bear: { name: 'Domador de osos', plural: 'Domadores de osos', team: 'aldea', goal: 'Al amanecer el oso gruñe si tienes un lobo entre tus dos vecinos vivos, o si estás infectado.' },
  judge: { name: 'Juez tartamudo', plural: 'Jueces tartamudos', team: 'aldea', goal: 'Una vez puedes pedir una segunda votación inmediatamente después de la primera.' },
  knight: { name: 'Caballero oxidado', plural: 'Caballeros oxidados', team: 'aldea', goal: 'Si te devoran, contagias al primer lobo vivo a tu izquierda: morirá al comenzar la siguiente noche.' },
  actor: { name: 'Comediante', plural: 'Comediantes', team: 'aldea', goal: 'Cada noche puedes usar una carta del repertorio. Cada carta se usa una sola vez y dura hasta la noche siguiente.' },
  maid: { name: 'Sirvienta devota', plural: 'Sirvientas devotas', team: 'aldea', goal: 'Antes de revelar al condenado puedes tomar su papel. No puedes hacerlo si estás enamorada.' },
  wildchild: { name: 'Niño salvaje', plural: 'Niños salvajes', team: 'aldea', goal: 'La primera noche eliges un modelo. Si muere, te conviertes en lobo.' },
  dogwolf: { name: 'Perro lobo', plural: 'Perros lobo', team: 'aldea', goal: 'La primera noche eliges definitivamente entre la aldea y la manada.' },
  angel: { name: 'Ángel', plural: 'Ángeles', team: 'solo', goal: 'La partida empieza de día. Si mueres durante el primer turno, ganas; después eres aldeano.' },
  cultist: { name: 'Sectario', plural: 'Sectarios', team: 'solo', goal: 'La mesa se divide en dos grupos alternos. Ganas si no queda nadie vivo del otro grupo.' },
  bigwolf: { name: 'Gran lobo feroz', plural: 'Grandes lobos feroces', team: 'lobos', goal: 'Mientras no haya muerto ningún lobo, niño salvaje o perro lobo, puedes atacar a una segunda víctima cada noche.' },
  infectwolf: { name: 'Padre de los lobos', plural: 'Padres de los lobos', team: 'lobos', goal: 'Una vez puedes infectar a la víctima de la manada: se une a vosotros y conserva sus poderes.' },
  gypsy: { name: 'Médium', plural: 'Médiums', team: 'aldea', goal: 'Una vez por noche puedes gastar una consulta de espiritismo y publicar una respuesta verificada de los difuntos.' },

};

const STEP_ROLE: Record<NightStep, WerewolfRole> = Object.fromEntries(NIGHT_ORDER.map(step=>[step,step==='wolves'?'werewolf':step==='baker'?'villager':step])) as Record<NightStep,WerewolfRole>;
export const STEP_CALL: Record<NightStep, string> = {baker:'El panadero se despierta brevemente',
thief: 'Turno: Ladrón',piper: 'Turno: Flautista',whitewolf: 'Turno: Lobo blanco',crow: 'Turno: Cuervo',arsonist: 'Turno: Pirómano',sister: 'Turno: Hermana',brother: 'Turno: Hermano',fox: 'Turno: Zorro',actor: 'Turno: Comediante',wildchild: 'Turno: Niño salvaje',dogwolf: 'Turno: Perro lobo',bigwolf: 'Turno: Gran lobo feroz',infectwolf: 'Turno: Padre de los lobos',gypsy: 'Turno: Médium',
  cupid: 'Cupido elige a dos enamorados',
  wolves: 'Los hombres lobo despiertan y eligen a su víctima',
  seer: 'La vidente despierta y mira una carta',
  guard: 'El guardián despierta y protege a alguien',
  witch: 'La bruja despierta y decide sus pociones',
};

/** Milliseconds each phase or night turn may last before the game moves on. */
export const DURATIONS = {
  baker:3000,execution:12_000,succession:20_000,scapegoat:25_000,thief:25000,actor:25000,dogwolf:25000,wildchild:25000,sister:10000,brother:10000,fox:25000,whitewolf:25000,infectwolf:20000,bigwolf:25000,crow:25000,arsonist:25000,piper:25000,gypsy:25000,
  hunter: 25_000, cupid: 30_000, reveal: 15_000, wolves: 40_000, seer: 25_000, guard: 25_000, witch: 30_000,
  dawn: 8_000, day: 120_000, verdict: 8_000,
} as const;

/** Bots answer after a short, random pause so they read like players. */
const BOT_DELAY: readonly [number, number] = [1_500, 4_000];
const BOT_NAMES = ['Lupe', 'Bruno', 'Iris', 'Tomás', 'Nora', 'Gael', 'Vera', 'Olmo', 'Rita', 'Dante'];
const BOT_COLORS = ['#c96f53', '#5f8f6b', '#6a7fc1', '#b58a3e', '#9a6bb5', '#4d9aa3', '#c25b7a', '#7d8f3f'];

export function roleDeck(playerCount: number): WerewolfRole[] {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`Se juega con ${MIN_PLAYERS} a ${MAX_PLAYERS} personas (puedes completar con bots).`);
  }
  const deck: WerewolfRole[] = ['werewolf', 'seer', 'guard'];
  if (playerCount >= 5) deck.push('witch');
  if (playerCount >= 6) deck.push('werewolf');
  while (deck.filter(r=>r==='werewolf').length < Math.floor(playerCount/4)+1 && playerCount>8)deck.push('werewolf');
  while (deck.length < playerCount) deck.push('villager');
  return deck;
}

export const WOLF_ROLES:WerewolfRole[]=['werewolf','whitewolf','bigwolf','infectwolf'];
export function roleLimit(role:WerewolfRole):number{return role==='werewolf'?8:role==='villager'?24:role==='sister'?2:role==='brother'?3:1;}
export type RoleCounts = Partial<Record<WerewolfRole, number>>;
export function configuredDeck(playerCount: number, counts: RoleCounts): WerewolfRole[] {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) throw new Error('Se necesitan entre 4 y 24 jugadores.');
  const deck: WerewolfRole[] = [];
  for (const role of Object.keys(ROLE_INFO) as WerewolfRole[]) {
    if (role === 'villager') continue;
    const count = counts[role] ?? 0;
    if (!Number.isInteger(count) || count < 0 || count > roleLimit(role as WerewolfRole)) throw new Error('Cantidad de cartas no válida.');
    for (let i = 0; i < count; i++) deck.push(role);
  }
  if (deck.length > playerCount) throw new Error('Hay más cartas elegidas que jugadores.');
  const wolves = deck.filter(r => WOLF_ROLES.includes(r)).length;
  for(const [role,n]of [['sister',2],['brother',3]] as const)if((counts[role]??0)!==0&&counts[role]!==n)throw new Error('Las hermanas se eligen de dos en dos y los hermanos de tres en tres.');
  if (!wolves || wolves * 2 >= playerCount) throw new Error('Elige al menos un lobo, sin mayoría inicial.');
  while (deck.length < playerCount) deck.push('villager');
  return deck;
}
export function presetRoles(name: string, players: number): RoleCounts {
  const wolves = players >= 6 ? 2 : 1;
  if (name === 'bonds') return { werewolf: wolves, cupid: 1, seer: 1, ...(players >= 6 ? { girl: 1 } : {}) };
  if (name === 'classic') return { werewolf: wolves, seer: 1, ...(players >= 5 ? { witch: 1 } : {}), ...(players >= 6 ? { hunter: 1 } : {}) };
  return { werewolf: wolves, seer: 1 };
}

export type VillageBuilding='farm'|'church'|'healer'|'school'|'bailiff'|'manor'|'bakery'|'tavern'|'barber';
export type VillageEvent='peace'|'sleepwalking'|'harvest'|'potion'|'double_vote';
export const SPIRIT_QUESTIONS:Record<string,string>={dead_wolf:'¿El primer difunto era lobo?',seer_alive:'¿Sigue viva la vidente?',wolves_many:'¿Quedan al menos dos lobos?',neighbors_wolf:'¿Hay un lobo junto a la médium?'};
export const BUILDING_INFO:Record<VillageBuilding,string>={farm:'Granja',church:'Iglesia',healer:'Curandero',school:'Escuela',bailiff:'Alguacil',manor:'Mansión',bakery:'Panadería',tavern:'Taberna',barber:'Barbería'};
export const EVENT_INFO:Record<VillageEvent,string>={peace:'Paz por un día',sleepwalking:'Sonambulismo',harvest:'Cosecha',potion:'Hierbas medicinales',double_vote:'Doble consejo'};
export interface WerewolvesSettings {daySeconds:number;nightSeconds:number;buildings:boolean;events:boolean}
class PactState {
 infected=new Set<string>();dogChosen=new Set<string>();models=new Map<string,string>();
 actorRoles=new Map<string,WerewolfRole>();actorCards:WerewolfRole[]=['seer','guard','hunter'];thiefCards:WerewolfRole[]=[];
 personalSeen=new Map<string,Map<string,WerewolfRole>>();foxResults=new Map<string,{ids:string[];found:boolean}>();foxSpent=new Set<string>();
 elderHits=new Map<string,number>();powerless=false;idiots=new Set<string>();charmed=new Set<string>();
 used=new Set<string>();extraVictims=new Set<string>();infectTarget:string|null=null;crowTarget:string|null=null;burnTarget:string|null=null;burned=new Set<string>();
 rusty=new Map<string,number>();deathReasons=new Map<string,string>();revealed=new Set<string>();
 pendingExecution:string|null=null;executionVotes=0;scapegoat:string|null=null;restrictedVoters:Set<string>|null=null;restrictRound=0;
 extraVote=false;secondVote=false;mayorDeath:string|null=null;mayorAbolished=false;
 building=new Map<string,VillageBuilding>();buildingUsed=new Set<string>();blockedVotes=new Set<string>();tavernImmune=new Set<string>();
 warden:string|null=null;events:VillageEvent[]=['peace','sleepwalking','harvest','potion','double_vote'];event:VillageEvent|null=null;sleepwalking=false;harvest=false;
 spiritLeft=5;spiritAnswers:string[]=[];bearGrowls=false;wolfDied=false;angelOpening=false;deathOrder:string[]=[];rustDeaths:string[]=[];housingOffer=new Map<string,{owner:string;kind:VillageBuilding}>();wardenFrom=0;
}

export interface WerewolfPlayer {
  id: string; name: string; color: string; bot: boolean;pet?:PetBot;
  alive: boolean; role: WerewolfRole | null; ready: boolean;
}

/** `text` is a message template; `params` fill its {placeholders}. Names stay as typed; the UI translates the rest. */
export interface LogEntry { icon: 'moon' | 'sun' | 'skull' | 'vote' | 'trophy' | 'info'; text: string; params?: Record<string, string | number> }

export type WerewolvesAction =
  | { kind: 'join'; name: string; color: string }
  | { kind: 'leave' }
  | { kind: 'add_bot';pet?:PetBot }
  | { kind: 'remove_bot'; id: string }
  | { kind: 'configure'; counts: RoleCounts }
  | { kind: 'mayor_setting'; enabled: boolean }
  | { kind: 'settings'; value: Partial<WerewolvesSettings> }
  | { kind: 'power'; targets?: string[]; choice?: string; use?: boolean }
  | { kind: 'judge' }
  | { kind: 'inherit'; use: boolean }
  | { kind: 'successor'; target: string }
  | { kind: 'scapegoat_vote'; targets: string[] }
  | { kind: 'building'; target?: string; targets?: string[]; choice?: string }
  | { kind: 'housing'; accept: boolean }
  | { kind: 'warden'; target: string }
  | { kind: 'event'; event: VillageEvent }
  | { kind: 'cupid'; targets: [string, string] }
  | { kind: 'peek'; spy: boolean }
  | { kind: 'hunter'; target: string | null }
  | { kind: 'start' }
  | { kind: 'ready' }
  | { kind: 'wolf_vote'; target: string }
  | { kind: 'seer_look'; target: string }
  | { kind: 'guard'; target: string }
  | { kind: 'witch'; heal: boolean; poison: string | null }
  | { kind: 'vote'; target: string | 'skip' }
  | { kind: 'continue' }
  | { kind: 'play_again' };

export interface WerewolvesTurn {
  choices?:string[]; chooseCount?:number; optional?:boolean;
  step: NightStep;
  /** Who can be chosen this turn. */
  targets: string[];
  victim: string | null;
  canHeal: boolean;
  canPoison: boolean;
  lastGuarded: string | null;
}

export interface WerewolvesView {
  housingOffer:VillageBuilding|null;settings:WerewolvesSettings;cameraPhase:string;cameraAudience:null; canSeeCameras:boolean;canBroadcastCamera:boolean;canVote:boolean;voteTargets:string[];
  pack:string[]; privateInfo:LogEntry[]; powerChoices:string[]; canJudge:boolean; canInherit:boolean;successorTargets:string[];scapegoatTargets:string[];
  buildings:{id:string;kind:VillageBuilding|null;used:boolean}[];myBuilding:VillageBuilding|null;buildingAvailable:boolean;buildingTargets:string[];wardenId:string|null;events:VillageEvent[];event:VillageEvent|null;
  mayorEnabled:boolean; mayorId:string|null; mayorElection:boolean;
  phase: WerewolvesPhase;
  step: NightStep | null;
  round: number;
  remainingMs: number;
  leaderId: string | null;
  me: { id: string; seated: boolean; alive: boolean; role: WerewolfRole | null; acted: boolean; isLeader: boolean };
  players: {
    id: string; name: string; color: string; bot: boolean;pet?:PetBot; alive: boolean;
    /** Only what the viewer is entitled to know. */
    role: WerewolfRole | null;
    ready: boolean;
    /** Public during the day: who this player is voting for. */
    votesFor: string | null;
    /** Wolves see each other's choices during their turn. */
    wolfTarget: string | null;
  }[];
  deck: WerewolfRole[];
  /** The viewer's own night turn, or null while someone else is awake. */
  turn: WerewolvesTurn | null;
  seerSeen: { id: string; role: WerewolfRole }[];
  nightDeaths: string[];
  verdict: { id: string | null; tie: boolean } | null;
  winner: 'aldea' | 'lobos' | 'lovers' | 'whitewolf' | 'piper' | 'cultist' | 'angel' | 'nobody' | null;
  counts: RoleCounts; deckError: string | null; loverId: string | null; peeked: string[]; hunterTargets: string[];
  log: LogEntry[];
}

interface Night {
  wolfVotes: Map<string, string>;
  victim: string | null;
  guarded: string | null;
  healed: boolean;
  poisoned: string | null;
  acted: Set<string>;
}

const emptyNight = (): Night => ({ wolfVotes: new Map(), victim: null, guarded: null, healed: false, poisoned: null, acted: new Set() });

export class WerewolvesGame implements RoomEngine<WerewolvesAction, WerewolvesView> {
  phase: WerewolvesPhase = 'lobby';
  step: NightStep | null = null;
  round = 0;
  players: WerewolfPlayer[] = [];
  private leaderId: string | null = null;
  private pact=new PactState();
  private settings:WerewolvesSettings={daySeconds:120,nightSeconds:40,buildings:false,events:false};
  private controller:string|null=null;
  private mayorEnabled=false;private mayorId:string|null=null;private mayorElection=false;
  private deadline = 0;
  private botAt = 0;
  private night: Night = emptyNight();
  private lastGuarded: string | null = null;
  private healLeft = true;
  private poisonLeft = true;
  private seerSeen = new Map<string, WerewolfRole>();
  private nightDeaths: string[] = [];
  private votes = new Map<string, string>();
  private verdict: { id: string | null; tie: boolean } | null = null;
  private winner: WerewolvesView['winner'] = null;
  private deck: WerewolfRole[] = [];
  private log: LogEntry[] = [];
  private counts: RoleCounts | null = null;
  private lovers: [string, string] | null = null;
  private peeks = new Map<string, Set<string>>();
  private exposedGirls = new Set<string>();
  private hunters: string[] = [];
  private spentHunters = new Set<string>();
  private resumeAfterDeath: 'dawn' | 'verdict' | 'interrupted' = 'dawn';
  private interrupted: { phase: WerewolvesPhase; step: NightStep | null; remaining: number } | null = null;

  private petMatch=new PetMatch();
  setPetReservations(registry:PetReservations){this.petMatch.connect(registry);}
  constructor(private readonly random: (max: number) => number = secureRandomInt, private readonly authorityId: string | null = null) {}

  cancel(): void {
    this.petMatch.clear();this.players=this.players.filter(p=>!p.pet);
    this.phase = 'lobby';this.pact=new PactState();
    this.step = null; this.round = 0; this.deadline = 0; this.deck = []; this.log = [{ icon: 'info', text: 'El anfitrión terminó la partida.' }];
    this.night = emptyNight(); this.votes.clear(); this.seerSeen.clear(); this.winner = null;
    this.lovers = null; this.peeks.clear(); this.exposedGirls.clear(); this.hunters = []; this.spentHunters.clear(); this.interrupted = null;
    for (const p of this.players) { p.role = null; p.alive = true; p.ready = false; }
  }

  audience(): string[] { return this.players.filter((p) => !p.bot).map((p) => p.id); }

  apply(actorId: string, action: WerewolvesAction, now: number): void {
    const actor = this.players.find((p) => p.id === actorId);
    switch (action.kind) {
      case 'join': {
        if (actor) return;
        if (this.phase !== 'lobby') throw new Error('La partida ya empezó. Espera a la siguiente.');
        if (this.players.length >= MAX_PLAYERS) throw new Error('La mesa está completa.');
        this.players.push({
          id: actorId, name: cleanName(action.name), color: cleanColor(action.color),
          bot: false, alive: true, role: null, ready: false,
        });
        this.leaderId ??= actorId;
        return;
      }
      case 'leave': {
        if (!actor) return;
        for(const pet of this.players.filter(p=>p.pet?.owner===actorId)){this.petMatch.remove(pet.pet!.id);if(pet.alive)this.kill(pet.id,'leave');}this.players=this.players.filter(p=>p.pet?.owner!==actorId);
        if (this.phase === 'lobby' || this.phase === 'end') {
          this.players = this.players.filter((p) => p.id !== actorId);
        } else if (actor.alive) {
          this.kill(actor.id,'leave');
          this.say('info', '{name} abandona la partida.', { name: actor.name });
          if (this.phase !== 'hunter') {
            this.interrupted = { phase: this.phase, step: this.step, remaining: Math.max(0, this.deadline - now) };
            this.finishDeaths(now, 'interrupted');
          } else this.finishDeaths(now, this.resumeAfterDeath);
        }
        if (this.leaderId === actorId) this.leaderId = this.players.find((p) => !p.bot && p.id !== actorId)?.id ?? null;
        if (!this.players.some((p) => !p.bot && (this.phase === 'lobby' || p.id !== actorId))) this.reset();
        return;
      }
      case 'add_bot': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') throw new Error('Solo se añaden bots antes de empezar.');
        if (this.players.length >= MAX_PLAYERS) throw new Error('La mesa está completa.');
        const pet=action.pet?this.petMatch.add(action.pet,actorId):undefined;
        const used = new Set(this.players.map((p) => p.name));
        const name = pick(BOT_NAMES.filter((n) => !used.has(n)), this.random) ?? `Bot ${this.players.length + 1}`;
        this.players.push({
          id: pet?`pet:${pet.owner}:${pet.id}`:`bot:${this.random(1_000_000_000)}`, name:pet?.name??name,...(pet?{pet}:{}), color: pick(BOT_COLORS, this.random)!,
          bot: true, alive: true, role: null, ready: true,
        });
        return;
      }
      case 'remove_bot': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') return;
        const removed=this.players.find(p=>p.id===action.id);if(removed?.pet)this.petMatch.remove(removed.pet.id);
        this.players = this.players.filter((p) => !(p.bot && p.id === action.id));
        return;
      }
      case 'configure': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') throw new Error('Las cartas se eligen antes de repartir.');
        if (!action.counts || typeof action.counts !== 'object') throw new Error('Set inválido.');
        const next: RoleCounts = {};
        for (const [role, count] of Object.entries(action.counts)) {
          if (role === 'villager') continue;
          if (!Object.hasOwn(ROLE_INFO, role) || !Number.isInteger(count) || count < 0 || count > roleLimit(role as WerewolfRole)) throw new Error('Set inválido.');
          if (role !== 'villager') next[role as WerewolfRole] = count;
        }
        this.counts = next;if(next.gypsy)this.settings.events=true;if(next.crow||next.arsonist)this.settings.buildings=true;return;
      }
      case 'settings': {
        this.requireLeader(actorId);if(this.phase!=='lobby'||!action.value||typeof action.value!=='object')throw new Error('Set inválido.');
        const next={...this.settings,...action.value};
        if(!Number.isInteger(next.daySeconds)||next.daySeconds<30||next.daySeconds>300||!Number.isInteger(next.nightSeconds)||next.nightSeconds<10||next.nightSeconds>120||typeof next.buildings!=='boolean'||typeof next.events!=='boolean')throw new Error('Set inválido.');
        this.settings=next;return;
      }
      case 'power':this.nightAction(this.requireAlive(actor),action,now);return;
      case 'judge': {
        if(this.phase!=='day'||!actor?.alive||this.powerRole(actor)!=='judge'||this.pact.used.has(`judge:${actorId}`)||this.mayorElection)throw new Error('Esa acción no corresponde a este turno.');
        this.pact.used.add(`judge:${actorId}`);this.pact.extraVote=true;return;
      }
      case 'inherit': {
        if(this.phase!=='execution'||!this.canInherit(actor))throw new Error('Esa acción no corresponde a este turno.');
        if(action.use)this.pact.used.add(`maid:${actorId}`);
        if(action.use){const victim=this.players.find(p=>p.id===this.pact.pendingExecution)!;actor!.role=victim.role==='cupid'?'villager':victim.role;victim.role='maid';this.pact.revealed.add(victim.id);this.pact.charmed.delete(actorId);if(this.mayorId===actorId)this.mayorId=null;if(this.pact.warden===actorId)this.pact.warden=null;this.resetPowers(actorId);}
        this.executeVerdict(now);return;
      }
      case 'successor': {
        if(this.phase!=='succession'||actorId!==this.pact.mayorDeath)throw new Error('Esa acción no corresponde a este turno.');
        this.requireTarget(action.target,p=>this.mayorCandidates().some(c=>c.id===p.id));this.mayorId=action.target;this.pact.mayorDeath=null;this.finishDeaths(now,this.resumeAfterDeath);return;
      }
      case 'scapegoat_vote': {
        if(this.phase!=='scapegoat'||this.pact.scapegoat!==actorId||!Array.isArray(action.targets)||new Set(action.targets).size!==action.targets.length||action.targets.some(id=>!this.alive().some(p=>p.id===id)))throw new Error('Esa acción no corresponde a este turno.');
        this.pact.restrictedVoters=new Set(action.targets);this.pact.restrictRound=this.round+1;this.pact.scapegoat=null;this.finishDeaths(now,this.resumeAfterDeath);return;
      }
      case 'building':this.buildingAction(this.requireAlive(actor),action,now);return;
      case 'housing': {
        if(!actor?.alive||!['day','execution'].includes(this.phase))throw new Error('Esa acción no corresponde a este turno.');
        const offer=this.pact.housingOffer.get(actorId);if(!offer||this.pact.building.has(actorId))throw new Error('Esa acción no corresponde a este turno.');
        this.pact.housingOffer.delete(actorId);if(action.accept){if(this.players.some(p=>p.id===offer.owner&&p.alive)||this.pact.building.get(offer.owner)!==offer.kind)throw new Error('Esa acción no corresponde a este turno.');this.pact.building.delete(offer.owner);this.pact.building.set(actorId,offer.kind);this.pact.buildingUsed.delete(actorId);if(offer.kind==='tavern')this.pact.tavernImmune.add(actorId);}
        return;
      }
      case 'warden': {
        if(this.phase!=='day'||actorId!==this.mayorId||!this.settings.events||action.target===actorId)throw new Error('Esa acción no corresponde a este turno.');
        this.requireTarget(action.target,()=>true);this.pact.warden=action.target;this.pact.wardenFrom=this.round+1;return;
      }
      case 'event': {
        if(this.phase!=='day'||actorId!==this.pact.warden||!actor?.alive||!this.settings.events||!this.pact.events.includes(action.event)||this.pact.event||this.round<this.pact.wardenFrom)throw new Error('Esa acción no corresponde a este turno.');
        this.pact.events=this.pact.events.filter(e=>e!==action.event);this.pact.event=action.event;
        if(action.event==='sleepwalking')this.pact.sleepwalking=true;
        if(action.event==='harvest')this.pact.harvest=true;
        if(action.event==='potion')this.healLeft=true;
        if(action.event==='double_vote')this.pact.extraVote=true;
        this.say('info','Evento: {event}.',{event:EVENT_INFO[action.event]});return;
      }
      case 'peek': {
        if (!actor?.alive || this.powerRole(actor) !== 'girl' || this.phase !== 'night' || this.step !== 'wolves' || this.night.acted.has(actorId)) throw new Error('No puedes espiar ahora.');
        if (action.spy) {
          const wolf = pick(this.alive().filter(p => this.isWolf(p)), this.random);
          if (wolf) { const seen = this.peeks.get(actorId) ?? new Set<string>(); seen.add(wolf.id); this.peeks.set(actorId, seen); }
          if (this.random(3) === 0) this.exposedGirls.add(actorId);
        }
        this.night.acted.add(actorId); if (this.stepDone()) this.endStep(now); return;
      }
      case 'hunter': {
        if (this.phase !== 'hunter' || this.hunters[0] !== actorId) throw new Error('No es tu último disparo.');
        if (action.target !== null) this.requireTarget(action.target, p => p.id !== actorId);
        this.hunters.shift();
        if (action.target) { this.kill(action.target,'hunter'); this.say('skull', '{name} dispara a {target}.', { name: actor!.name, target: this.players.find(p => p.id === action.target)!.name }); }
        this.finishDeaths(now, this.resumeAfterDeath); return;
      }
      case 'cupid':
        this.nightAction(this.requireAlive(actor), action, now); return;
      case 'mayor_setting': this.requireLeader(actorId);if(this.phase!=='lobby'||typeof action.enabled!=='boolean')throw new Error('Set inválido.');this.mayorEnabled=action.enabled;return;
      case 'start': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') return;
        this.deck = this.counts ? configuredDeck(this.players.length, this.counts) : roleDeck(this.players.length);
        this.pact=new PactState();
        let cards = shuffle(this.deck, this.random);
        if(this.deck.includes('thief')){cards=shuffle([...this.deck.filter(r=>r!=='thief'),'villager','villager'] as WerewolfRole[],this.random);this.pact.thiefCards=cards.splice(this.players.length-1);cards.splice(this.random(this.players.length),0,'thief');}
        if(this.settings.buildings||this.deck.some(r=>r==='crow'||r==='arsonist')){
          this.settings.buildings=true;
          this.mayorEnabled=true;const kinds=[...Object.keys(BUILDING_INFO),...Array(5).fill('farm')] as VillageBuilding[];
          this.players.forEach((p,i)=>{if(i<kinds.length){this.pact.building.set(p.id,kinds[i]);if(kinds[i]==='tavern')this.pact.tavernImmune.add(p.id);}});
        }
        if(cards.includes('gypsy'))this.settings.events=true;if(this.settings.events)this.mayorEnabled=true;this.pact.angelOpening=cards.includes('angel');
        this.petMatch.start();this.players.forEach((p, i) => { p.role = cards[i]; p.alive = true; p.ready = p.bot; });
        this.round = 0;this.mayorId=null;this.mayorElection=false;
        this.lovers = null; this.peeks.clear(); this.exposedGirls.clear(); this.hunters = []; this.spentHunters.clear(); this.interrupted = null;
        this.healLeft = true;
        this.poisonLeft = true;
        this.lastGuarded = null;
        this.seerSeen.clear();
        this.winner = null;
        this.verdict = null;
        this.log = [{ icon: 'info', text: 'Se reparten {count} cartas. Mira la tuya sin que nadie te vea.', params: { count: this.players.length } }];
        this.enter('reveal', now);
        return;
      }
      case 'ready': {
        if (this.phase !== 'reveal' || !actor) return;
        actor.ready = true;
        if (this.players.every((p) => p.ready)) this.openGame(now);
        return;
      }
      case 'wolf_vote':
      case 'seer_look':
      case 'guard':
      case 'witch':
        this.nightAction(this.requireAlive(actor), action, now);
        return;
      case 'vote': {
        const voter = this.requireAlive(actor);
        if (this.phase !== 'day'||!this.canVote(voter)) throw new Error('Solo se vota de día.');
        if (action.target !== 'skip') this.requireTarget(action.target, (p) => this.mayorElection ? this.mayorCandidates().some(c=>c.id===p.id) : p.id !== voter.id&&!this.isLoverPair(voter.id,p.id)&&!this.pact.tavernImmune.has(p.id));
        this.votes.set(voter.id, action.target);
        if (this.alive().filter(p=>this.canVote(p)).every((p) => this.votes.has(p.id))) this.closeVote(now);
        return;
      }
      case 'continue': {
        this.requireLeader(actorId);
        if (this.phase === 'dawn' || this.phase === 'verdict') this.deadline = now;
        this.tick(now);
        return;
      }
      case 'play_again': {
        this.requireLeader(actorId);
        if (this.phase !== 'end') return;
        for (const p of this.players) { p.role = null; p.alive = true; p.ready = false; }
        this.phase = 'lobby';
        this.step = null;
        this.deck = [];
        this.log = [];
        return;
      }
    }
  }

  tick(now: number): boolean {
    if (this.phase === 'lobby' || this.phase === 'end') return false;
    let changed = false;
    if(now>=this.botAt&&['execution','succession','scapegoat','reveal','hunter'].includes(this.phase))changed=this.botsAct(now);
    if(this.phase==='execution'){if(now>=this.deadline){this.executeVerdict(now);return true;}return false;}
    if(this.phase==='succession'){if(now>=this.deadline){this.mayorId=pick(this.mayorCandidates(),this.random)?.id??null;this.pact.mayorDeath=null;this.finishDeaths(now,this.resumeAfterDeath);return true;}return false;}
    if(this.phase==='scapegoat'){if(now>=this.deadline){this.pact.scapegoat=null;this.finishDeaths(now,this.resumeAfterDeath);return true;}return false;}
    if (this.phase === 'hunter') {
      const hunter = this.players.find(p => p.id === this.hunters[0]);
      if (now >= this.deadline || (hunter?.bot && now >= this.botAt)) {
        this.apply(hunter!.id, { kind: 'hunter', target: null }, now); return true;
      }
      return false;
    }
    if (this.phase === 'night' && this.step && now >= this.botAt) changed = this.botsAct(now) || changed;
    if (this.phase === 'day' && now >= this.botAt) changed = this.botsVote(now) || changed;
    // Bots may have just ended the game.
    if ((this.phase as WerewolvesPhase) !== 'end' && now >= this.deadline) {
      changed = true;
      switch (this.phase) {
        case 'reveal': this.openGame(now); break;
        case 'night': this.endStep(now); break;
        case 'dawn': this.enter('day', now); break;
        case 'day': this.closeVote(now); break;
        case 'verdict': if(this.pact.extraVote&&!this.pact.secondVote){this.pact.extraVote=false;this.pact.secondVote=true;this.enter('day',now);this.deadline=now+30000;}else this.beginNight(now); break;
      }
    }
    return changed;
  }

  viewFor(viewerId: string, now: number): WerewolvesView {
    const me = this.players.find((p) => p.id === viewerId) ?? null;
    const over = this.phase === 'end';
    const myRole = me?.role ?? null;
    const knows = (p: WerewolfPlayer): WerewolfRole|null => {
      if(!p.role)return null;
      if(over||p.id===viewerId||(!p.alive&&!this.pact.revealed.has(p.id))||p.role==='innocent'||this.pact.idiots.has(p.id))return p.role;
      if(me&&this.isWolf(me)&&this.isWolf(p))return 'werewolf';
      if(myRole==='girl'&&this.peeks.get(viewerId)?.has(p.id))return 'werewolf';
      if(me&&this.isWolf(me)&&this.exposedGirls.has(p.id))return p.role;
      if((myRole==='sister'||myRole==='brother')&&p.role===myRole&&this.round>0)return p.role;
      return this.pact.personalSeen.get(viewerId)?.get(p.id)??null;
    };
    const preview = this.previewDeck();
    const wolfTurn = !!me&&this.isWolf(me) && this.phase === 'night' && this.step === 'wolves';
    const myTurn = !!me && me.alive && this.phase === 'night' && !!this.step && this.actsInStep(me,this.step);
    const showVotes = this.phase === 'day' || this.phase === 'verdict';
    return {
      housingOffer:this.pact.housingOffer.get(viewerId)?.kind??null,settings:{...this.settings},cameraPhase:`${this.phase}:${this.round}:${this.step}`,cameraAudience:null,canSeeCameras:this.canObserveCameras(viewerId),canBroadcastCamera:this.canBroadcastCamera(viewerId),canVote:!!me&&this.canVote(me),voteTargets:me&&this.canVote(me)?this.alive().filter(p=>this.mayorElection?this.mayorCandidates().some(c=>c.id===p.id):p.id!==viewerId&&!this.isLoverPair(viewerId,p.id)&&!this.pact.tavernImmune.has(p.id)).map(p=>p.id):[],
      pack:me&&this.isWolf(me)?this.alive().filter(p=>p.id!==viewerId&&this.isWolf(p)).map(p=>p.id):[],
      privateInfo:this.privateInfo(viewerId),powerChoices:this.powerChoices(me),canJudge:!!me&&me.alive&&this.powerRole(me)==='judge'&&!this.pact.used.has(`judge:${viewerId}`)&&this.phase==='day'&&!this.mayorElection,
      canInherit:this.phase==='execution'&&this.canInherit(me??undefined),successorTargets:this.phase==='succession'&&this.pact.mayorDeath===viewerId?this.mayorCandidates().map(p=>p.id):[],
      scapegoatTargets:this.phase==='scapegoat'&&this.pact.scapegoat===viewerId?this.alive().map(p=>p.id):[],
      buildings:this.players.map(p=>({id:p.id,kind:this.pact.building.get(p.id)??null,used:this.pact.buildingUsed.has(p.id)})),myBuilding:this.pact.building.get(viewerId)??null,
      buildingAvailable:!!me&&me.alive&&['day','execution'].includes(this.phase)&&!!this.pact.building.get(viewerId)&&(!this.pact.buildingUsed.has(viewerId)||['school','bailiff'].includes(this.pact.building.get(viewerId)!)),buildingTargets:this.alive().map(p=>p.id),
      wardenId:this.pact.warden,events:viewerId===this.pact.warden&&this.round>=this.pact.wardenFrom?[...this.pact.events]:[],event:this.pact.event,
      mayorEnabled:this.mayorEnabled,mayorId:this.mayorId,mayorElection:this.mayorElection,
      phase: this.phase,
      step: this.phase === 'night' ? this.step : null,
      round: this.round,
      remainingMs: this.phase === 'lobby' || over ? 0 : Math.max(0, this.deadline - now),
      leaderId: this.leaderId,
      me: {
        id: viewerId, seated: !!me, alive: !!me?.alive, role: myRole,
        acted: !!me && ((this.phase === 'night' && this.night.acted.has(me.id)) || (this.phase === 'day' && this.votes.has(me.id)) || (this.phase === 'reveal' && me.ready)),
        isLeader: this.isController(viewerId),
      },
      players: this.players.map((p) => ({
        id: p.id, name: p.name, color: p.color, bot: p.bot,...(p.pet?{pet:p.pet}:{}), alive: p.alive, role: knows(p), ready: p.ready,
        votesFor: showVotes ? this.votes.get(p.id) ?? null : null,
        wolfTarget: wolfTurn ? this.night.wolfVotes.get(p.id) ?? null : null,
      })),
      deck: this.deck.length ? [...this.deck] : preview.deck,
      counts: this.counts ?? Object.fromEntries(Object.keys(ROLE_INFO).map(role => [role, preview.deck.filter(r => r === role).length])), deckError: preview.error,
      loverId: this.lovers?.includes(viewerId) ? this.lovers.find(id => id !== viewerId)! : null,
      peeked: myRole === 'girl' ? [...(this.peeks.get(viewerId) ?? [])] : [],
      hunterTargets: this.phase === 'hunter' && this.hunters[0] === viewerId ? this.alive().map(p => p.id) : [],
      turn: myTurn && this.step ? this.turnFor(me!, this.step) : null,
      seerSeen: [...(this.pact.personalSeen.get(viewerId)??new Map<string,WerewolfRole>())].map(([id,role])=>({id,role})),
      nightDeaths: this.phase === 'dawn' || this.phase === 'day' ? [...this.nightDeaths] : [],
      verdict: this.phase === 'verdict' || over ? this.verdict : null,
      winner: this.winner,
      log: this.log.slice(-30),
    };
  }

  private turnFor(me: WerewolfPlayer, step: NightStep): WerewolvesTurn {
    const alive = this.alive();
    const base = { step, victim: null, canHeal: false, canPoison: false, lastGuarded: null };
    switch (step) {
      case 'cupid': return { ...base, targets: alive.map(p => p.id) };
      case 'wolves': return { ...base, targets: alive.filter((p) => !this.isWolf(p)&&!this.isLoverPair(me.id,p.id)&&!this.pact.tavernImmune.has(p.id)&&(!this.pact.harvest||this.neighbors(me.id).includes(p.id))).map((p) => p.id) };
      case 'seer': return { ...base, targets: alive.filter((p) => p.id !== me.id && !this.pact.personalSeen.get(me.id)?.has(p.id)).map((p) => p.id) };
      case 'guard': return { ...base, targets: alive.filter((p) => p.id !== this.lastGuarded).map((p) => p.id), lastGuarded: this.lastGuarded };
      case 'witch': return {
        ...base,
        targets: alive.filter((p) => p.id !== me.id).map((p) => p.id),
        victim: this.night.victim,
        canHeal: this.healLeft && !!this.night.victim,
        canPoison: this.poisonLeft,
      };
      default: return this.extraTurn(me,step,base);
    }
  }

  private nightAction(actor: WerewolfPlayer, action: WerewolvesAction, now: number): void {
    const step = this.step;
    if (this.phase !== 'night' || !step || !this.actsInStep(actor,step)) throw new Error('No es tu turno. Mantén los ojos cerrados.');
    if (this.night.acted.has(actor.id) && step !== 'wolves') throw new Error('Ya has actuado esta noche.');
    const turn = this.turnFor(actor, step);
    if (action.kind === 'cupid' && step === 'cupid') {
      if (!Array.isArray(action.targets) || action.targets.length !== 2 || action.targets[0] === action.targets[1] || action.targets.some(id => !turn.targets.includes(id))) throw new Error('Elige dos personas distintas.');
      this.lovers = [...action.targets];
    } else if (action.kind === 'wolf_vote' && step === 'wolves') {
      if (!turn.targets.includes(action.target)) throw new Error('Esa persona no puede ser atacada.');
      this.night.wolfVotes.set(actor.id, action.target);
    } else if (action.kind === 'seer_look' && step === 'seer') {
      if (!turn.targets.includes(action.target)) throw new Error('Elige a otra persona viva que no hayas mirado.');
      const target = this.players.find((p) => p.id === action.target)!;
      this.rememberRole(actor.id,target.id,target.role!);
      if(this.pact.sleepwalking)this.say('info','La vidente ha visto: {role}.',{role:ROLE_INFO[target.role!].name});
    } else if (action.kind === 'guard' && step === 'guard') {
      if (!turn.targets.includes(action.target)) throw new Error('No puedes proteger a la misma persona dos noches seguidas.');
      this.night.guarded = action.target;
    } else if (action.kind === 'witch' && step === 'witch') {
      if (action.heal && !turn.canHeal) throw new Error('No hay víctima que salvar o ya usaste la poción de vida.');
      if (action.poison !== null && (!turn.canPoison || !turn.targets.includes(action.poison))) throw new Error('No puedes envenenar a esa persona.');
      if (action.heal) { this.night.healed = true; this.healLeft = false; }
      if (action.poison) { this.night.poisoned = action.poison; this.poisonLeft = false; }
    } else if(action.kind==='power'){this.extraPower(actor,step,action,turn,now);} else {
      throw new Error('Esa acción no corresponde a este turno.');
    }
    if((this.phase as WerewolvesPhase)==='end')return;
    this.pact.used.delete(`fresh:${actor.id}`);this.night.acted.add(actor.id);
    if (this.stepDone()) this.endStep(now);
  }

  private stepDone(): boolean {
    const step = this.step;
    if (!step) return true;
    if (step === 'wolves' && this.alive().some(p => this.powerRole(p) === 'girl' && !this.night.acted.has(p.id))) return false;
    return this.alive().filter((p) => this.actsInStep(p,step)).every((p) => this.night.acted.has(p.id));
  }

  private beginNight(now: number): void {
    this.round += 1;this.pact.secondVote=false;this.pact.event=null;this.pact.blockedVotes.clear();
    this.pact.actorRoles.clear();this.pact.extraVictims.clear();this.pact.infectTarget=null;this.pact.crowTarget=null;this.pact.burnTarget=null;
    this.pact.rustDeaths=[];for(const [id,round]of this.pact.rusty)if(round<=this.round){this.kill(id,'rust');this.pact.rustDeaths.push(id);this.pact.rusty.delete(id);}
    this.night = emptyNight();
    this.nightDeaths = [];
    this.votes.clear();
    this.verdict = null;
    this.phase = 'night';
    this.step = null;
    this.say('moon', 'Noche {round}. La aldea cierra los ojos.', { round: this.round });
    this.nextStep(now);
  }

  /** Moves to the next night turn that someone alive can play, or to dawn. */
  private nextStep(now: number): void {
    const from = this.step ? NIGHT_ORDER.indexOf(this.step) + 1 : 0;
    for (const step of NIGHT_ORDER.slice(from)) {
      if (!this.stepAvailable(step))continue;
      if (this.alive().some((p) => this.actsInStep(p,step))) {
        this.step = step;this.night.acted.clear();
        this.deadline = now + Math.min(DURATIONS[step],this.settings.nightSeconds*1000);
        this.botAt = now + this.botDelay();
        return;
      }
    }
    this.step = null;
    this.resolveNight(now);
  }

  private endStep(now: number): void {
    for(const p of this.alive().filter(p=>!!this.step&&this.actsInStep(p,this.step)&&!this.night.acted.has(p.id))){
      if(this.step==='thief'){const turn=this.turnFor(p,'thief');if(!turn.optional&&turn.choices?.length){const choice=turn.choices.find(x=>WOLF_ROLES.includes(x.split(':')[1] as WerewolfRole))??turn.choices[0];this.extraPower(p,'thief',{kind:'power',choice},turn,now);}}
      if(this.step==='wildchild'){const model=pick(this.alive().filter(o=>o.id!==p.id),this.random);if(model)this.pact.models.set(p.id,model.id);}
      if(this.step==='dogwolf')this.pact.dogChosen.add(p.id);
    }
    if (this.step === 'wolves') this.night.victim = this.wolfChoice();
    this.nextStep(now);
  }

  private wolfChoice(): string | null {
    const counts = new Map<string, number>();
    for (const target of this.night.wolfVotes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
    const best = Math.max(0, ...counts.values());
    // A split pack settles it by chance, never by seat order.
    return pick([...counts].filter(([, n]) => n === best && best > 0).map(([id]) => id), this.random) ?? null;
  }

  private resolveNight(now: number): void {
    const deaths = new Map<string,string>();
    const victim=this.night.victim,fire=this.pact.burnTarget;
    if(fire){this.pact.building.delete(fire);this.pact.tavernImmune.delete(fire);this.pact.burned.add(fire);this.say('info','La casa de {name} se ha quemado.',{name:this.players.find(p=>p.id===fire)!.name});}
    const attacks=new Set([...this.pact.extraVictims,...(victim?[victim]:[])]);
    if(fire&&fire===victim){const caught=this.nextWolf(victim,1);if(caught)deaths.set(caught.id,'fire');attacks.clear();}
    for(const id of attacks){
      const p=this.players.find(p=>p.id===id);if(!p?.alive||id===this.pact.infectTarget)continue;
      if(id===this.night.guarded&&this.powerRole(p)!=='girl')continue;
      if(id===victim&&this.night.healed)continue;
      if(this.powerRole(p)==='elder'&&!this.pact.elderHits.has(id)){this.pact.elderHits.set(id,1);continue;}
      deaths.set(id,'wolf');
    }
    if(this.night.poisoned)deaths.set(this.night.poisoned,'witch');
    this.lastGuarded=this.night.guarded;
    this.nightDeaths=[...this.pact.rustDeaths,...[...deaths.keys()].filter(id=>this.players.some(p=>p.id===id&&p.alive))];
    for(const [id,reason]of deaths)this.kill(id,reason);
    if(!this.nightDeaths.length)this.say('sun','Amanece y nadie ha muerto esta noche.');
    for(const id of this.nightDeaths){const p=this.players.find(p=>p.id===id)!;this.say('skull','{name} aparece sin vida. Su carta: {role}.',{name:p.name,role:ROLE_INFO[p.role!].name});}
    this.pact.bearGrowls=this.alive().some(p=>this.powerRole(p)==='bear'&&(this.isWolf(p)||this.neighbors(p.id).some(id=>this.isWolf(this.players.find(p=>p.id===id)!))));
    if(this.pact.bearGrowls)this.say('info','El oso gruñe: hay un lobo cerca.');
    if(this.round===1)for(const p of this.alive())if(p.role==='angel')p.role='villager';this.pact.harvest=false;this.finishDeaths(now,'dawn');
  }

  private closeVote(now: number): void {
    const tally = new Map<string, number>();
    for (const [voter,target] of this.votes)if(this.players.some(p=>p.id===voter&&this.canVote(p)))tally.set(target, (tally.get(target) ?? 0) + (!this.mayorElection && voter===this.mayorId ? 2 : 1));
    if(!this.mayorElection&&this.pact.crowTarget&&this.alive().some(p=>p.id===this.pact.crowTarget))tally.set(this.pact.crowTarget,(tally.get(this.pact.crowTarget)??0)+2);
    const best = Math.max(0, ...tally.values());
    const top = [...tally].filter(([, n]) => n === best && best > 0).map(([id]) => id);
    let chosen = top.length === 1 && top[0] !== 'skip' ? top[0] : null;
    if(this.mayorElection){this.mayorId=chosen;this.mayorElection=false;this.votes.clear();this.deadline=now+this.settings.daySeconds*1000;this.botAt=now+1000;return;}
    const mayorVote=this.mayorId?this.votes.get(this.mayorId):null;
    if(!chosen&&top.length>1&&mayorVote&&top.includes(mayorVote)&&mayorVote!=='skip')chosen=mayorVote;
    if(!chosen&&top.length>1){const goat=this.alive().find(p=>this.powerRole(p)==='scapegoat');if(goat){chosen=goat.id;this.pact.scapegoat=goat.id;}}
    if(this.pact.event==='peace')chosen=null;
    this.verdict = { id: chosen, tie: top.length > 1 };
    for(const tavern of this.pact.tavernImmune)if(chosen&&this.votes.get(tavern)===chosen){this.pact.tavernImmune.delete(tavern);this.pact.buildingUsed.add(tavern);}
    if(chosen){
      const p=this.players.find(x=>x.id===chosen)!;
      if(this.powerRole(p)==='idiot'&&!this.pact.idiots.has(p.id)){this.pact.idiots.add(p.id);if(this.mayorId===p.id){this.mayorId=null;this.pact.mayorAbolished=true;}this.say('info','El inocente es indultado, pero pierde su voto.');this.enter('verdict',now);return;}
      this.pact.pendingExecution=chosen;this.pact.executionVotes=best;
      if(this.alive().some(p=>this.canInherit(p)||this.pact.building.get(p.id)==='manor'&&!this.pact.buildingUsed.has(p.id))){this.phase='execution';this.step=null;this.deadline=now+DURATIONS.execution;return;}
      this.executeVerdict(now);return;
    }
    this.say('vote',top.length>1?'Empate en la votación: nadie es eliminado hoy.':'La aldea decide no eliminar a nadie hoy.');
    this.finishDeaths(now,'verdict');
  }

  private afterDeaths(now: number): void {
    for (const [voter, target] of this.votes) if (!this.players.some(p => p.id === voter && p.alive) || (target !== 'skip' && !this.players.some(p => p.id === target && p.alive))) this.votes.delete(voter);
    if (this.checkWin()) return;
    if (this.phase === 'night' && this.stepDone()) this.endStep(now);
    else if (this.phase === 'day' && this.alive().filter(p=>this.canVote(p)).every((p) => this.votes.has(p.id))) this.closeVote(now);
  }

  private previewDeck(): { deck: WerewolfRole[]; error: string | null } {
    try { return { deck: this.counts ? configuredDeck(Math.max(MIN_PLAYERS, this.players.length), this.counts) : roleDeck(Math.max(MIN_PLAYERS, this.players.length)), error: null }; }
    catch (e) { return { deck: [], error: e instanceof Error ? e.message : 'Set inválido.' }; }
  }

  private finishDeaths(now: number, resume: 'dawn' | 'verdict' | 'interrupted'): void {
    this.resumeAfterDeath = resume;
    if (this.lovers) {
      const pair = this.lovers.map(id => this.players.find(p => p.id === id)!);
      if (pair.some(p => !p.alive)) for (const p of pair) if (p.alive) { this.kill(p.id,'bond'); this.nightDeaths.push(p.id); this.say('skull', '{name} muere por su vínculo.', { name: p.name }); }
    }
    for (const p of this.players) if (!p.alive && this.powerRole(p) === 'hunter' && !this.spentHunters.has(p.id)) { this.spentHunters.add(p.id); this.hunters.push(p.id); }
    if (this.hunters.length) { this.phase = 'hunter'; this.step = null; this.deadline = now + DURATIONS.hunter; this.botAt = now + 1800; return; }
    if(this.checkWin())return;
    if(this.mayorId&&!this.players.some(p=>p.id===this.mayorId&&p.alive)&&!this.mayorCandidates().length){this.mayorId=null;this.pact.mayorAbolished=true;}
    if(this.mayorId&&!this.players.some(p=>p.id===this.mayorId&&p.alive)){this.pact.mayorDeath=this.mayorId;this.phase='succession';this.step=null;this.deadline=now+DURATIONS.succession;return;}
    if(this.pact.scapegoat){this.phase='scapegoat';this.step=null;this.deadline=now+DURATIONS.scapegoat;return;}
    if (resume !== 'interrupted') this.enter(resume, now);
    else if (this.interrupted) {
      this.phase = this.interrupted.phase; this.step = this.interrupted.step;
      this.deadline = now + this.interrupted.remaining; this.botAt = now + 1000; this.interrupted = null;
      this.afterDeaths(now);
    }
  }

  private checkWin(): boolean {
    const alive=this.alive(),wolves=alive.filter(p=>this.isWolf(p)),solo=alive.filter(p=>['whitewolf','piper','cultist'].includes(p.role!)&&!this.pact.infected.has(p.id));
    if(this.winner==='angel'){}
    else if(!alive.length)this.winner='nobody';
    else if(this.lovers&&alive.length===2&&this.lovers.every(id=>alive.some(p=>p.id===id))&&(this.isWolf(alive[0])!==this.isWolf(alive[1])||alive.some(p=>p.role==='piper')))this.winner='lovers';
    else if(alive.length===1&&alive[0].role==='whitewolf')this.winner='whitewolf';
    else if(alive.some(p=>this.powerRole(p)==='piper'&&!this.isWolf(p)&&alive.every(o=>o.id===p.id||this.pact.charmed.has(o.id))))this.winner='piper';
    else if(alive.some(p=>p.role==='cultist'&&!this.isWolf(p)&&alive.every(o=>this.players.indexOf(o)%2===this.players.indexOf(p)%2)))this.winner='cultist';
    else if(!wolves.length&&!solo.length)this.winner='aldea';
    else if(!solo.length&&wolves.length>=alive.length-wolves.length)this.winner='lobos';
    else return false;
    this.phase='end';this.petMatch.release();this.step=null;
    const texts:Record<NonNullable<WerewolvesView['winner']>,string>={aldea:'¡Gana la aldea! No queda ningún hombre lobo.',lobos:'¡Ganan los hombres lobo! Ya son tantos como los aldeanos.',lovers:'¡Ganan los enamorados!',whitewolf:'¡Gana el lobo blanco!',piper:'¡Gana el flautista!',cultist:'¡Gana el sectario!',angel:'¡Gana el ángel!',nobody:'No quedan supervivientes.'};
    this.say('trophy',texts[this.winner!]);return true;
  }

  private enter(phase: 'reveal' | 'dawn' | 'day' | 'verdict', now: number): void {
    this.phase = phase;
    this.step = null;
    this.deadline = now + (phase==='day'?this.settings.daySeconds*1000:DURATIONS[phase]);
    if (phase === 'day') {
      this.mayorElection=this.mayorEnabled&&!this.pact.mayorAbolished&&(!this.settings.buildings||this.round>=2)&&this.mayorCandidates().length>0&&!this.players.some(p=>p.id===this.mayorId&&p.alive);
      this.votes.clear();
      this.botAt = now + 4_000 + this.random(6_000);
      this.say('sun', 'Día {round}. Debatid y votad a quién eliminar.', { round: this.round });
    }
  }

  private botsAct(now:number):boolean{
    let changed=false;
    for(const bot of this.players.filter(p=>p.bot)){
      for(let attempt=0;attempt<2;attempt++){
        const action=werewolfDecision(this.viewFor(bot.id,now),attempt===0?this.random:()=>0);if(!action)break;
        try{this.apply(bot.id,action,now);changed=true;break;}catch{/* Retry once; the authoritative phase deadline is the final fallback. */}
      }
    }
    this.botAt=now+1000+this.random(1000);return changed;
  }
  private botsVote(now:number):boolean{return this.botsAct(now);}

  /** The authority enforces these independently of the visible camera curtain. */
  canBroadcastCamera(id:string):boolean {const p=this.players.find(p=>p.id===id);return !p||p.alive||this.phase==='lobby'||this.phase==='end';}
  canReceiveCamera(viewer:string,sender:string):boolean {
    if(!this.canBroadcastCamera(sender))return false;
    return this.canObserveCameras(viewer);
  }
  private canObserveCameras(viewer:string):boolean {
    if(this.phase!=='night')return true;
    const p=this.players.find(p=>p.id===viewer);
    return !!p&&p.alive&&!!this.step&&this.actsInStep(p,this.step)&&!this.night.acted.has(viewer);
  }
  setController(id:string|null):void{this.controller=id;}
  private openGame(now:number):void {if(this.pact.angelOpening){this.pact.angelOpening=false;this.enter('day',now);}else this.beginNight(now);}
  private isWolf(p:WerewolfPlayer):boolean{return !!p.role&&(WOLF_ROLES.includes(p.role)||this.pact.infected.has(p.id));}
  private powerRole(p:WerewolfPlayer):WerewolfRole|null {
    if(this.pact.powerless&&!this.isWolf(p))return 'villager';
    return this.pact.actorRoles.get(p.id)??p.role;
  }
  private isLoverPair(a:string,b:string):boolean{return !!this.lovers&&this.lovers.includes(a)&&this.lovers.includes(b);}
  private actsInStep(p:WerewolfPlayer,step:NightStep):boolean {
    if(step==='wolves')return this.isWolf(p);
    if(step==='baker')return this.pact.building.get(p.id)==='bakery';
    if(step==='actor')return p.role==='actor'&&!this.pact.powerless;
    return this.powerRole(p)===STEP_ROLE[step];
  }
  private stepAvailable(step:NightStep):boolean {
    if(['thief','dogwolf','wildchild','cupid','sister','brother'].includes(step)&&this.round>1){
      // Newly inherited first-night powers are explicitly reset for their new owner.
      return this.alive().some(p=>this.actsInStep(p,step)&&this.pact.used.has(`fresh:${p.id}`));
    }
    if(step==='whitewolf'&&this.round%2!==0)return false;
    if(step==='bigwolf'&&this.pact.wolfDied)return false;
    if(step==='infectwolf'&&this.pact.used.has('infection'))return false;
    if(step==='fox'&&this.alive().filter(p=>this.actsInStep(p,step)).every(p=>this.pact.foxSpent.has(p.id)))return false;
    if(step==='arsonist'&&this.pact.used.has('fire'))return false;
    if(step==='gypsy'&&(!this.settings.events||!this.pact.deathOrder.length||!this.pact.spiritLeft))return false;
    if(step==='actor'&&!this.pact.actorCards.length)return false;
    return true;
  }
  private neighbors(id:string):string[] {
    const alive=this.alive(),i=alive.findIndex(p=>p.id===id);if(i<0||alive.length<2)return [];
    return [...new Set([alive[(i-1+alive.length)%alive.length].id,alive[(i+1)%alive.length].id])];
  }
  private nextWolf(id:string,direction:number):WerewolfPlayer|undefined {
    const i=this.players.findIndex(p=>p.id===id),n=this.players.length;
    for(let k=1;k<n;k++){const p=this.players[(i+k*direction+n*n)%n];if(p.alive&&this.isWolf(p))return p;}return undefined;
  }
  private rememberRole(viewer:string,id:string,role:WerewolfRole):void {
    const seen=this.pact.personalSeen.get(viewer)??new Map<string,WerewolfRole>();seen.set(id,role);this.pact.personalSeen.set(viewer,seen);
  }
  private powerChoices(me:WerewolfPlayer|null):string[]{return me&&this.phase==='night'&&this.step&&this.actsInStep(me,this.step)?this.extraTurn(me,this.step,{step:this.step,victim:null,canHeal:false,canPoison:false,lastGuarded:null}).choices??[]:[];}
  private privateInfo(id:string):LogEntry[] {
    const result:LogEntry[]=[],p=this.players.find(p=>p.id===id);if(!p)return result;
    if(this.pact.infected.has(id))result.push({icon:'moon',text:'Ahora perteneces a la manada.'});
    const model=this.pact.models.get(id);if(model)result.push({icon:'info',text:'Tu modelo: {name}.',params:{name:this.players.find(p=>p.id===model)?.name??''}});
    const fox=this.pact.foxResults.get(id);if(fox)result.push({icon:'info',text:fox.found?'Hay un lobo entre: {names}.':'No hay lobos entre: {names}. Tu olfato se ha agotado.',params:{names:fox.ids.map(x=>this.players.find(p=>p.id===x)?.name??'').join(', ')}});
    if(this.pact.charmed.has(id)||p.role==='piper')result.push({icon:'info',text:'Personas encantadas: {names}.',params:{names:[...this.pact.charmed].map(x=>this.players.find(p=>p.id===x)?.name??'').join(', ')}});
    if(p.role==='cultist'){const parity=this.players.indexOf(p)%2;result.push({icon:'info',text:'Tu grupo: {names}.',params:{names:this.players.filter((_,i)=>i%2===parity).map(p=>p.name).join(', ')}});}
    if(this.pact.powerless&&!this.isWolf(p))result.push({icon:'info',text:'La aldea ha perdido sus poderes al matar al anciano.'});
    return result;
  }
  private extraTurn(me:WerewolfPlayer,step:NightStep,base:Omit<WerewolvesTurn,'targets'>):WerewolvesTurn {
    const others=this.alive().filter(p=>p.id!==me.id&&!this.isLoverPair(me.id,p.id));
    switch(step){
      case 'thief':return {...base,targets:[],choices:this.pact.thiefCards.map((r,i)=>`${i}:${r}`),optional:!this.pact.thiefCards.every(r=>WOLF_ROLES.includes(r))&&this.alive().some(p=>this.isWolf(p))};
      case 'actor':return {...base,targets:[],choices:[...this.pact.actorCards],optional:true};
      case 'dogwolf':return {...base,targets:[],choices:['village','wolves']};
      case 'wildchild':return {...base,targets:others.map(p=>p.id)};
      case 'baker':case 'sister':case 'brother':return {...base,targets:[],optional:true};
      case 'fox':return {...base,targets:this.alive().map(p=>p.id),optional:true};
      case 'whitewolf':return {...base,targets:others.filter(p=>this.isWolf(p)).map(p=>p.id),optional:true};
      case 'bigwolf':return {...base,targets:others.filter(p=>!this.isWolf(p)&&p.id!==this.night.victim&&!this.pact.tavernImmune.has(p.id)).map(p=>p.id),optional:true};
      case 'infectwolf':return {...base,targets:[],victim:this.night.victim,choices:this.night.victim?['infect','skip']:['skip'],optional:true};
      case 'crow':return {...base,targets:others.filter(p=>this.pact.building.has(p.id)).map(p=>p.id),optional:true};
      case 'arsonist':return {...base,targets:this.alive().filter(p=>this.pact.building.has(p.id)).map(p=>p.id),optional:true};
      case 'piper':return {...base,targets:others.filter(p=>!this.pact.charmed.has(p.id)).map(p=>p.id),chooseCount:2,optional:true};
      case 'gypsy':return {...base,targets:[],choices:['dead_wolf','seer_alive','wolves_many','neighbors_wolf'],optional:true};
      default:return {...base,targets:[]};
    }
  }
  private extraPower(actor:WerewolfPlayer,step:NightStep,action:Extract<WerewolvesAction,{kind:'power'}>,turn:WerewolvesTurn,now:number):void {
    const targets=action.targets??[];
    if(!Array.isArray(targets)||targets.some(id=>typeof id!=='string'||!turn.targets.includes(id))||new Set(targets).size!==targets.length||targets.length>(turn.chooseCount??1))throw new Error('Elige a otra persona viva.');
    if(action.use===false||action.choice==='skip'){if(!turn.optional)throw new Error('Esa acción no corresponde a este turno.');return;}
    const target=targets[0];
    if(turn.choices?.length&&!turn.choices.includes(action.choice??''))throw new Error('Esa acción no corresponde a este turno.');
    if(turn.targets.length&&!target&&!turn.optional)throw new Error('Elige a otra persona viva.');
    if(step==='thief'){const role=this.pact.thiefCards[Number(action.choice?.split(':')[0])];if(!role||!this.alive().some(p=>this.isWolf(p))&&!WOLF_ROLES.includes(role))throw new Error('Set inválido.');actor.role=role;this.pact.thiefCards=[];}
    else if(step==='actor'){const role=action.choice as WerewolfRole;this.pact.actorRoles.set(actor.id,role);this.pact.actorCards=this.pact.actorCards.filter(r=>r!==role);}
    else if(step==='dogwolf'){this.pact.dogChosen.add(actor.id);if(action.choice==='wolves')this.pact.infected.add(actor.id);}
    else if(step==='wildchild'&&target)this.pact.models.set(actor.id,target);
    else if(step==='fox'&&target){const ids=[...new Set([...this.neighbors(target),target])],found=ids.some(id=>this.isWolf(this.players.find(p=>p.id===id)!));this.pact.foxResults.set(actor.id,{ids,found});if(!found)this.pact.foxSpent.add(actor.id);}
    else if(step==='whitewolf'&&target)this.pact.extraVictims.add(target);
    else if(step==='bigwolf'&&target)this.pact.extraVictims.add(target);
    else if(step==='infectwolf'&&action.choice==='infect'&&this.night.victim){const victim=this.players.find(p=>p.id===this.night.victim)!;this.pact.used.add('infection');this.pact.infectTarget=victim.id;if(this.powerRole(victim)==='elder'&&!this.pact.elderHits.has(victim.id))this.pact.elderHits.set(victim.id,1);else{this.pact.infected.add(victim.id);if(victim.role==='piper'||victim.role==='cultist')victim.role='werewolf';}}
    else if(step==='crow'&&target)this.pact.crowTarget=target;
    else if(step==='arsonist'&&target){this.pact.burnTarget=target;this.pact.used.add('fire');}
    else if(step==='piper'){for(const id of targets)this.pact.charmed.add(id);this.checkWin();}
    else if(step==='gypsy'){
      const first=this.players.find(p=>p.id===this.pact.deathOrder[0]);let yes=false;
      if(action.choice==='dead_wolf')yes=!!first&&this.isWolf(first);
      if(action.choice==='seer_alive')yes=this.alive().some(p=>this.powerRole(p)==='seer');
      if(action.choice==='wolves_many')yes=this.alive().filter(p=>this.isWolf(p)).length>=2;
      if(action.choice==='neighbors_wolf')yes=this.neighbors(actor.id).some(id=>this.isWolf(this.players.find(p=>p.id===id)!));
      this.pact.spiritLeft--;this.say('info','Espiritismo: {question} — {answer}.',{question:SPIRIT_QUESTIONS[action.choice!],answer:yes?'Sí':'No'});
    }
    this.pact.used.delete(`fresh:${actor.id}`);
  }
  private mayorCandidates():WerewolfPlayer[]{return this.alive().filter(p=>!this.pact.idiots.has(p.id)&&(!this.settings.buildings||this.pact.building.get(p.id)==='farm'));}
  private canVote(p:WerewolfPlayer):boolean {
    if(!p.alive||this.pact.idiots.has(p.id)||this.pact.blockedVotes.has(p.id)||this.pact.building.get(p.id)==='school')return false;
    if(this.mayorElection&&this.settings.buildings&&this.alive().some(p=>this.pact.building.get(p.id)==='farm'))return this.pact.building.get(p.id)==='farm';
    return !this.pact.restrictedVoters||this.round!==this.pact.restrictRound||this.pact.restrictedVoters.has(p.id);
  }
  private canInherit(p:WerewolfPlayer|undefined):boolean{return !!p&&p.alive&&this.powerRole(p)==='maid'&&p.id!==this.pact.pendingExecution&&!this.lovers?.includes(p.id)&&!this.pact.used.has(`maid:${p.id}`);}
  private resetPowers(id:string):void {
    this.pact.used.delete(`judge:${id}`);this.pact.used.add(`fresh:${id}`);this.pact.foxSpent.delete(id);this.pact.elderHits.delete(id);this.pact.personalSeen.delete(id);
    const role=this.players.find(p=>p.id===id)?.role;if(role==='witch'){this.healLeft=true;this.poisonLeft=true;}if(role==='infectwolf')this.pact.used.delete('infection');if(role==='arsonist')this.pact.used.delete('fire');
  }
  private kill(id:string,reason:string):void {
    const p=this.players.find(p=>p.id===id);if(!p?.alive)return;
    p.alive=false;this.pact.deathReasons.set(id,reason);this.pact.deathOrder.push(id);
    if(this.isWolf(p)||p.role==='wildchild'||p.role==='dogwolf')this.pact.wolfDied=true;
    if(this.powerRole(p)==='elder'&&['vote','witch','hunter','barber'].includes(reason)){this.pact.powerless=true;for(const idiot of this.pact.idiots)this.kill(idiot,'elder');}
    if(p.role==='angel'&&this.round<=1&&['vote','wolf','witch'].includes(reason))this.winner='angel';
    if(this.powerRole(p)==='knight'&&reason==='wolf'){const wolf=this.nextWolf(id,-1);if(wolf)this.pact.rusty.set(wolf.id,this.round+1);}
    for(const [child,model]of this.pact.models)if(model===id)this.pact.infected.add(child);
  }
  private executeVerdict(now:number):void {
    const chosen=this.pact.pendingExecution;this.pact.pendingExecution=null;
    if(chosen){const p=this.players.find(p=>p.id===chosen)!;this.kill(chosen,'vote');this.say('vote','La aldea elimina a {name} con {votes} votos.',{name:p.name,votes:this.pact.executionVotes});}
    this.finishDeaths(now,'verdict');
  }
  private buildingAction(actor:WerewolfPlayer,action:Extract<WerewolvesAction,{kind:'building'}>,now:number):void {
    if(!['day','execution'].includes(this.phase))throw new Error('Esa acción no corresponde a este turno.');
    const building=this.pact.building.get(actor.id);if(!building||this.pact.buildingUsed.has(actor.id)&&!['school','bailiff'].includes(building))throw new Error('Esa acción no corresponde a este turno.');
    const target=action.target?this.players.find(p=>p.id===action.target):undefined;
    if(building==='church'){if(!target?.alive)throw new Error('Elige a otra persona viva.');this.rememberRole(actor.id,target.id,target.role!);this.pact.buildingUsed.add(actor.id);}
    else if(building==='healer'){if(!target?.alive||!this.pact.buildingUsed.has(target.id)||!['church','healer','manor','barber'].includes(this.pact.building.get(target.id)??''))throw new Error('Elige a otra persona viva.');this.pact.buildingUsed.delete(target.id);this.pact.buildingUsed.add(actor.id);}
    else if(building==='school'){const targets=action.targets??[];if(targets.length>2||targets.some(id=>!this.alive().some(p=>p.id===id)||!this.pact.building.has(id)))throw new Error('Elige a otra persona viva.');this.pact.blockedVotes=new Set(targets);}
    else if(building==='barber'){if(!target?.alive||target.id===actor.id||!this.pact.building.has(target.id))throw new Error('Elige a otra persona viva.');const wolf=this.isWolf(target);this.kill(target.id,'barber');if(!wolf)this.kill(actor.id,'barber');this.pact.buildingUsed.add(actor.id);this.interrupted={phase:this.phase,step:this.step,remaining:Math.max(0,this.deadline-now)};this.finishDeaths(now,'interrupted');}
    else if(building==='manor'){if(this.phase!=='execution'||!this.pact.pendingExecution)throw new Error('Esa acción no corresponde a este turno.');this.pact.pendingExecution=null;this.pact.buildingUsed.add(actor.id);this.verdict={id:null,tie:false};this.enter('verdict',now);}
    else if(building==='bailiff'){if(!target?.alive||this.pact.building.has(target.id)||!action.choice)throw new Error('Elige a otra persona viva.');const vacant=this.players.find(p=>!p.alive&&this.pact.building.get(p.id)===action.choice);if(!vacant||action.choice==='bailiff')throw new Error('Esa acción no corresponde a este turno.');this.pact.housingOffer.set(target.id,{owner:vacant.id,kind:action.choice as VillageBuilding});}
    else throw new Error('Esa acción no corresponde a este turno.');
  }

  private botDelay(): number { return BOT_DELAY[0] + this.random(BOT_DELAY[1] - BOT_DELAY[0]); }
  private alive(): WerewolfPlayer[] { return this.players.filter((p) => p.alive); }
  private say(icon: LogEntry['icon'], text: string, params?: LogEntry['params']): void { this.log.push(params ? { icon, text, params } : { icon, text }); if (this.log.length > 60) this.log.shift(); }

  private reset(): void {
    this.petMatch.clear();
    this.players = [];
    this.phase = 'lobby';
    this.step = null;
    this.leaderId = null;
    this.deck = [];
    this.log = [];
  }

  private isController(id:string):boolean{return id===(this.controller??(this.authorityId&&this.authorityId!=='0'.repeat(64)?this.authorityId:this.leaderId));}
  private requireLeader(actorId: string): void {
    if (!this.isController(actorId)) throw new Error('Solo quien abrió la mesa puede hacer eso.');
  }

  private requireAlive(actor: WerewolfPlayer | undefined): WerewolfPlayer {
    if (!actor || !actor.alive) throw new Error('Solo las personas vivas de la partida pueden actuar.');
    return actor;
  }

  private requireTarget(id: string, allowed: (p: WerewolfPlayer) => boolean): void {
    const target = this.players.find((p) => p.id === id);
    if (!target || !target.alive || !allowed(target)) throw new Error('Elige a otra persona viva.');
  }
}

function cleanName(name: string): string { return String(name ?? '').trim().slice(0, 24) || 'Vecino'; }
function cleanColor(color: string): string { return /^#[0-9a-fA-F]{6}$/.test(String(color)) ? color : '#c96f53'; }
