/**
 * Doménový model aplikace Stihnu.
 * Časy s hodinami se ukládají jako ISO 8601 (UTC), celodenní data jako 'YYYY-MM-DD' (lokální kalendářní den).
 */

export type ISODateTime = string;
export type DateKey = string; // 'YYYY-MM-DD'

export type AppMode = 'demo' | 'live';
export type ThemePref = 'system' | 'light' | 'dark';

export type DataSource = 'demo' | 'sis' | 'google' | 'ics-file' | 'moodle' | 'parser' | 'ai' | 'manual';

/** Klíč položky pro synchronizaci a mazání: 'event:<id>', 'task:<id>', 'req:<id>', 'sub:<reqId>:<subId>', 'ms:<id>', 'subject:<id>', 'material:<id>'. */
export type LocalKey = string;

export interface LatLng {
  lat: number;
  lng: number;
}

/* ------------------------------------------------------------------ */
/* Budovy a lokace                                                     */
/* ------------------------------------------------------------------ */

export interface ArrivalStop {
  /** Přesný název zastávky v PID (shodný s Golemio `stop_name`). */
  name: string;
  /** Pěší přesun ze zastávky do budovy (min). */
  walkMinutes: number;
  /** Informativní seznam linek (zobrazení v UI). */
  lines?: string[];
}

export interface Building {
  id: string;
  name: string;
  /** Tvar pro větu „Seminář … začíná“ – např. „na Hollaru“, „v Jinonicích“. */
  locative?: string;
  faculty?: string;
  address: string;
  coords: LatLng;
  /** Klíčová slova, podle kterých se budova pozná v lokaci z rozvrhu. */
  aliases: string[];
  /** Regulární výraz pro kódy místností, např. `^H\d{1,4}[A-Z]?$` pro Hollar. */
  roomPattern?: string;
  arrivalStops: ArrivalStop[];
  custom?: boolean;
}

export interface LocationPreset {
  id: string;
  label: string;
  coords: LatLng;
}

export interface OriginPref {
  source: 'gps' | 'preset' | 'custom';
  presetId: string;
  custom?: { label: string; coords: LatLng };
}

/** Zastávka, ze které chce student vyjíždět (místo automatického výběru nejbližší). */
export interface OriginStopPref {
  /** Název skupiny zastávek v PID (shodný s Golemio `stop_name`). */
  name: string;
  coords: LatLng;
}

/* ------------------------------------------------------------------ */
/* Studium                                                             */
/* ------------------------------------------------------------------ */

export type SubjectColor =
  | 'indigo'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'violet'
  | 'teal'
  | 'orange'
  | 'fuchsia'
  | 'lime';

/** Sylabus a údaje o předmětu (import ze SISu přes záložku nebo vložený text). */
export interface SubjectSyllabus {
  annotation?: string;
  aim?: string;
  syllabus?: string;
  requirements?: string;
  literature?: string;
  guarantor?: string;
  teachers?: string[];
  credits?: number;
  completion?: string;
  semester?: string;
  language?: string;
  url?: string;
  importedAt: ISODateTime;
}

export interface Subject {
  id: string;
  code?: string;
  name: string;
  color: SubjectColor;
  teacher?: string;
  credits?: number;
  completion?: string;
  source: DataSource;
  moodleCourseId?: number;
  moodleCourseUrl?: string;
  syllabus?: SubjectSyllabus;
  /** Složka předmětu na Google Disku (Stihnu/<předmět>). */
  driveFolderId?: string;
  createdAt: ISODateTime;
  updatedAt?: ISODateTime;
  /** Položka ukázkových dat (posouvá se s dneškem, lze hromadně smazat). */
  demo?: boolean;
}

export type EventKind = 'lecture' | 'seminar' | 'exam' | 'consultation' | 'personal' | 'other';

/** Odkaz na událost v Google Kalendáři (zrcadlo nebo propojená osobní událost). */
export interface GoogleEventRef {
  calendarId: string;
  eventId: string;
  calendarName?: string;
  /** Barva kalendáře (hex) pro zobrazení. */
  color?: string;
  htmlLink?: string;
  /** Zrcadlo z kalendáře, do kterého aplikace nezapisuje. */
  readOnly?: boolean;
}

export interface ScheduleEvent {
  id: string;
  uid?: string;
  subjectId?: string;
  title: string;
  kind: EventKind;
  start: ISODateTime;
  end: ISODateTime;
  /** Původní text lokace (např. „H212 (Hollar)“). */
  location?: string;
  room?: string;
  buildingId?: string;
  teacher?: string;
  source: DataSource;
  /** Vlastní poznámka (osobní události). */
  notes?: string;
  /** Celodenní událost (start = lokální půlnoc, end = půlnoc dne PO posledním dni). */
  allDay?: boolean;
  google?: GoogleEventRef;
  /** Ze kterého iCal zdroje událost pochází (víc kalendářů najednou). */
  icsSourceId?: string;
  /** Výuka online – žádná cesta MHD. */
  online?: boolean;
  createdAt?: ISODateTime;
  updatedAt?: ISODateTime;
  demo?: boolean;
}

export type RequirementType = 'assignment' | 'test' | 'presentation' | 'exam' | 'attendance' | 'other';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Requirement {
  id: string;
  subjectId: string;
  title: string;
  type: RequirementType;
  /** Váha v hodnocení předmětu v %. 0 = neuvedeno (počítá se výchozí vahou). */
  weight: number;
  deadline?: ISODateTime;
  /** Ruční označení „hotovo“ (rozhoduje, pokud povinnost nemá podúkoly). */
  done: boolean;
  subtasks: Subtask[];
  description?: string;
  source: DataSource;
  /** Stabilní identifikátor z externího zdroje, např. `moodle:assign:123`. */
  externalId?: string;
  url?: string;
  /** Známka z Moodlu, např. „50 / 50“. */
  grade?: string;
  gradePercent?: number;
  createdAt: ISODateTime;
  updatedAt?: ISODateTime;
  demo?: boolean;
}

/** Vlastní úkol (to-do) – zapisuje ho student, nebo přichází z Google Úkolů. */
export interface Task {
  id: string;
  title: string;
  notes?: string;
  /** 'YYYY-MM-DD' (celý den) nebo ISO čas. */
  due?: string;
  done: boolean;
  completedAt?: ISODateTime;
  subjectId?: string;
  /** Předmět odhadla aplikace sama (student ho může jedním klepnutím změnit). */
  subjectAuto?: boolean;
  /** Předměty, které student u úkolu odmítl ('*' = úkol nepatří k žádnému předmětu). */
  notSubjects?: string[];
  priority?: 'high';
  source: DataSource;
  externalId?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  demo?: boolean;
}

export type MaterialKind = 'moodle-file' | 'moodle-link' | 'upload' | 'note' | 'link';

export interface Material {
  id: string;
  subjectId: string;
  requirementId?: string;
  kind: MaterialKind;
  title: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  /** U Moodle souborů `fileurl` BEZ tokenu (token se připojuje až při otevření). */
  url?: string;
  /** Sekce kurzu v Moodlu (např. „Týden 4 – Kódovací kniha“). */
  section?: string;
  /** Klíč souboru v IndexedDB (vlastní nahrané soubory). */
  blobKey?: string;
  markdown?: string;
  externalId?: string;
  /** Kopie v Google Disku (export materiálů). */
  driveFileId?: string;
  driveUrl?: string;
  /** Verze (updatedAt), která je na Disku. */
  driveSyncedAt?: ISODateTime;
  source: DataSource;
  createdAt: ISODateTime;
  updatedAt?: ISODateTime;
  demo?: boolean;
}

export type MilestoneCategory =
  | 'semester'
  | 'teaching'
  | 'exam-period'
  | 'enrollment'
  | 'holiday'
  | 'deadline'
  | 'assessment'
  | 'event';

export interface Milestone {
  id: string;
  title: string;
  category: MilestoneCategory;
  /** Celodenní: 'YYYY-MM-DD'; s časem: ISO. */
  start: string;
  /** Konec včetně (celodenní) nebo ISO čas konce. */
  end?: string;
  allDay: boolean;
  subjectId?: string;
  source: DataSource;
  note?: string;
  /** Demo položky, které se posouvají s aktuálním dnem. */
  relative?: boolean;
  updatedAt?: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Nastavení a integrace                                               */
/* ------------------------------------------------------------------ */

export interface MoodleConnection {
  baseUrl: string;
  token: string;
  userId?: number;
  siteName?: string;
  fullName?: string;
  lastSync?: ISODateTime;
  stats?: { courses: number; requirements: number; materials: number };
}

/** Odebíraný kalendář iCal: rozvrh SIS, kalendář Moodlu (termíny), cokoliv dalšího. */
export type IcsSourceKind = 'sis' | 'moodle' | 'google' | 'other';

export interface IcsSource {
  id: string;
  kind: IcsSourceKind;
  url: string;
  label?: string;
  /** Průběžně obnovovat na pozadí. */
  autoRefresh: boolean;
  lastSync?: ISODateTime;
  lastError?: string;
  /** Počet načtených položek (událostí nebo termínů). */
  itemCount?: number;
}

export type WalkSpeed = 'slow' | 'normal' | 'fast';

export type SyncDirection = 'two-way' | 'push' | 'pull';
export type ConflictPolicy = 'newest' | 'app' | 'google';

export interface GoogleCalendarSyncSettings {
  enabled: boolean;
  /** 'dedicated' = vlastní kalendář „Stihnu“, 'primary' = hlavní kalendář, jinak ID kalendáře. */
  target: string;
  direction: SyncDirection;
  push: { classes: boolean; exams: boolean; deadlines: boolean; milestones: boolean; personal: boolean };
  /** Další kalendáře, jejichž události se zobrazí v aplikaci (jen ke čtení). */
  pullCalendars: string[];
  /** Kolik týdnů dopředu zapisovat výuku. */
  rangeWeeks: number;
  remindersClasses: number[];
  remindersDeadlines: number[];
  /** Barvy předmětů → barvy událostí v Google Kalendáři. */
  colors: boolean;
}

export interface GoogleTasksSyncSettings {
  enabled: boolean;
  /** 'dedicated' = seznam „Stihnu“, '@default' = Moje úkoly, jinak ID seznamu. */
  target: string;
  direction: SyncDirection;
  push: { personal: boolean; requirements: boolean; subtasks: boolean };
  /** Další seznamy úkolů, které se obousměrně synchronizují. */
  pullLists: string[];
  /** Hotové úkoly z Googlu starší než N dní se do aplikace nestahují. */
  keepCompletedDays: number;
}

export interface GoogleDriveSyncSettings {
  enabled: boolean;
  /** Synchronizace všech dat aplikace mezi zařízeními (skrytá složka aplikace na Disku). */
  syncState: boolean;
  /** Poznámky a nahrané soubory jako soubory ve složce na Disku. */
  exportMaterials: boolean;
  folderName: string;
}

export interface GoogleSyncSettings {
  enabled: boolean;
  /** OAuth Client ID (typ Webová aplikace). Prázdné = z proměnné VITE_GOOGLE_CLIENT_ID nebo ze serveru. */
  clientId: string;
  auto: boolean;
  intervalMinutes: number;
  conflict: ConflictPolicy;
  /** Promítat smazání do druhé strany ('mirror'), nebo jen rozpojit ('keep'). */
  deletions: 'mirror' | 'keep';
  calendar: GoogleCalendarSyncSettings;
  tasks: GoogleTasksSyncSettings;
  drive: GoogleDriveSyncSettings;
}

export interface WeatherSettings {
  enabled: boolean;
  /** Jak snadno je studentovi zima: posouvá doporučení oblečení. */
  feel: 'cold' | 'normal' | 'warm';
}

export type AccentTheme = 'les' | 'vltava' | 'terakota' | 'svitani' | 'levandule' | 'grafit' | 'vlastni';

/** Vzhled aplikace – barvy, fotky, pozadí, úvodní animace. */
export interface AppearanceSettings {
  accent: AccentTheme;
  /** Vlastní barva (hex) pro motiv 'vlastni'. */
  customAccent?: string;
  /** Fotka v hlavičce: 'auto' = podle denní doby, jinak ID fotky z galerie nebo 'upload'. */
  heroPhoto: string;
  /** Pozadí aplikace: papír, fotka z galerie, nebo vlastní fotka. */
  background: 'paper' | 'photo' | 'upload';
  backgroundPhoto?: string;
  /** Jak moc je pozadí ztlumené (0–1). */
  backgroundDim?: number;
  /** Úvodní animace při otevření. */
  intro: boolean;
  /** Písmo nadpisů. */
  headingFont: 'serif' | 'sans';
}

/** Odpočet do důležitého okamžiku (zkouškové, odjezd domů, narozeniny…). */
export interface Countdown {
  id: string;
  title: string;
  /** 'YYYY-MM-DD' (celý den) nebo ISO čas. */
  at: string;
  emoji?: string;
  /** Odkud vznikl (ruční, z termínu nebo z harmonogramu). */
  sourceKey?: string;
  createdAt: string;
}

export interface Settings {
  mode: AppMode;
  theme: ThemePref;
  golemioApiKey: string;
  googleMapsApiKey: string;
  googleOAuthClientId: string;
  anthropicApiKey: string;
  moodle: MoodleConnection | null;
  icsSources: IcsSource[];
  /** Jak často obnovovat odebírané kalendáře (h). */
  icsRefreshHours: number;
  /** Rezerva před začátkem výuky (min) – „být v učebně 5 min předem“. */
  bufferMinutes: number;
  /** Čas na odchod z domu (obout, zamknout, schody) – přičítá se před cestou na zastávku. */
  prepMinutes: number;
  /** Další rezerva, aby byl spoj „doporučený“ (min). */
  /** Nejpozději v budově před začátkem (poslední možný spoj), min. */
  minMarginMinutes?: number;
  comfortMinutes: number;
  walkSpeed: WalkSpeed;
  accessibleOnly: boolean;
  preferAirConditioned: boolean;
  origin: Record<AppMode, OriginPref>;
  /** Preferovaná výchozí zastávka (null = automaticky nejbližší). */
  originStop: Record<AppMode, OriginStopPref | null>;
  /** V demo režimu běží simulované hodiny (vždy začínají ve 13:05). */
  demoClock: boolean;
  /** Výchozí připomínky v minutách před termínem. */
  reminders: number[];
  buildings: Building[];
  /** Ruční mapování textu lokace → budova. */
  locationAliases: Record<string, string>;
  google: GoogleSyncSettings;
  /** Hudba na učení a na cestu (odkaz na playlist Spotify – bez přihlášení). */
  music?: { url: string; title?: string } | null;
  /** Upozornění v telefonu/prohlížeči, kdy vyrazit. */
  notifyLeave?: boolean;
  /** Upozornění na termíny (večer předem a 3 hodiny před). */
  notifyDeadlines?: boolean;
  /** Propojení s Googlem pro další zařízení (zapečetěné serverem a svázané s účtem). */
  googleSealed?: string;
  weather: WeatherSettings;
  /** Jméno pro pozdrav (jinak z Moodlu / Googlu). */
  displayName: string;
  /** Dvojice předmětů, o kterých student řekl, že jsou různé ('idA|idB'). */
  distinctSubjects?: string[];
  /** Oblíbené menzy (první je hlavní); prázdné = ještě nevybráno. */
  menza?: { canteenIds: number[]; asked?: boolean };
  /** Odpovědi o studiu – podle nich se z harmonogramu skryjí termíny, které se studenta netýkají. */
  studyProfile?: import('./lib/relevance').StudyProfile;
  /** Termíny harmonogramu ručně skryté / ručně zobrazené. */
  hiddenMilestones?: string[];
  shownMilestones?: string[];
  /** Vlastní odpočty (na hlavní stránce). */
  countdowns?: Countdown[];
  appearance?: AppearanceSettings;
  /** Fakulta / škola studenta (lib/campus) – „moje budovy“ na mapě a v plánovači. */
  faculty?: string | null;
}

/* ------------------------------------------------------------------ */
/* Synchronizace                                                       */
/* ------------------------------------------------------------------ */

export type SyncService = 'calendar' | 'tasks' | 'drive';

/** Vazba lokální položky na položku v Googlu. */
export interface SyncLink {
  service: 'calendar' | 'tasks';
  /** ID kalendáře / seznamu úkolů. */
  container: string;
  remoteId: string;
  /** Kdo položku založil: aplikace, nebo Google (import). */
  origin: 'app' | 'google';
  /** Otisk lokální podoby při poslední synchronizaci. */
  localHash: string;
  /** Otisk vzdálené podoby při poslední synchronizaci. */
  remoteHash: string;
  remoteUpdated?: string;
  /** Začátek položky (kontroly omezujeme na stažený časový rozsah). */
  at?: string;
  syncedAt: ISODateTime;
}

export interface SyncCounts {
  created: number;
  updated: number;
  deleted: number;
}

export interface SyncReport {
  at: ISODateTime;
  ok: boolean;
  durationMs: number;
  services: SyncService[];
  pushed: SyncCounts;
  pulled: SyncCounts;
  conflicts: number;
  errors: string[];
  notes: string[];
}

export interface GoogleAccount {
  email?: string;
  name?: string;
  picture?: string;
}

/** Stav synchronizace s Googlem (zvlášť pro Sandbox a Live). */
export interface GoogleSyncState {
  account?: GoogleAccount;
  connectedAt?: ISODateTime;
  /** Udělená oprávnění (scopes). */
  scopes: string[];
  lastSync?: ISODateTime;
  /** Klíč: '<služba>|<LocalKey>', např. 'calendar|event:evt_1', 'tasks|req:req_2'. */
  links: Record<string, SyncLink>;
  containers: {
    calendarId?: string;
    taskListId?: string;
    driveFolderId?: string;
    driveStateFileId?: string;
    subjectFolders?: Record<string, string>;
  };
  /** Položky, které uživatel z Googlu odebral – znovu je nezapisujeme ('calendar|req:…', 'tasks|remote:…'). */
  excluded: string[];
  /** Kdy jsme naposledy sloučili stav z Disku. */
  driveStateSyncedAt?: ISODateTime;
  history: SyncReport[];
}

/* ------------------------------------------------------------------ */
/* Doprava                                                             */
/* ------------------------------------------------------------------ */

export type TransitMode = 'tram' | 'metro' | 'bus' | 'train' | 'ferry' | 'trolleybus' | 'funicular';

/** Úsek chůze podle plánovače (délka v m, ulice, výslovný směr). */
export interface WalkStep {
  distance: number;
  street?: string;
  dir?: string;
}

export interface WalkLeg {
  kind: 'walk';
  minutes: number;
  from: string;
  to: string;
  distanceMeters?: number;
  /** Tvar pěší trasy (pro navigaci a mapu). */
  path?: LatLng[];
  steps?: WalkStep[];
  fromCoords?: LatLng;
  toCoords?: LatLng;
}

export interface RideLeg {
  kind: 'ride';
  line: string;
  mode: TransitMode;
  headsign: string;
  fromStop: string;
  toStop: string;
  platform?: string;
  scheduledDeparture: ISODateTime;
  predictedDeparture: ISODateTime;
  scheduledArrival: ISODateTime;
  predictedArrival: ISODateTime;
  /** null = spoj nemá online polohu (jede se podle jízdního řádu). */
  delaySeconds: number | null;
  isAirConditioned: boolean | null;
  isWheelchairAccessible: boolean | null;
  tripId?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  stopCount?: number;
  color?: string;
  /** Přesná poloha nástupiště, kde se nastupuje / vystupuje (pro mapu a chůzi). */
  fromCoords?: LatLng;
  toCoords?: LatLng;
  /** Nástupiště, kde se vystupuje. */
  toPlatform?: string;
  /** Tvar trasy vozidla a zastávky po cestě (pro navigaci). */
  path?: LatLng[];
  via?: { name: string; coords: LatLng; at?: string }[];
}

export type JourneyLeg = WalkLeg | RideLeg;

export type ItinerarySource = 'demo' | 'golemio' | 'google' | 'estimate' | 'transitous';

export interface Itinerary {
  id: string;
  legs: JourneyLeg[];
  /** Kdy vyrazit z aktuální polohy. */
  leaveAt: ISODateTime;
  /** Odjezd prvního spoje (predikovaný, včetně zpoždění). */
  departAt: ISODateTime;
  /** Příchod do budovy. */
  arriveAt: ISODateTime;
  walkToStopMinutes: number;
  walkFromStopMinutes: number;
  transfers: number;
  source: ItinerarySource;
  /** Rezervy navíc k jízdnímu řádu (min): odchod z domu, být na zastávce dřív, metro z ulice na nástupiště a zpět. */
  margins?: { prep: number; early: number; entry: number; exit: number };
}

export interface TransitResult {
  itineraries: Itinerary[];
  source: ItinerarySource | 'none';
  fetchedAt: ISODateTime;
  warnings: string[];
  originLabel: string;
}
