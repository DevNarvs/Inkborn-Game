# Phase 0 — Core Loop Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Local single-player Inkborn Rumble vs. a dumb bot — swipe-word energy, card phase, SPD-ordered resolution — with 3 hardcoded units and placeholder rectangle art.

**Architecture:** Pure framework-free rules engine in `src/engine/` (ports to Convex in Phase 1), typed game data in `src/data/`, Phaser 3 scenes in `src/scenes/` + view classes in `src/ui/` that only render engine state and forward input. One seeded RNG (`mulberry32`) drives all randomness for determinism and testability.

**Tech Stack:** Vite 8 + TypeScript strict, Phaser 3.90, Vitest 4. Dictionary: ENABLE list (public domain) in `public/enable1.txt`, loaded into a trie at boot.

**Commit convention:** Per session convention, commits happen when the user asks (no per-task commit steps).

**Source-of-truth note:** All formulas/values below restate `inkborn-rumble-prd-v2.md` (§4–§10) and CLAUDE.md. Anything the PRD leaves open is marked **[P0-DESIGN]** (placeholder design, tune later — PRD Open Items #2/#6).

---

## Locked design decisions (resolving PRD open points for Phase 0)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Mirror match:** both sides run Vesper/Mawgrim/Pyra, formation slot 1=Mawgrim (front), 2=Pyra, 3=Vesper | Phase 0 has exactly 3 units; tank-front is the PRD's canonical formation logic |
| D2 | **Taunt activates in the shield step** (start of resolution), not when the card's action fires | Makes Iron Stance reliable regardless of SPD; matches "shields apply → attacks execute" |
| D3 | **Burn ticks end of the turn it's applied** (2 ticks: T, T+1); **Curse skips the applied turn** (ticks T+1, T+2 per PRD "end of next 2 turns") | PRD §7.2 step 4 + Withering Curse text |
| D4 | **DoTs and Ink Tide hit HP directly** (ignore shields — shields are per-turn combat absorption only) | Shields conceptually expire at combat end; keeps anti-stall un-turtle-able |
| D5 | **SPD tie → lower current HP acts first; still tied → seeded RNG** | PRD specifies first tiebreak; RNG fallback is deterministic via seed |
| D6 | **Ultimate resolves at its unit's SPD slot, before that unit's deck cards** | Predictable; "ultimate = the unit's opening move" |
| D7 | **Energy earned beyond per-turn cap 8 → Ink; bank clamps at 10 (excess lost); Ink clamps at 15 (excess lost)** | Per CLAUDE.md. (Single word max 6 energy, so turn-cap overflow is currently unreachable — implemented + tested anyway since Drain/stipends may change that) |
| D8 | **Empty rumble round (0 words) → pity 1 Energy** | Whiff rule generalized |
| D9 | **6+ letter words during Rumble also grant +1 draw each** | CLAUDE.md states the draw rider without phase restriction |
| D10 | **Swipe UX: release stages a valid word (replaceable); ✓ button or timer-end locks it in.** Rumble: release submits immediately | One-word turns shouldn't be lost to accidental release |
| D11 | **Both-teams-wiped-same-turn = draw** | Simplest consistent rule |
| D12 | **Shields do not stack across turns** — reset to 0 at resolution start before applying this turn's SHD | Axie-style per-turn shields |

## [P0-DESIGN] Card pool (12 unique cards ×2 copies = 24-card deck)

Stats: `Type base + Class modifier` (PRD §5.3):

| Unit | Type+Class | HP | SPD | ATK | DEF | SKILL | Element | Passive |
|---|---|---|---|---|---|---|---|---|
| Vesper | Human Ranger | 440 | 15 | 18 | 5 | 10 | Void | Versatile: +1 draw every 3rd turn |
| Mawgrim | Beast Armored | 700 | 5 | 7 | 27 | 4 | Doom | Predator: +20% DMG vs targets <50% HP |
| Pyra | Demon Brawler | 400 | 14 | 26 | 6 | 3 | Blaze | Bloodthirst: heal 60 HP on landing a KO |

| id | Unit | Name | Tag | Cost | DMG | SHD | Effect |
|---|---|---|---|---|---|---|---|
| `quick_slash` | Vesper | Quick Slash | weapon | 1 | 55 | 10 | +20 DMG if another card already played on this unit this turn (PRD) |
| `phantom_slash` | Vesper | Phantom Slash | weapon | 2 | 100 | 15 | KO refund: +1⚡ (PRD) |
| `hunters_mark` | Vesper | Hunter's Mark | class | 1 | 45 | 5 | **Snipe** |
| `ink_siphon` | Vesper | Ink Siphon | element | 1 | 40 | 5 | **Drain** 1 Energy (PRD; SHD 5 added) |
| `bone_crunch` | Mawgrim | Bone Crunch | weapon | 1 | 50 | 20 | — |
| `devouring_bite` | Mawgrim | Devouring Bite | weapon | 2 | 95 | 20 | — |
| `iron_stance` | Mawgrim | Iron Stance | class | 1 | 0 | 80 | **Taunt** this turn (PRD) |
| `withering_curse` | Mawgrim | Withering Curse | element | 2 | 30 | 10 | **Curse:** 25+SKILL at end of next 2 turns (PRD; SHD 10 added) |
| `cinder_jab` | Pyra | Cinder Jab | weapon | 1 | 60 | 5 | — |
| `meteor_hook` | Pyra | Meteor Hook | weapon | 2 | 105 | 10 | — |
| `scrap` | Pyra | Scrap | class | **0** | 25 | 5 | — (one of the rare 0⚡ cards: deliberately weak) |
| `ignite` | Pyra | Ignite | element | 1 | 35 | 5 | **Burn:** 20+SKILL at end of this + next turn |

Ultimates (outside deck, team Ink-gated):

| id | Unit | Name | Ink | Effect |
|---|---|---|---|---|
| `voidrend` | Vesper | VOIDREND | 10 | DMG 220 single target + **Drain** 2 Ink (PRD) |
| `doomfall` | Mawgrim | DOOMFALL | 9 | **Sweep** DMG 25 + **Curse** 30+SKILL (2 ticks) on each enemy |
| `inferno_breaker` | Pyra | INFERNO BREAKER | 7 | DMG 150 + **Burn** 25+SKILL (2 ticks) |

Keywords used in Phase 0: Burn, Curse, Drain, Taunt, Snipe, Sweep (+Pierce implemented in the damage path since it's one branch; Chill/Regen/Purge deferred to Phase 2 — no Phase-0 card uses them; the `Keyword` type still lists all 10 locked keywords).

## File structure

```
src/engine/rng.ts          mulberry32 seeded PRNG + weightedPick
src/engine/types.ts        all shared engine types (zero imports)
src/engine/grid.ts         4x4 weighted grid gen, ≥4 vowels
src/engine/path.ts         adjacency, path validation, DFS traceability, solver
src/engine/trie.ts         Trie (has/hasPrefix), fromWords
src/engine/scoring.ts      energy/ink/draw math, caps
src/engine/damage.ts       triangle + damage formula
src/engine/deck.ts         24-card deck, draw/reshuffle/hand cap
src/engine/resolve.ts      turn resolution → BattleEvent log
src/engine/match.ts        match state machine (word→card→resolve loop)
src/engine/bot.ts          dumb bot (word pick + random valid plays)
src/data/letterWeights.ts  Scrabble distribution
src/data/units.ts          type/class tables + 3 unit defs
src/data/cards.ts          12 cards + 3 ultimates
src/scenes/BootScene.ts    fetch dictionary, build trie, start match
src/scenes/MatchScene.ts   phase orchestration, timers
src/ui/GridView.ts         tile grid + swipe input
src/ui/TeamView.ts         6 unit plates (HP/shield bars)
src/ui/HandView.ts         card hand + assignment input
src/ui/HudView.ts          energy/ink/turn/timer/banners
src/ui/ResolutionPlayer.ts battle event playback
src/main.ts                Phaser config (390×844, Scale.FIT)
tests: src/engine/*.test.ts (Vitest, co-located)
public/enable1.txt         ENABLE word list
```

UI files have **zero game rules** — they render state and emit player intents.

---

### Task 1: Test infra + RNG + engine types

**Files:** Modify `package.json` (scripts). Create `src/engine/rng.ts`, `src/engine/types.ts`, `src/engine/rng.test.ts`.

- [x] Add scripts `"test": "vitest run"`, `"test:watch": "vitest"`
- [x] Failing test `rng.test.ts`: same seed → same first 5 floats; different seeds differ; floats in [0,1); `weightedPick` returns only listed items and respects 0-weight exclusion; run → FAIL (module missing)
- [x] Implement `mulberry32(seed): () => number`, `weightedPick<T>(rng, items: [T, number][]): T`
- [x] `types.ts`: `ElementId/TypeId/ClassId/Stats/Keyword(all 10)/CardTag/CardEffect` (discriminated union: `comboDmg|koRefund|snipe|sweep|taunt|pierce|drainEnergy|drainInk|curse|burn`), `CardDef{id,name,unitId,tag,cost,dmg,shd,text,effects[]}`, `UltimateDef{id,name,unitId,inkCost,dmg,text,effects[]}`, `PassiveId('versatile'|'predator'|'bloodthirst')`, `UnitDef{id,name,type,class,element,weaponName,stats,passive}`, `CardInstance{iid,defId}`, `UnitState{defId,side,slot,hp,maxHp,shield,alive,taunting,dots:Dot[]}`, `Dot{kind:'burn'|'curse',perTick,remaining,delay}`, `BattleEvent` union (`shield|ultimate|card|damage|heal|ko|fizzle|dot|drain|inkTide|matchEnd`), `SidePlan{unitPlays:{unitIndex,cards:CardInstance[]}[],ultimates:number[]}`
- [x] Run tests → PASS

### Task 2: Grid generator

**Files:** Create `src/data/letterWeights.ts`, `src/engine/grid.ts`, `src/engine/grid.test.ts`.

- [x] `letterWeights.ts`: Scrabble counts `E12 A9 I9 O8 N6 R6 T6 L4 S4 U4 D4 G3 B2 C2 M2 P2 F2 H2 V2 W2 Y2 K1 J1 X1 Q1 Z1`
- [x] Failing tests: returns exactly 16 single chars A–Z; ≥4 vowels (run 200 seeds); same seed → identical grid; over 300 grids letter E appears ≥5× more than Z (weight sanity, generous margin)
- [x] Implement `generateGrid(rng): string[]` — 16 weighted picks; while vowels<4, replace a random non-vowel tile with a weighted vowel
- [x] Tests PASS

### Task 3: Adjacency + path validation + solver

**Files:** Create `src/engine/path.ts`, `src/engine/path.test.ts`.

- [x] Failing tests on a hand-planted grid (e.g. row-major `C A T S / R E I N / L O D K / Q U X Z`): `neighborsOf(5)` = 8 cells, corners = 3; `isValidPath` rejects non-adjacent jumps, tile reuse, len<3; `wordFromPath` spells correctly; `isWordTraceable` true for plantable words (CAT, REIN diag cases), false for words needing reuse; `findAllWords` with tiny trie finds exactly the plantable subset, no dupes
- [x] Implement: precomputed `NEIGHBORS: number[][]` for 4x4; `isValidPath(path)`, `wordFromPath(grid, path)`, `isWordTraceable(grid, word)` DFS w/ visited; `findAllWords(grid, trie, min=3)` DFS + `hasPrefix` pruning + Set dedup
- [x] Tests PASS

### Task 4: Trie + ENABLE dictionary

**Files:** Create `src/engine/trie.ts`, `src/engine/trie.test.ts`. Download `public/enable1.txt`.

- [x] Failing tests: insert/has exact words only (no prefixes-as-words), `hasPrefix` true for prefixes, case-insensitive (normalize uppercase), `Trie.fromWords`
- [x] Implement Trie (child maps, `end` flag)
- [x] `curl -L https://norvig.com/ngrams/enable1.txt -o public/enable1.txt` (~1.9MB, ~172k words); integration test reads it via `fs`, asserts >150k words, has('RUMBLE'), !has('XQZJW')
- [x] Tests PASS

### Task 5: Scoring

**Files:** Create `src/engine/scoring.ts`, `src/engine/scoring.test.ts`.

- [x] Failing tests: length→energy (3→2,4→3,5→4,6→5,7→6,12→6); rare letters: JAZZ → +3 Ink; 6+ → extraDraw 1; whiff(null) → {energy:1,ink:0,draw:0}; rumble: ['QUEEN','CAT'] → energy 0, ink 4+1(Q)+2 = 7, drought rule D8: [] → energy 1; turn-cap: synthetic value 9 → energy 8 ink 1 (D7); `applyEarnings` clamps bank 10 / ink 15
- [x] Implement `wordEnergyValue`, `countRareLetters` (J/Q/X/Z occurrences), `scoreStandardWord(word|null): {energy,ink,extraDraw}`, `scoreRumbleWords(words[]): same`, `applyEarnings({energy,ink}, gain): clamped`
- [x] Tests PASS

### Task 6: Damage math

**Files:** Create `src/engine/damage.ts`, `src/engine/damage.test.ts`.

- [x] Failing tests: triangle — blaze▶wild▶frost▶blaze and void▶radiant▶doom▶void each ×1.15 forward / ×0.85 reverse; same or cross-triangle = 1.0; **PRD canon case:** dmg100 atk18 ×1.15 def10 → 126; floor case: dmg10 atk0 def100 → 1 (10% of pre-DEF); predator multiplier case: ×1.2 applied pre-DEF
- [x] Implement `triangleModifier(att,def)`, `computeDamage({cardDmg,atk,attEl,defEl,def,multiplier=1})` = `round(max(pre−def, 0.1·pre))`, `pre=(cardDmg+atk)·triangle·multiplier`
- [x] Tests PASS

### Task 7: Unit + card data

**Files:** Create `src/data/units.ts`, `src/data/cards.ts`, `src/data/data.test.ts`.

- [x] `units.ts`: TYPE_BASES + CLASS_MODS tables from PRD §5.3 verbatim; `makeStats(type,class)`; export `UNITS` (table above) with derived stats
- [x] `cards.ts`: 12 `CardDef` + 3 `UltimateDef` per [P0-DESIGN] table
- [x] Tests: derived stats equal the table above (Vesper 440/15/18/5/10 etc.); every card has dmg≥0 AND shd≥0 fields; cost ∈ {0,1,2}; exactly one 0-cost card; each unit has exactly 4 cards (1 class, 2 weapon, 1 element) + 1 ultimate
- [x] Tests PASS

### Task 8: Deck operations

**Files:** Create `src/engine/deck.ts`, `src/engine/deck.test.ts`.

- [x] Failing tests: `buildDeck` = 24 instances (each of 12 defs ×2, unique iids), seeded shuffle deterministic; `drawCards(zones,n,rng)`: moves top n; empty deck → reshuffles discard (event order preserved by reshuffle then draw); hand cap 9 → excess drawn cards go to discard; opening deal = 6
- [x] Implement `buildDeck(rng)`, `drawCards(zones, n, rng): {zones, drawn, discardedOverflow}`, `discardPlayed(zones, iids)`
- [x] Tests PASS

### Task 9: Resolution engine

**Files:** Create `src/engine/resolve.ts`, `src/engine/resolve.test.ts`.

`resolveTurn(combat: CombatState, plans: [SidePlan, SidePlan], turn: number, rng): {combat, events: BattleEvent[]}` where `CombatState = {units: UnitState[6 (3/side)], energy:[n,n], ink:[n,n]}`.

Order of operations (PRD §7.2 + decisions D2–D6, D12):
1. Reset shields → apply SHD sum of every played card/ult per unit; activate Taunts (D2)
2. Queue: for each unit with plays → (ultimate first (D6), then cards in assigned order); sort units desc SPD, tie lower HP, tie rng (D5)
3. Execute: skip+fizzle if actor dead; target = taunter ?? (snipe→backmost | sweep→all | frontmost living); damage via Task 6 (predator check at hit time); shield absorbs (unless pierce), remainder HP; apply effects (drainEnergy/drainInk steal into own pool, clamped; burn/curse push Dot with delay 0/1); KO → bloodthirst heal, koRefund energy, fizzle target's remaining queue
4. End of turn: tick dots (delay>0 → decrement delay, no tick); Ink Tide if turn ≥13: 10·(turn−12) to all living (D4)
5. Win/draw check (D11) → `matchEnd` event

- [x] Failing tests (each its own scenario with hand-built CombatState): shields absorb before HP; pierce ignores shield; SPD order Vesper(15)→Pyra(14)→Mawgrim(5); tie→lower HP first; KO fizzles remaining cards of dead unit; taunt redirects frontmost-default attack; snipe hits backmost; sweep hits all 3; drainEnergy steals 1 (capped); curse 0 dmg this turn, ticks T+1/T+2 at 25+SKILL; burn ticks same turn at 20+SKILL; koRefund +1⚡ on kill; bloodthirst +60 on kill; predator ×1.2 under 50%; ink tide turn 13 = 10 / turn 15 = 30; double-wipe → draw
- [x] Implement `resolveTurn` (+ helpers `pickTargets`, `applyHit`, `tickEndOfTurn`)
- [x] Tests PASS

### Task 10: Match controller

**Files:** Create `src/engine/match.ts`, `src/engine/match.test.ts`.

- [x] Failing tests: new match → turn 1, hands 6/6, energy 0, ink 0, mirror units full HP; turn 3 flagged rumble (3,6,9…); `submitWord` validates dictionary+traceable (invalid → whiff); scoring applied w/ caps; draws: 3/turn from turn 2 (+1 on 6+ word, +1 Versatile every 3rd turn for Vesper's owner); `submitPlan` rejects unaffordable energy/ink and cards not in hand, accepts legal, deducts costs; `resolveTurn` advances turn, moves played to discard, generates next grid (same grid object for both sides — fairness anchor); match end sets winner
- [x] Implement `Match` class: `constructor(seed, trie)`, `get state`, `startTurn(): {turn, isRumble, grid}`, `submitWords(side, words: {word, path?}[])`, `bothSubmitted → applyWordPhase()`, `submitPlan(side, plan)`, `resolve(): BattleEvent[]`, `isOver/winner`
- [x] Tests PASS

### Task 11: Bot

**Files:** Create `src/engine/bot.ts`, `src/engine/bot.test.ts`.

- [x] Failing tests: bot word is always dictionary-valid + traceable on the given grid; picks from middle scoring band (assert chosen word's energy value within [min,max] of 25–75th percentile band over fixed seed); rumble → 2–4 words; card plan always affordable + cards from hand; with 0 energy plays only 0-cost
- [x] Implement `botPickWords(grid, trie, isRumble, rng): string[]` — `findAllWords`, sort by `wordEnergyValue`, slice 25–75th percentile, random pick (rumble: up to 4 distinct picks); `botPlanCards(state, side, rng): SidePlan` — shuffled hand, each card 70% attempt → random living own unit while affordable; ultimate if ink ≥ cost (50%)
- [x] Tests PASS

### Task 12: Phaser shell

**Files:** Modify `src/main.ts`. Create `src/scenes/BootScene.ts`. Delete `src/counter.ts`, `src/typescript.svg` usage; replace `src/style.css` body with dark bg + no margin.

- [x] `main.ts`: `new Phaser.Game({type: AUTO, width: 390, height: 844, backgroundColor: '#0d0a14', scale: {mode: FIT, autoCenter: CENTER_BOTH}, scene: [BootScene, MatchScene]})`
- [x] `BootScene`: "INKBORN RUMBLE / loading lexicon…" text → `fetch('/enable1.txt')` → `Trie.fromWords` → `scene.start('Match', {trie, seed: Date.now()})`
- [x] Verify: `npm run build` passes; dev server shows boot → match scene

### Task 13: Word phase UI

**Files:** Create `src/ui/GridView.ts`, `src/ui/HudView.ts`, `src/scenes/MatchScene.ts` (word-phase portion). Layout: enemy plates y≈70, own plates y≈190, grid 4×4 of 82px tiles centered x, y≈300–630, staged word + ✓ y≈660, energy/ink/turn bar y≈720.

- [x] `GridView`: 16 tile containers (rounded rect + letter + tile index); pointerdown starts trace, pointermove extends when entering adjacent unused tile (8-dir, backtrack = pop), line connecting selected; live color: gold when `trie.has(word)` ≥3 else gray; pointerup → emit `trace(word, path)`
- [x] `MatchScene` word phase: 20s countdown bar (15s rumble + "RUMBLE ROUND — all words → INK" banner); valid trace stages word (shows "CAT → 2⚡"); ✓ or timeout locks → bot picks → show both words briefly → card phase. Rumble: traces submit instantly, list scored words
- [x] `HudView`: turn #, phase label, ⚡ bank /10, 🜲 ink /15 both sides, timer bar
- [x] Manual verify in dev server (mouse drag = touch path)

### Task 14: Card phase UI

**Files:** Create `src/ui/HandView.ts`, `src/ui/TeamView.ts`, MatchScene card-phase portion.

- [x] `TeamView`: 6 plates (rect, element-colored border, name, HP bar w/ number, shield chip, slot #; dead → 50% alpha ✕); assigned-card pips under own plates
- [x] `HandView`: bottom strip, hand cards as 64×88 rects (name, cost ⚡, DMG/SHD, tag color); tap card → highlight, tap own living unit → assign (energy deducted in preview), tap assigned pip → unassign; ultimate buttons (cost in Ink) above hand, enabled when ink ≥ cost; unaffordable cards grayed
- [x] MatchScene card phase: 25s timer; "Lock In" button or timeout → freeze plan → `botPlanCards` → resolution
- [x] Manual verify: full word→card cycle vs bot in dev server

### Task 15: Resolution playback + game over + loop

**Files:** Create `src/ui/ResolutionPlayer.ts`; MatchScene resolution + game-over portions.

- [x] `ResolutionPlayer`: consume `BattleEvent[]` sequentially (~500ms/step): shield events pulse plate + show value; card/ult events show "Vesper ▶ Quick Slash"; damage events float red number over target (gray "BLOCKED n" for shielded part), HP bars tween; dot/inkTide ticks labeled; KO flashes ✕; then `done`
- [x] Game over overlay: VICTORY / DEFEAT / DRAW + "Play Again" (new seed, scene restart)
- [x] Loop: after playback → discard played → next `startTurn` → word phase; Ink Tide warning banner from turn 12
- [x] Manual verify: play 2+ full matches incl. a rumble turn and (via long match or temp seed) an Ink Tide tick

### Task 16: Final verification

- [x] `npm test` → all suites green, 0 failures
- [x] `npm run build` → exit 0
- [x] `npx tsc --noEmit` strict clean
- [x] Play a full match in the dev server; confirm: same-grid fairness (bot uses same grid), energy/ink numbers match hand-checked scoring for at least one turn, a rumble round, one ultimate fired, match end reachable
- [x] Screenshot word phase + card phase + resolution for the user

## Self-review notes

- Spec coverage: CLAUDE.md Phase-0 items 1–8 → Tasks 2,3+13,4,5,7,14,9,11 ✓; PRD §4 caps/pity/rumble → Task 5; §5.3 stats → Task 7; §6.3 formula+canon example → Task 6; §7.2 order → Task 9; §8 deck economy → Task 8/10; ultimates → Tasks 7/9/14; Ink Tide → Task 9/15.
- Out of scope confirmed: no Convex, no accounts, no art, no new keywords (Chill/Regen/Purge typed but unused), no matchmaking.
- Type names used consistently: `CardDef/UltimateDef/UnitDef/UnitState/CombatState/SidePlan/BattleEvent/Dot` defined Task 1, consumed Tasks 7–15.
