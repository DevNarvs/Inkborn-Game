# Product Requirements Document — v2
## Working Title: **Inkborn Rumble**

**Version:** 2.0 — Post-planning draft (supersedes v1 entirely)
**Author:** DevNarvs
**Date:** June 11, 2026
**Status:** Gameplay design locked · Pre-production
**Platform:** Mobile-first web (HTML5), playable in any browser

> Name candidates still open: *Inkborn Rumble*, *WordBound*, *Rumble Lexica*, *Voidscript*. Final name TBD.

---

## 1. Vision

A real-time, turn-based 3v3 PvP battler for mobile browsers that fuses **Axie Infinity V1-style** team/card combat with **Bookworm-style** word building. Energy is never given — it is *earned* by swiping words on a letter grid. Your vocabulary is your mana pool; your ultimate charges on the overflow.

**One-liner:** *Spell words to power your beasts. Axie V1 × Bookworm, dark-fantasy edition.*

**Aesthetic direction:** dark fantasy — shadowy humanoid champions and ink-wrought beasts, purple/void accents. (Reference: AI-generated dark assassin concept, see §13.)

---

## 2. Design Pillars

1. **Words are power.** Every point of Energy and Ink is earned through word-building skill. Nothing is free — even "light" attacks cost Energy.
2. **Fair by design.** Both players always receive the *same* letter grid each turn. Skill, not RNG, decides the resource gap.
3. **Predictable rhythm.** Rumble Rounds arrive on a fixed schedule. Players plan around known beats instead of guessing.
4. **Readable depth.** Deterministic stat math, transparent damage formulas, a small keyword set. A new player understands the loop in one match.
5. **Short sessions.** Target match length: 5–8 minutes.
6. **Team-level balance.** Individual units may be sharp specialists (glass cannons, pure walls); balance lives in drafting a complementary team of 3.

---

## 3. Core Gameplay Loop

```
MATCH START — pick 3 units from roster, arrange formation (slots 1-2-3)
   │
   ▼
┌─────────────────────── REPEAT PER TURN ────────────────────────┐
│ 1. WORD PHASE (20s, simultaneous)                              │
│    Both players see the SAME 4x4 letter grid                   │
│    → Swipe ONE word → gain Energy (overflow & rares → Ink)     │
│    Every 3rd turn: RUMBLE ROUND instead (15s, multi-word → Ink)│
│                                                                │
│ 2. CARD PHASE (25s, simultaneous)                              │
│    Draw cards → assign to units, spending Energy               │
│    Ultimates playable anytime Ink ≥ cost                       │
│                                                                │
│ 3. RESOLUTION (auto, ~5–10s)                                   │
│    Shields apply → attacks execute in SPD order                │
└────────────────────────────────────────────────────────────────┘
   │
   ▼
WIN: all 3 enemy units defeated
ANTI-STALL: "Ink Tide" — after turn 12, escalating chip damage to all
```

---

## 4. Word System

### 4.1 The Grid

- **4x4 grid, 16 tiles.** Form a word by swiping through **adjacent** tiles (8 directions). A tile cannot be reused within one word.
- **Identical grid for both players**, server-seeded per turn. The fairness anchor of the whole game.
- **Generation rules:** weighted letter frequency (Scrabble-style distribution), minimum **4 vowels guaranteed** per grid so no turn is bricked.
- Minimum word length: **3 letters.**

### 4.2 Standard Word Phase

20 seconds. Submit **one** word.

| Word length | Energy |
|---|---|
| 3 letters | 2 |
| 4 letters | 3 |
| 5 letters | 4 |
| 6 letters | 5 |
| 7+ letters | 6 |

| Rule | Value |
|---|---|
| Energy cap per turn | **8** — score beyond cap converts to **Ink** 1:1 |
| Energy bank (carryover) | max **10** |
| Rare letters (J, Q, X, Z) | **+1 Ink** each, on top of word score |
| 6+ letter word | **+1 card draw** this turn |
| No valid word (whiff) | pity floor: **1 Energy** |

The gradient is the game: a whiffed word = 1 light card; an average word (4–5 letters) = 2–3 actions; a monster word = a full turn plus Ink in the tank.

### 4.3 Rumble Round (every 3rd turn — turns 3, 6, 9, 12…)

Replaces the standard word phase on a **fixed, predictable schedule** so players can plan their Ink economy ("save the ult for the post-rumble burst").

- **15 seconds. Submit as many valid words as you can.**
- **All word score converts to Ink** (not Energy). Rare-letter bonuses apply.
- Card phase that turn runs on **banked Energy** — saving Energy before a known Rumble turn is intentional strategy.

> ⚠️ **Playtest watchpoint:** Energy drought on Rumble turns may feel harsh for new players. If so, mitigation = small flat Energy stipend (e.g., +2) on Rumble turns. Decide from playtest data, not theory.

### 4.4 Ink (Ultimate Resource)

- **Shared team pool.** Sources: energy overflow, rare letters, Rumble Rounds.
- Cap: **15** (forces spending decisions; tunable).
- Spent on **Ultimates** (§9). Vulnerable to the **Drain** keyword (Void).

### 4.5 Validation & Anti-cheat (hard requirements)

- Grid is generated **server-side**, revealed at phase start.
- Word validation is **server-side** and two-part: (1) dictionary membership, (2) **adjacency-path check** (DFS) proving the word is actually traceable on that grid. Client-side trie exists only for instant UI feedback.
- One final submission per phase, server-enforced timers.
- Dictionary: **ENABLE word list** (public domain). English at launch.

---

## 5. Unit System

### 5.1 Attribute Model

A unit is defined by five attributes. Each contributes something specific — no overlaps:

| Attribute | Contributes | Card? |
|---|---|---|
| **Type** | Base stats + **passive trait** | No |
| **Class** | Stat modifiers + 1 playstyle card | 1 card |
| **Weapon** | Light + heavy attack (scales with ATK) | 2 cards |
| **Element** | 1 effect card (scales with SKILL) + **damage triangle** | 1 card |
| **Inkwell** | Ultimate (Ink-gated, outside the deck) | Ultimate |

**Every unit = 4 deck cards + 1 ultimate + 1 passive.** Kit balance is *not* guaranteed per unit — sharp specialists are intended; the player balances at team level.

**Future-proofing:** when breeding returns (deferred — §16), these attributes are the genes.

### 5.2 Taxonomy

**Types (6):** Human · Humanoid (elves, orcs, oni — non-human bipeds) · Beast · Demon · Angel · Undead
**Classes (5):** Ranger · Brawler · Armored · Caster · Trickster
**Elements (6):** Blaze · Frost · Wild · Void · Doom · Radiant

**Damage triangles** (±15% modifier, applied by **unit element** vs defender element; cross-triangle = neutral):

```
Triangle A (Elemental):   Blaze ▶ Wild ▶ Frost ▶ Blaze
Triangle B (Dark Cosmic): Void ▶ Radiant ▶ Doom ▶ Void
```

### 5.3 Stats — deterministic, layered

`Final stats = Type base + Class modifier` — no RNG, fully transparent to players.

Each stat has exactly one job:

| Stat | Job |
|---|---|
| **HP** | Life pool |
| **SPD** | Resolution turn order (ties: lower current HP acts first) |
| **ATK** | Added to **Weapon card** damage |
| **SKILL** | Scales **Element card** effect potency (DoTs, heals, drains) |
| **DEF** | Flat damage reduction · **floor: 10% of damage always lands** |

**Type base stats** *(illustrative — tune in balancing spreadsheet)*:

| Type | HP | SPD | ATK | DEF | SKILL |
|---|---|---|---|---|---|
| Human | 500 | 10 | 10 | 10 | 10 |
| Humanoid | 480 | 12 | 11 | 9 | 10 |
| Beast | 620 | 8 | 12 | 12 | 4 |
| Demon | 440 | 12 | 16 | 6 | 8 |
| Angel | 460 | 9 | 6 | 12 | 16 |
| Undead | 560 | 6 | 9 | 14 | 8 |

**Class modifiers** *(illustrative)*:

| Class | SPD | ATK | DEF | SKILL | HP |
|---|---|---|---|---|---|
| Ranger | +5 | +8 | −5 | 0 | −60 |
| Brawler | +2 | +10 | 0 | −5 | −40 |
| Armored | −3 | −5 | +15 | 0 | +80 |
| Caster | 0 | −6 | −3 | +12 | −20 |
| Trickster | +6 | 0 | −4 | +5 | −60 |

**Balance rules (non-negotiable):**
- Every Class modifier set must be **net-zero-ish** — every plus pays with a minus. No objectively-best class.
- Every Type base must land on a **roughly equal total power budget** — different distributions, same total.

**Type passives** *(illustrative — finalize in tuning)*:

| Type | Passive |
|---|---|
| Human | Versatile — +1 card draw every 3rd turn (synergizes with Rumble rhythm) |
| Humanoid | Cunning — +1 Ink whenever this unit's owner plays a 5+ letter word |
| Beast | Predator — +20% DMG vs targets below 50% HP |
| Demon | Bloodthirst — heal 60 HP on landing a KO |
| Angel | Last Light — first fatal blow each match leaves it at 1 HP (once) |
| Undead | Deathless — takes half damage from Burn and Curse |

---

## 6. Card System

### 6.1 Card Anatomy

Every card carries **both** a DMG and SHD value (Axie's dual-stat design): playing an attack card still grants its small shield; playing a defensive card still chips. Every card is a real decision.

| Field | Example |
|---|---|
| Name | Phantom Slash |
| Cost | 2⚡ |
| DMG | 100 |
| SHD | 15 |
| Effect | "KO refund: +1⚡" |
| Tag | Weapon / Class / Element |

### 6.2 Cost Bands

| Cost | Who | Rule |
|---|---|---|
| **1⚡** | Light attacks, most Class/Element cards | The standard. **Nothing meaningful is free** — protects the "words are power" pillar |
| **2⚡** | Heavy attacks, big effects | — |
| **0⚡** | **Rare.** ~2–3 cards in the entire pool | Deliberately weak or conditional |

### 6.3 Damage Math (fully transparent)

```
final damage = (card DMG + attacker ATK) × triangle modifier (±15%) − defender DEF
minimum: 10% of pre-DEF damage always lands
Element card effects = effect base + attacker SKILL
```

Example: Vesper (ATK 18, Void) plays Phantom Slash (DMG 100) into a Radiant unit (DEF 10): (100+18) × 1.15 − 10 = **126**.

### 6.4 Keyword Discipline

**Locked set — no keyword #11 until the MVP ships.**

Element-owned (one each — element identity lives here):

| Element | Keyword |
|---|---|
| Blaze | **Burn** — damage over time |
| Frost | **Chill** — reduces SPD |
| Wild | **Regen** — heal over time |
| Void | **Drain** — steal Energy/Ink |
| Doom | **Curse** — delayed burst damage |
| Radiant | **Purge** — heal + cleanse debuffs |

Universal: **Pierce** (ignores shield) · **Taunt** (forces targeting onto this unit)
Targeting: **Snipe** (hits backmost) · **Sweep** (hits all three; expensive, weak per target)

### 6.5 Sample Cards

> **Dual Daggers** (weapon)
> ⚔️ Quick Slash — 1⚡ · DMG 55 · SHD 10 · *+20 DMG if another card was played on this unit this turn*
> ⚔️ Phantom Slash — 2⚡ · DMG 100 · SHD 15 · *KO refund: +1⚡*

> **Longbow** (weapon)
> 🏹 Snap Shot — 1⚡ · DMG 50 · SHD 5
> 🏹 Deadeye — 2⚡ · DMG 95 · **Snipe**

> **Iron Stance** — Class (Armored) · 1⚡ · DMG 0 · SHD 80 · **Taunt** this turn
> **Ink Siphon** — Element (Void) · 1⚡ · DMG 40 · **Drain** 1 Energy
> **Withering Curse** — Element (Doom) · 2⚡ · DMG 30 · **Curse:** 25 + SKILL damage at end of next 2 turns

---

## 7. Combat

### 7.1 Formation & Targeting

- Pre-match, arrange your 3 units in **slots 1–2–3** (front to back).
- **Auto-targeting:** all attacks hit the **frontmost living enemy** by default.
- Overrides: **Snipe** (backmost) · **Sweep** (all) · **Taunt** (forces attacks onto the taunter).
- The metagame: tank in front, squishies behind — countered by Snipe, re-countered by Taunt timing.

### 7.2 Resolution

1. All shields from played cards apply.
2. Attacks execute in descending **SPD** order (Chill effects included). A unit's multiple cards resolve in assigned order.
3. A KO'd unit's unresolved cards fizzle.
4. End-of-turn effects tick (Burn, Curse, Regen).

### 7.3 Win & Anti-stall

- **Win:** eliminate all 3 enemy units.
- **Ink Tide:** from turn 13 onward, every unit takes escalating chip damage at end of turn (10 / 20 / 30 / …). No infinite turtling; word system untouched.

---

## 8. Deck & Turn Economy

| Rule | Value |
|---|---|
| Deck | **24 cards** — 3 units × 4 cards × 2 copies (exact Axie parity) |
| Opening hand | 6 (no extra draw on turn 1) |
| Draw | 3 per turn (+1 on a 6+ letter word) |
| Hand cap | 9 — excess discarded |
| Deck empty | reshuffle discard pile |
| Card assignment | cards are assigned to specific units; both players lock in simultaneously; picks hidden until resolution |
| Turn timers | 20s word (15s rumble) + 25s card phase, server-enforced |

Timeout = auto-skip (pity Energy, no cards). Two consecutive timeouts = forfeit.

---

## 9. Ultimates (Inkwell)

- **Outside the deck** — always playable in the card phase when team Ink ≥ cost (hero-power style). You earned the Ink at the grid; you never "fail to draw" your ultimate.
- Cost range: **6 Ink (light) — 12 Ink (heavy)**, costs are part of unit identity.
- One ultimate per unit, themed to its Element.

**Example:** VOIDREND (Vesper) — 10 Ink · massive single-target damage + **Drain 2 Ink**.

> **Open design item:** the remaining ultimate designs (target: one archetype per Element for the MVP roster). To be designed during Phase 0–1 prototyping.

---

## 10. MVP Roster & Scope

**No breeding in MVP.** Units are a **preset roster of 12** — fighting-game character select, pick 3 before each match. Mix of humanoid champions and beasts per the chosen direction.

**Draft roster** *(combos and names tunable; coverage: all 6 Elements ×2, all Types and Classes represented)*:

| # | Unit | Type | Class | Weapon | Element |
|---|---|---|---|---|---|
| 1 | Vesper | Human | Ranger | Dual Daggers | Void |
| 2 | Umbra | Demon | Trickster | Scythe | Void |
| 3 | Pyra | Demon | Brawler | Flame Gauntlets | Blaze |
| 4 | Ignis | Beast (drake) | Caster | Firebreath | Blaze |
| 5 | Morvane | Undead | Caster | Grimoire | Frost |
| 6 | Lupos | Beast (wolf) | Ranger | Fangs | Frost |
| 7 | Thornak | Humanoid (orc) | Brawler | Greataxe | Wild |
| 8 | Sylva | Humanoid (dryad) | Caster | Living Vines | Wild |
| 9 | Seraphiel | Angel | Armored | Warhammer & Aegis | Radiant |
| 10 | Aurelius | Human | Brawler | Blessed Fists | Radiant |
| 11 | Mawgrim | Beast | Armored | Crushing Maw | Doom |
| 12 | Nyxa | Humanoid (elf) | Trickster | Cursed Fans | Doom |

---

## 11. Multiplayer Architecture

- **Mode:** real-time 1v1, simple FIFO matchmaking queue at launch → MMR when population supports it.
- **Server-authoritative everything:** grid generation, word + path validation, timers, battle resolution. Clients render; they never decide.
- **Reconnection:** 60-second grace window to rejoin a live match (mobile browsers lose focus constantly — this is a launch requirement, not a nice-to-have).

**Convex schema sketch:**

```
players     { name, mmr, createdAt }
units       { rosterId, type, class, weapon, element, stats, passive, ultId }
matches     { p1, p2, state, turnNumber, seed, winner }
turns       { matchId, turnNumber, grid, p1Word(s), p2Word(s),
              p1Energy, p2Energy, p1Ink, p2Ink, p1Cards[], p2Cards[], resolution }
dictionary  { word } (indexed)
```

Turn timeouts enforced via Convex **scheduled functions**. Live state sync is free: Convex queries auto-subscribe — when the resolution mutation writes, both clients re-render. No WebSocket plumbing.

---

## 12. Tech Stack (all free tier)

| Layer | Tech | Notes |
|---|---|---|
| Game client | **Phaser 3** + TypeScript | Grid swipe input, battle scene |
| UI shell | React | Lobby, character select, match history |
| Backend / realtime / DB | **Convex** | 1M function calls/mo, no project pausing, built-in reactivity |
| Hosting | **Vercel** | 100GB bandwidth/mo |
| Dictionary | ENABLE list (public domain) | In Convex table + client trie |
| Art | Free AI generation (Perchance / SEELE AI) | See §13 |

---

## 13. Art Direction & Pipeline

- **Style:** dark fantasy — ink-black palettes, purple/void glow accents, painted-anime character art. Reference: the dark assassin concept (Vesper's visual ancestor).
- **Because the roster is preset (no breeding), each unit is ONE full AI-generated sprite** — no layered part system needed for MVP. Layered parts return only if/when breeding does.
- Per unit: 1 idle sprite minimum; attack pose as stretch. 12 units total.
- Locked style-prompt template for consistency, e.g.:
  *"dark fantasy game character, [description], painted anime style, dramatic lighting, purple accent glow, full body, facing right, transparent background"*
- Fallback if AI consistency fails: silhouette/vector placeholders — gameplay validation does not require final art.

---

## 14. Roadmap

| Phase | Scope | Target |
|---|---|---|
| **0 — Loop prototype** | Local vs. dumb bot. 3 hardcoded units, swipe grid, Energy/Ink math, card phase, resolution. Placeholder art. | 2 weeks |
| **1 — Realtime PvP** | Convex matchmaking, live 1v1, server validation (dictionary + path), timers, reconnection. | +2 weeks |
| **2 — Full roster** | 12 units, ultimates, character select, formation UI, AI art pass, Rumble Rounds, Ink Tide. | +3 weeks |
| **3 — Retention layer** | Leaderboard, match history, daily quests, cosmetic polish. Evaluate future layers (§16). | +2 weeks |

**Phase 0 is the whole bet.** If swipe-word → Energy → cards isn't fun against a bot with rectangle sprites, nothing downstream matters. Build it ugly, play 50 matches, then decide.

---

## 15. Success Metrics (prototype phase)

- **Fun signal:** ≥70% of playtesters start a second match unprompted
- **Match length:** median 5–8 minutes
- **Word health:** median word ≥4 letters; pity-floor turns <15%
- **Skill expression:** Energy differential correlates with winning, but the lower-Energy player still wins ≥30% (deck/team skill matters)
- **Rumble check:** Ink spent within 2 turns of a Rumble Round ≥60% (the rhythm is being played, not ignored)
- **Tech:** turn resolution round-trip <500ms on Convex free tier

---

## 16. Future Layers (explicitly deferred — not MVP)

1. **Breeding** — the attribute system is the gene system; preset roster becomes breedable population later.
2. **Type synergy bonuses** — TFT-style team traits (e.g., 2+ Beasts = bonus).
3. **Grid-interaction cards** — element cards that touch the opponent's letter grid (Doom locks a tile, Frost shaves timer). Unique but a balance minefield; prototype after core ships.
4. **Hot Letters** — per-turn glowing bonus letters.
5. **Tagalog/Taglish dictionary mode** — PH-market differentiator.
6. **Monetization** — nothing until retention proves itself. Never sell power.

---

## 17. Open Items

1. Final game name
2. Remaining ultimate designs (one archetype per Element)
3. Type passive final list (current set is illustrative)
4. Stat & cost tuning spreadsheet (budget math per §5.3 rules)
5. Rumble-turn Energy drought — playtest watchpoint (§4.3)
6. Card pool full definition (~8 weapons × 2, 5 class cards, 6 element cards)
