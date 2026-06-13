import { aggregate } from '../engine/stats';
import type { Aggregate, MatchRecord, MetricVerdict } from '../engine/stats';

/** Browser-side persistence + console reporting for playtest stats. Keeps the
 * engine recorder pure: localStorage and console live here, not in src/engine. */

const KEY = 'inkborn.matchStats.v1';

function load(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MatchRecord[]) : [];
  } catch {
    return []; // corrupt/blocked storage — start fresh rather than crash the match
  }
}

function save(records: MatchRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    // storage full or unavailable; stats are best-effort, never block play
  }
}

/** Persist a finished match and return the running match count. */
export function recordMatch(record: MatchRecord): number {
  const records = load();
  records.push(record);
  save(records);
  return records.length;
}

export function clearStats(): void {
  localStorage.removeItem(KEY);
}

export function getAggregate(): Aggregate {
  return aggregate(load());
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

function verdictRow(label: string, v: MetricVerdict, render: (n: number) => string, bar: string): string {
  const mark = v.sampleSize === 0 ? '—' : v.pass ? '✓' : '✗';
  return `${mark} ${label.padEnd(22)} ${render(v.value).padStart(6)}  (target ${bar}, n=${v.sampleSize})`;
}

/** Print the running §15 scorecard. Exposed on window.__inkbornStats in dev. */
export function logSummary(): void {
  const a = getAggregate();
  const lines = [
    `📊 Inkborn playtest — ${a.matches} match(es)`,
    verdictRow('median word length', a.medianWordLength, (n) => n.toFixed(1), '≥ 4'),
    verdictRow('whiff rate', a.whiffRate, fmtPct, '< 15%'),
    verdictRow('lower-⚡ win rate', a.lowerEnergyWinRate, fmtPct, '≥ 30%'),
    verdictRow('rumble ink response', a.rumbleInkResponseRate, fmtPct, '≥ 60%'),
    `· median match length ${a.medianMinutes.toFixed(1)} min (target 5–8) · median ${a.medianTurns} turns`,
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

// Dev-only handle so the playtester can inspect/reset between sessions.
if (import.meta.env.DEV) {
  (window as unknown as { __inkbornStats: unknown }).__inkbornStats = {
    summary: logSummary,
    aggregate: getAggregate,
    raw: load,
    clear: clearStats,
  };
}
