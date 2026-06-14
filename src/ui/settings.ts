/** Player-facing, no-backend settings (localStorage). Kept out of src/engine
 * so the rules stay pure: these only pace/scale the UI, never the math. */

export interface Settings {
  /** Word-phase timer length in seconds; rumble derives from it. */
  wordSeconds: number;
  /** Resolution playback speed multiplier (1 = normal, 2 = fast). */
  battleSpeed: number;
}

export const WORD_SECONDS_OPTIONS = [15, 20, 30, 45] as const;
export const BATTLE_SPEED_OPTIONS = [1, 2] as const;

/** Default word time honors the playtester's stated preference (30s). The PRD
 * §timers value (20s) is the "Normal" option; 20 is also the engine constant. */
const DEFAULTS: Settings = { wordSeconds: 30, battleSpeed: 1 };
const KEY = 'inkborn.settings.v1';

let cached: Settings | null = null;

function clampToOptions<T extends number>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export function getSettings(): Settings {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    cached = {
      wordSeconds: clampToOptions(parsed.wordSeconds, WORD_SECONDS_OPTIONS, DEFAULTS.wordSeconds),
      battleSpeed: clampToOptions(parsed.battleSpeed, BATTLE_SPEED_OPTIONS, DEFAULTS.battleSpeed),
    };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached;
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable; keep the in-memory value for this session
  }
  return next;
}

/** Rumble rounds get 5s less than the word phase (PRD: 20s word / 15s rumble). */
export function rumbleSeconds(s: Settings = getSettings()): number {
  return Math.max(10, s.wordSeconds - 5);
}
