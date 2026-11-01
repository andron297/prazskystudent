/**
 * Doménový model aplikace Stihnu.
 * Časy s hodinami se ukládají jako ISO 8601 (UTC), celodenní data jako 'YYYY-MM-DD' (lokální kalendářní den).
 */

export type ISODateTime = string;
export type DateKey = string; // 'YYYY-MM-DD'

export type AppMode = 'demo' | 'live';
export type ThemePref = 'system' | 'light' | 'dark';

export type DataSource = 'demo' | 'sis' | 'google' | 'ics-file' | 'moodle' | 'parser' | 'ai' | 'manual';

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
  createdAt: ISODateTime;
  /** Položka ukázkových dat (posouvá se s dneškem, lze hromadně smazat). */
  demo?: boolean;
}

export type EventKind = 'lecture' | 'seminar' | 'exam' | 'consultation' | 'other';

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
  createdAt: ISODateTime;
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

export interface IcsConnection {
  url: string;
  label?: string;
  lastSync?: ISODateTime;
  eventCount?: number;
}

export type WalkSpeed = 'slow' | 'normal' | 'fast';

export interface Settings {
  mode: AppMode;
  theme: ThemePref;
  golemioApiKey: string;
  googleMapsApiKey: string;
  googleOAuthClientId: string;
  anthropicApiKey: string;
  moodle: MoodleConnection | null;
  ics: IcsConnection | null;
  /** Rezerva před začátkem výuky (min) – „být v učebně 5 min předem“. */
  bufferMinutes: number;
  /** Další rezerva, aby byl spoj „doporučený“ (min). */
  comfortMinutes: number;
  walkSpeed: WalkSpeed;
  accessibleOnly: boolean;
  preferAirConditioned: boolean;
  origin: Record<AppMode, OriginPref>;
  /** V demo režimu běží simulované hodiny (vždy začínají ve 13:05). */
  demoClock: boolean;
  /** Výchozí připomínky v minutách před termínem. */
  reminders: number[];
  buildings: Building[];
  /** Ruční mapování textu lokace → budova. */
  locationAliases: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* Doprava                                                             */
/* ------------------------------------------------------------------ */

export type TransitMode = 'tram' | 'metro' | 'bus' | 'train' | 'ferry' | 'trolleybus' | 'funicular';

export interface WalkLeg {
  kind: 'walk';
  minutes: number;
  from: string;
  to: string;
  distanceMeters?: number;
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
}

export type JourneyLeg = WalkLeg | RideLeg;

export type ItinerarySource = 'demo' | 'golemio' | 'google' | 'estimate';

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
}

export interface TransitResult {
  itineraries: Itinerary[];
  source: ItinerarySource | 'none';
  fetchedAt: ISODateTime;
  warnings: string[];
  originLabel: string;
}
