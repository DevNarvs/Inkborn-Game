import Phaser from 'phaser';
import { cardDef, ultimateForUnit } from '../data/cards';
import { FORMATION } from '../data/units';
import { botPickWords, botPlanCards } from '../engine/bot';
import {
  CARD_PHASE_SECONDS,
  Match,
  RUMBLE_PHASE_SECONDS,
  WORD_PHASE_SECONDS,
} from '../engine/match';
import type { WordPhaseOutcome } from '../engine/match';
import { mulberry32 } from '../engine/rng';
import type { Rng } from '../engine/rng';
import { countRareLetters, ENERGY_BANK_MAX, INK_MAX, wordEnergyValue } from '../engine/scoring';
import { MatchRecorder } from '../engine/stats';
import { logSummary, recordMatch } from '../ui/statsStore';
import type { Trie } from '../engine/trie';
import type { CardInstance, SidePlan, WordSubmission } from '../engine/types';
import { ensureBattleTextures } from '../ui/battleTextures';
import { GridView } from '../ui/GridView';
import { HandView } from '../ui/HandView';
import { HudView } from '../ui/HudView';
import { ResolutionPlayer } from '../ui/ResolutionPlayer';
import { TeamView } from '../ui/TeamView';
import { Vfx } from '../ui/Vfx';
import { WordModal } from '../ui/WordModal';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, LAYOUT, textStyle } from '../ui/theme';

interface MatchSceneData {
  trie: Trie;
  seed: number;
}

const EMPTY_PLAN: SidePlan = { unitPlays: [], ultimates: [] };

/** Orchestrates one local match vs. the bot. All rules live in the engine;
 * this scene only renders state, collects input, and paces the phases. */
export class MatchScene extends Phaser.Scene {
  private trie!: Trie;
  private seed = 1;
  private match!: Match;
  private botRng!: Rng;

  private team!: TeamView;
  private hud!: HudView;
  private grid!: GridView;
  private hand!: HandView;
  private player!: ResolutionPlayer;
  private modal!: WordModal;
  private info!: Phaser.GameObjects.Text;
  private countdownEvent: Phaser.Time.TimerEvent | null = null;

  private staged: WordSubmission | null = null;
  private rumbleSubs: WordSubmission[] = [];
  private assignments = new Map<number, CardInstance[]>();
  private ultsOn = new Set<number>();
  private phaseLocked = false;
  private recorder!: MatchRecorder;
  private matchStartMs = 0;

  constructor() {
    super('Match');
  }

  init(data: MatchSceneData): void {
    this.trie = data.trie;
    this.seed = data.seed;
    this.staged = null;
    this.rumbleSubs = [];
    this.assignments = new Map();
    this.ultsOn = new Set();
    this.phaseLocked = false;
    this.countdownEvent = null; // scene restart clears clock events; drop the stale handle
  }

  create(): void {
    ensureBattleTextures(this);
    this.match = new Match(this.seed, this.trie);
    this.botRng = mulberry32(this.seed ^ 0x9e3779b9);
    this.recorder = new MatchRecorder(this.seed);
    this.matchStartMs = Date.now();

    const vfx = new Vfx(this);
    this.team = new TeamView(this);
    this.hud = new HudView(this);
    this.grid = new GridView(this, (word) => this.trie.has(word), {
      x0: LAYOUT.gridX0,
      y0: LAYOUT.gridY0,
      tile: LAYOUT.gridTile,
      gap: LAYOUT.gridGap,
    });
    this.hand = new HandView(this);
    this.player = new ResolutionPlayer(this, this.team, vfx);
    this.modal = new WordModal(this);
    this.add.existing(this.team.setDepth(10));
    this.add.existing(this.hud.setDepth(15));
    this.add.existing(this.hand.setDepth(20));
    this.add.existing(this.player.setDepth(20));
    this.add.existing(this.modal.setDepth(30));
    this.add.existing(this.grid.setDepth(32)); // grid swipes above the modal chrome

    this.info = this.add
      .text(GAME_WIDTH / 2, LAYOUT.infoY, '', textStyle(13, COLORS.textDim))
      .setOrigin(0.5, 0);

    this.modal.on('confirm', () => this.lockWord());
    this.grid.on('trace', (word: string, path: number[]) => this.onTrace(word, path));
    this.grid.on('tracechange', (word: string, valid: boolean) => {
      if (this.phaseLocked || word.length === 0) return;
      this.modal.setFeedback(valid ? `${word} ✓` : word, valid ? COLORS.gold : COLORS.textDim);
    });
    this.hand.on('cardTap', (iid: string) => this.onCardTap(iid));
    this.hand.on('ultTap', (slot: number) => this.onUltTap(slot));
    this.hand.on('lock', () => this.lockPlans());

    this.match.startTurn();
    this.enterWordPhase();
  }

  // ── Word phase ─────────────────────────────────────────────────────────────

  private enterWordPhase(): void {
    const s = this.match.state;
    this.phaseLocked = false;
    this.staged = null;
    this.rumbleSubs = [];

    this.team.syncFrom(s.combat);
    for (let slot = 0; slot < 3; slot++) this.team.setAssignedLabel(slot, '');
    this.hud.setTurn(s.turn, s.isRumble);
    this.hud.setPools(s.combat);
    const tideNote = s.turn === 12 ? ' · 🌊 tide next turn!' : s.turn >= 13 ? ' · 🌊' : '';
    this.hud.setPhase((s.isRumble ? 'RUMBLE ROUND' : 'WORD PHASE') + tideNote);

    this.modal.setVisible(true);
    this.modal.reset(s.isRumble);
    this.grid.setVisible(true);
    this.grid.setGrid(s.grid);
    this.hand.setVisible(false);
    this.player.setVisible(false);
    this.info.setText('');

    const seconds = s.isRumble ? RUMBLE_PHASE_SECONDS : WORD_PHASE_SECONDS;
    this.hud.startTimer(seconds, () => this.lockWord());
    this.modal.setCountdown(seconds);
    this.countdownEvent?.remove(false);
    this.countdownEvent = this.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => this.modal.setCountdown(this.hud.secondsLeft()),
    });
  }

  private onTrace(word: string, path: number[]): void {
    if (this.phaseLocked || this.match.state.phase !== 'word') return;
    const valid = word.length >= 3 && this.trie.has(word);

    if (this.match.state.isRumble) {
      if (!valid || this.rumbleSubs.some((sub) => sub.word === word)) {
        this.modal.setFeedback(valid ? `${word} — already used` : `${word} ✗`, COLORS.danger);
        return;
      }
      this.rumbleSubs.push({ word, path });
      const ink = this.rumbleSubs.reduce(
        (sum, sub) => sum + wordEnergyValue(sub.word) + countRareLetters(sub.word),
        0,
      );
      // Show what will actually land after the team ink cap, not the raw score.
      const pool = this.match.state.combat.ink[0];
      const banked = Math.min(pool + ink, INK_MAX) - pool;
      this.modal.setStaged(
        `${this.rumbleSubs.length} word(s)`,
        `→ +${banked}✒ banked${banked < ink ? ' (cap)' : ''}`,
      );
      this.modal.showConfirm(true);
      this.modal.setFeedback(`${word} ✓`, COLORS.gold);
      return;
    }

    if (!valid) {
      this.modal.setFeedback(`${word} ✗ not a word`, COLORS.danger);
      return;
    }
    this.staged = { word, path };
    // Clamp the preview against the bank/ink caps so it shows the real credit.
    const combat = this.match.state.combat;
    const energy = Math.min(combat.energy[0] + wordEnergyValue(word), ENERGY_BANK_MAX) - combat.energy[0];
    const rare = Math.min(combat.ink[0] + countRareLetters(word), INK_MAX) - combat.ink[0];
    const draw = word.length >= 6 ? ' · +1 draw' : '';
    this.modal.setStaged(word, `${energy}⚡${rare > 0 ? ` +${rare}✒` : ''}${draw}`);
    this.modal.showConfirm(true);
    this.modal.setFeedback('Tap ✓ to lock it in, or swipe again');
  }

  private lockWord(): void {
    if (this.phaseLocked || this.match.state.phase !== 'word') return;
    this.phaseLocked = true;
    this.hud.stopTimer();
    this.countdownEvent?.remove(false);
    this.countdownEvent = null;
    this.grid.clearTrace();
    this.grid.setVisible(false);
    this.modal.setVisible(false);

    const s = this.match.state;
    // Earnings apply once both sides submit; snapshot pools first so the
    // summary reports the credit that actually landed after the caps.
    const before = { e: [...s.combat.energy] as const, i: [...s.combat.ink] as const };
    const mine = this.match.submitWords(0, s.isRumble ? this.rumbleSubs : this.staged ? [this.staged] : []);
    const botSubs = botPickWords(s.grid, this.trie, s.isRumble, this.botRng);
    const theirs = this.match.submitWords(1, botSubs); // triggers draws + card phase

    const banked = (out: WordPhaseOutcome, energyBefore: number, inkBefore: number) => ({
      words: out.accepted,
      energyGained: Math.min(energyBefore + out.result.energy, ENERGY_BANK_MAX) - energyBefore,
      inkGained: Math.min(inkBefore + out.result.ink, INK_MAX) - inkBefore,
    });
    this.recorder.recordWords(s.turn, s.isRumble, [
      banked(mine, before.e[0], before.i[0]),
      banked(theirs, before.e[1], before.i[1]),
    ]);

    this.hud.setPools(s.combat);
    this.info.setText(
      `You: ${this.describe(mine, before.e[0], before.i[0])}   ·   Enemy: ${this.describe(theirs, before.e[1], before.i[1])}`,
    );
    this.info.setColor(COLORS.textMain);
    this.time.delayedCall(1700, () => this.enterCardPhase());
  }

  private describe(outcome: WordPhaseOutcome, energyBefore: number, inkBefore: number): string {
    const { accepted, result } = outcome;
    const what =
      accepted.length === 0 ? 'whiff' : accepted.length === 1 ? accepted[0] : `${accepted.length} words`;
    // Report the applied (cap-clamped) credit, not the raw score.
    const energy = Math.min(energyBefore + result.energy, ENERGY_BANK_MAX) - energyBefore;
    const ink = Math.min(inkBefore + result.ink, INK_MAX) - inkBefore;
    const gains: string[] = [];
    if (energy > 0) gains.push(`+${energy}⚡`);
    if (ink > 0) gains.push(`+${ink}✒`);
    if (result.extraDraw > 0) gains.push(`+${result.extraDraw}🂠`);
    return `${what} ${gains.join(' ')}`;
  }

  // ── Card phase ─────────────────────────────────────────────────────────────

  private enterCardPhase(): void {
    this.phaseLocked = false;
    this.assignments.clear();
    this.ultsOn.clear();

    this.hand.setVisible(true);
    this.hud.setPhase('CARD PHASE — tap cards to assign');
    this.info.setText('');

    this.renderHand();
    this.hud.startTimer(CARD_PHASE_SECONDS, () => this.lockPlans());
  }

  private spentEnergy(): number {
    let spent = 0;
    for (const cards of this.assignments.values()) {
      for (const card of cards) spent += cardDef(card.defId).cost;
    }
    return spent;
  }

  private spentInk(): number {
    let spent = 0;
    for (const slot of this.ultsOn) {
      spent += this.ultimateCost(slot);
    }
    return spent;
  }

  private ultimateCost(slot: number): number {
    return ultimateForUnit(FORMATION[slot]).inkCost;
  }

  private renderHand(): void {
    const s = this.match.state;
    const energyLeft = s.combat.energy[0] - this.spentEnergy();
    const inkLeft = s.combat.ink[0] - this.spentInk();
    const assignedIids = new Set<string>();
    for (const cards of this.assignments.values()) {
      for (const card of cards) assignedIids.add(card.iid);
    }
    const deadSlots = new Set<number>();
    for (const unit of s.combat.units) {
      if (unit.side === 0 && !unit.alive) deadSlots.add(unit.slot);
    }

    this.hand.render({
      hand: s.zones[0].hand,
      assignedIids,
      ultsOn: this.ultsOn,
      energyLeft,
      inkLeft,
      deadSlots,
    });
    this.hud.setPools(s.combat, energyLeft, inkLeft);

    for (let slot = 0; slot < 3; slot++) {
      const count = this.assignments.get(slot)?.length ?? 0;
      const ult = this.ultsOn.has(slot) ? ' ULT!' : '';
      this.team.setAssignedLabel(slot, count > 0 || ult ? `${'▮'.repeat(count)}${ult}` : '');
    }
  }

  private onCardTap(iid: string): void {
    if (this.phaseLocked || this.match.state.phase !== 'card') return;

    for (const [slot, cards] of this.assignments) {
      const at = cards.findIndex((c) => c.iid === iid);
      if (at >= 0) {
        cards.splice(at, 1);
        if (cards.length === 0) this.assignments.delete(slot);
        this.renderHand();
        return;
      }
    }

    const s = this.match.state;
    const instance = s.zones[0].hand.find((c) => c.iid === iid);
    if (!instance) return;
    const def = cardDef(instance.defId);
    const slot = FORMATION.indexOf(def.unitId);
    const unit = s.combat.units[slot];
    if (!unit.alive || def.cost > s.combat.energy[0] - this.spentEnergy()) return;
    const queue = this.assignments.get(slot) ?? [];
    queue.push(instance);
    this.assignments.set(slot, queue);
    this.renderHand();
  }

  private onUltTap(slot: number): void {
    if (this.phaseLocked || this.match.state.phase !== 'card') return;
    if (this.ultsOn.has(slot)) {
      this.ultsOn.delete(slot);
    } else if (this.ultimateCost(slot) <= this.match.state.combat.ink[0] - this.spentInk()) {
      this.ultsOn.add(slot);
    }
    this.renderHand();
  }

  private lockPlans(): void {
    if (this.phaseLocked || this.match.state.phase !== 'card') return;
    this.phaseLocked = true;
    this.hud.stopTimer();

    const turn = this.match.state.turn; // capture before resolve advances it
    const plan: SidePlan = {
      unitPlays: [...this.assignments.entries()].map(([unitIndex, cards]) => ({
        unitIndex,
        cards,
      })),
      ultimates: [...this.ultsOn],
    };
    let myInk = 0;
    try {
      this.match.submitPlan(0, plan);
      myInk = this.spentInk();
    } catch {
      this.match.submitPlan(0, EMPTY_PLAN); // UI bug failsafe: never block the match
    }
    const botPlan = botPlanCards(this.match.state.zones[1].hand, this.match.state.combat, 1, this.botRng);
    let botInk = 0;
    try {
      this.match.submitPlan(1, botPlan);
      botInk = botPlan.ultimates.reduce((sum, slot) => sum + this.ultimateCost(slot), 0);
    } catch {
      this.match.submitPlan(1, EMPTY_PLAN);
    }
    this.recorder.recordInkSpent(turn, [myInk, botInk]);

    const events = this.match.resolve(); // advances to next turn or ends
    this.enterResolution(events);
  }

  // ── Resolution & game over ─────────────────────────────────────────────────

  private enterResolution(events: ReturnType<Match['resolve']>): void {
    this.hand.setVisible(false);
    this.player.setVisible(true);
    this.hud.setPhase('RESOLUTION');
    this.info.setText('');

    this.player.play(events, () => {
      const s = this.match.state;
      this.team.syncFrom(s.combat);
      this.hud.setPools(s.combat);
      if (s.phase === 'ended') this.showGameOver();
      else this.enterWordPhase();
    });
  }

  private showGameOver(): void {
    const winner = this.match.state.winner;

    // Playtest instrumentation: persist this match and print the running §15 scorecard.
    const record = this.recorder.finish(winner ?? 'draw', Date.now() - this.matchStartMs);
    recordMatch(record);
    logSummary();

    const overlay = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.82)
      .setDepth(100);
    const verdict = winner === 0 ? 'VICTORY' : winner === 1 ? 'DEFEAT' : 'DRAW';
    const color = winner === 0 ? COLORS.gold : winner === 1 ? COLORS.danger : COLORS.textDim;
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, verdict, textStyle(44, color))
      .setOrigin(0.5)
      .setDepth(101);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 28, `${this.match.state.turn} turns of ink spilled`, textStyle(14, COLORS.textDim))
      .setOrigin(0.5)
      .setDepth(101);

    const again = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, 220, 52, 0x5b3fa8)
      .setStrokeStyle(2, COLORS.goldHex)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(again.x, again.y, 'PLAY AGAIN', textStyle(18, COLORS.gold))
      .setOrigin(0.5)
      .setDepth(102);
    overlay.setInteractive(); // swallow clicks behind the modal
    again.on('pointerup', () => {
      this.scene.restart({ trie: this.trie, seed: Date.now() >>> 0 });
    });
  }
}
