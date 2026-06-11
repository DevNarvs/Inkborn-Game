# CLAUDE.md — Inkborn Rumble

## What this project is

A mobile-first web game: real-time turn-based 3v3 PvP battler (Axie Infinity V1-style card combat) where energy is earned by swiping words on a 4x4 letter grid (Bookworm-style). Dark fantasy aesthetic.

**Full design spec lives in `docs/PRD.md` — read it before making gameplay changes. The PRD is the source of truth for game rules.**

## Current phase: PHASE 0 — Core loop prototype

Build ONLY: local single-player vs. a dumb bot. No backend, no Convex, no multiplayer, no accounts, no art (placeholder shapes/colors only).

Phase 0 build order:
1. Grid generator — 4x4, weighted letter frequency, minimum 4 vowels guaranteed
2. Swipe input — connect adjacent tiles (8 directions), no tile reuse within a word
3. Dictionary — ENABLE word list loaded into a trie; validate word + adjacency path
4. Energy/Ink scoring (formulas below)
5. Three hardcoded units: Vesper, Mawgrim, Pyra (stats/cards in PRD §5–6, §10)
6. Card phase UI — hand, energy display, card-to-unit assignment
7. Resolution engine — SPD order, shields first, damage formula below
8. Dumb bot — picks a random average-scoring word and random valid card plays

## Tech stack

- Vite + TypeScript + Phaser 3 (game scenes)
- Plain TS modules for game logic — **keep game rules engine pure and framework-free** (it moves to Convex server functions in Phase 1, so no Phaser imports inside rules logic)
- No backend in Phase 0. Bot and match state are local.

## Locked game rules (do not change without updating PRD)

### Word phase
- 4x4 grid, one word per turn, 20s timer, min 3 letters
- Energy by length: 3L=2, 4L=3, 5L=4, 6L=5, 7+=6
- Energy cap 8/turn; score beyond cap converts to Ink 1:1
- Rare letters (J, Q, X, Z): +1 Ink each
- 6+ letter word: +1 card draw this turn
- Whiff (no valid word): pity 1 Energy
- Energy bank carries over, max 10. Ink pool shared per team, cap 15
- Every 3rd turn = Rumble Round: 15s, multiple words, ALL score → Ink

### Combat
- 3v3, formation slots 1-2-3, auto-target frontmost
- Targeting overrides: Snipe (backmost), Sweep (all), Taunt (forces onto taunter)
- Damage: `(card DMG + attacker ATK) × triangle (±15%) − defender DEF`, floor = 10% of pre-DEF damage always lands
- Element card effects scale: `base + attacker SKILL`
- Resolution: shields apply, then attacks in descending SPD; KO'd unit's unresolved cards fizzle; end-of-turn DoTs tick
- Ink Tide: from turn 13, escalating chip damage to all units (10/20/30...)

### Cards & deck
- Every card has BOTH a DMG and SHD value
- Costs: 1⚡ standard/light, 2⚡ heavy, 0⚡ rare (max 2-3 in pool)
- 24-card deck (3 units × 4 cards × 2 copies), opening hand 6, draw 3/turn, hand cap 9, reshuffle discard when empty
- Ultimates are NOT in the deck — playable whenever team Ink ≥ cost
- Keyword set is LOCKED (10): Burn, Chill, Regen, Drain, Curse, Purge, Pierce, Taunt, Snipe, Sweep. Do not invent new keywords.

### Units
- Unit = Type (base stats + passive) + Class (stat mods + 1 card) + Weapon (2 cards: light/heavy) + Element (1 card + triangle) + Inkwell (ultimate)
- Stats: HP, SPD, ATK, DEF, SKILL — deterministic: `Type base + Class modifier`
- Triangles: Blaze▶Wild▶Frost▶Blaze · Void▶Radiant▶Doom▶Void · cross-triangle neutral

## Code conventions

- TypeScript strict mode
- Game rules in `src/engine/` (pure, unit-testable, zero Phaser imports)
- Phaser scenes in `src/scenes/`, UI components in `src/ui/`
- Unit/card data as typed JSON-like consts in `src/data/`
- Write unit tests for: grid generation constraints, adjacency path validation, scoring math, damage math. Vitest.
- Mobile-first: design for ~390px width, touch input primary

## What NOT to do in Phase 0

- No Convex/backend code yet (but keep engine pure so it ports cleanly)
- No breeding, no economy, no matchmaking, no accounts
- No AI-generated art integration — colored rectangles and text labels only
- No new keywords, elements, classes, or stat types
- Do not tune locked formulas without flagging it as a PRD change
