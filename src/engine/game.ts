import { EAST, doraFromIndicator, idsToCounts, isRed, kindOf, shuffle, sortIds, WIND_NAMES } from './tile';
import { shanten, waits } from './shanten';
import { Meld, ScoreResult, WinContext, isOpenMeld, scoreHand } from './score';

export type Phase = 'self' | 'call' | 'roundEnd' | 'gameEnd';

export interface Discard {
  tile: number;
  tsumogiri: boolean;
  riichi: boolean;
  called: boolean;
}

export interface Player {
  name: string;
  human: boolean;
  points: number;
  hand: number[];
  melds: Meld[];
  discards: Discard[];
  riichi: boolean;
  doubleRiichi: boolean;
  ippatsu: boolean;
  riichiPending: boolean;
  tempFuriten: boolean;
  riichiFuriten: boolean;
  safeAfterRiichi: Set<number>;
  drawn: number | null;
}

export interface SelfOptions {
  canTsumo: boolean;
  riichiTiles: number[]; // 切ればテンパイになる牌id
  ankan: number[]; // kind
  kakan: number[]; // kind
  discardable: number[]; // 牌id
}

export interface CallOptions {
  ron: boolean;
  pon: number[][];
  minkan: number[][];
  chi: number[][];
}

export type SelfAction =
  | { type: 'tsumo' }
  | { type: 'discard'; tile: number; riichi?: boolean }
  | { type: 'ankan'; kind: number }
  | { type: 'kakan'; kind: number };

export type CallAction =
  | { type: 'ron' }
  | { type: 'pon'; tiles: number[] }
  | { type: 'minkan'; tiles: number[] }
  | { type: 'chi'; tiles: number[] }
  | { type: 'pass' };

export interface WinInfo {
  player: number;
  from: number | null; // null = ツモ
  result: ScoreResult;
  hand: number[];
  melds: Meld[];
  winTile: number;
}

export interface RoundResult {
  kind: 'win' | 'draw';
  wins: WinInfo[];
  tenpai: boolean[];
  deltas: number[];
  uraIndicators: number[];
  title: string;
}

export interface GameConfig {
  length: 'tonpu' | 'hanchan';
  names?: string[];
  cpuOnly?: boolean;
}

export interface GameEvent {
  type: 'discard' | 'call' | 'riichi' | 'kan' | 'win' | 'draw' | 'round';
  player?: number;
  text: string;
}

const START_POINTS = 25000;

export class Game {
  players: Player[];
  config: GameConfig;
  startDealer: number;
  kyoku = 0; // 0 = 東1局
  honba = 0;
  sticks = 0;
  wall: number[] = [];
  rinshan: number[] = [];
  doraInd: number[] = [];
  uraInd: number[] = [];
  doraCount = 1;
  kanCount = 0;
  turn = 0;
  phase: Phase = 'self';
  lastDiscard: { player: number; tile: number } | null = null;
  pendingCalls = new Map<number, CallOptions>();
  callDecisions = new Map<number, CallAction>();
  kakanPending: { player: number; tile: number } | null = null;
  noCalls = true;
  rinshanFlag = false;
  afterCall: { forbidden: Set<number> } | null = null;
  result: RoundResult | null = null;
  events: GameEvent[] = [];
  version = 0;
  rand: () => number;

  constructor(config: GameConfig, rand: () => number = Math.random) {
    this.config = config;
    this.rand = rand;
    const names = config.names ?? ['あなた', 'CPU 下家', 'CPU 対面', 'CPU 上家'];
    this.players = names.map((name, i) => ({
      name, human: i === 0 && !config.cpuOnly, points: START_POINTS, hand: [], melds: [], discards: [],
      riichi: false, doubleRiichi: false, ippatsu: false, riichiPending: false,
      tempFuriten: false, riichiFuriten: false, safeAfterRiichi: new Set(), drawn: null,
    }));
    this.startDealer = Math.floor(rand() * 4);
    this.startRound();
  }

  // ------------------------------------------------------------ 基本情報

  get dealer() {
    return (this.startDealer + this.kyoku) % 4;
  }
  get roundWind() {
    return EAST + Math.floor(this.kyoku / 4);
  }
  seatWind(p: number) {
    return EAST + ((p - this.dealer + 4) % 4);
  }
  get lastKyoku() {
    return this.config.length === 'tonpu' ? 3 : 7;
  }
  roundLabel() {
    return `${WIND_NAMES[Math.floor(this.kyoku / 4)]}${(this.kyoku % 4) + 1}局 ${this.honba}本場`;
  }
  doraIndicators() {
    return this.doraInd.slice(0, this.doraCount).map(kindOf);
  }
  doraKinds() {
    return this.doraIndicators().map(doraFromIndicator);
  }
  isMenzen(p: number) {
    return !this.players[p].melds.some(isOpenMeld);
  }

  /** プレイヤー p から見えている牌の枚数（自分の手牌を除く） */
  visibleFor(p: number): number[] {
    const v = new Array(34).fill(0);
    for (const pl of this.players) {
      for (const d of pl.discards) if (!d.called) v[kindOf(d.tile)]++;
      for (const m of pl.melds) for (const t of m.tiles) v[kindOf(t)]++;
    }
    for (const k of this.doraIndicators()) v[k]++;
    void p;
    return v;
  }

  private emit(e: GameEvent) {
    this.events.push(e);
    if (this.events.length > 200) this.events.shift();
  }

  private touch() {
    this.version++;
  }

  // ------------------------------------------------------------ 局の開始

  startRound() {
    const tiles = shuffle(Array.from({ length: 136 }, (_, i) => i), this.rand);
    this.rinshan = tiles.splice(0, 4);
    this.doraInd = tiles.splice(0, 5);
    this.uraInd = tiles.splice(0, 5);
    this.wall = tiles;
    this.doraCount = 1;
    this.kanCount = 0;
    this.noCalls = true;
    this.lastDiscard = null;
    this.kakanPending = null;
    this.afterCall = null;
    this.rinshanFlag = false;
    this.result = null;
    this.pendingCalls.clear();
    this.callDecisions.clear();
    for (const pl of this.players) {
      Object.assign(pl, {
        hand: [], melds: [], discards: [], riichi: false, doubleRiichi: false, ippatsu: false,
        riichiPending: false, tempFuriten: false, riichiFuriten: false, safeAfterRiichi: new Set(), drawn: null,
      });
    }
    for (let i = 0; i < 13; i++) for (let j = 0; j < 4; j++) this.players[(this.dealer + j) % 4].hand.push(this.wall.pop()!);
    for (const pl of this.players) pl.hand = sortIds(pl.hand);
    this.emit({ type: 'round', text: `${this.roundLabel()} 開始（親：${this.players[this.dealer].name}）` });
    this.draw(this.dealer, false);
  }

  private draw(p: number, rinshan: boolean) {
    const pl = this.players[p];
    let tile: number;
    if (rinshan) {
      tile = this.rinshan.shift()!;
      this.rinshan.push(this.wall.shift()!); // 王牌を14枚に保つ（海底が1枚前にずれる）
    } else tile = this.wall.pop()!;
    pl.hand = sortIds(pl.hand);
    pl.hand.push(tile);
    pl.drawn = tile;
    this.turn = p;
    this.phase = 'self';
    this.rinshanFlag = rinshan;
    this.afterCall = null;
    this.touch();
  }

  // ------------------------------------------------------------ 判定ヘルパ

  private winContext(p: number, hand: number[], winTile: number, tsumo: boolean, extra: Partial<WinContext>): WinContext {
    const pl = this.players[p];
    return {
      hand, melds: pl.melds, winTile, tsumo,
      riichi: pl.riichi, doubleRiichi: pl.doubleRiichi, ippatsu: pl.ippatsu,
      seatWind: this.seatWind(p), roundWind: this.roundWind,
      doraIndicators: this.doraIndicators(),
      uraIndicators: this.uraInd.slice(0, this.doraCount).map(kindOf),
      dealer: p === this.dealer,
      ...extra,
    };
  }

  private firstUninterrupted(p: number) {
    return this.noCalls && this.players[p].discards.length === 0;
  }

  tsumoResult(p: number): ScoreResult | null {
    const pl = this.players[p];
    if (pl.drawn === null || this.afterCall) return null;
    const first = this.firstUninterrupted(p);
    return scoreHand(this.winContext(p, pl.hand, pl.drawn, true, {
      haitei: this.wall.length === 0,
      rinshan: this.rinshanFlag,
      tenhou: first && p === this.dealer,
      chiihou: first && p !== this.dealer,
    }));
  }

  private isFuriten(p: number) {
    const pl = this.players[p];
    if (pl.tempFuriten || pl.riichiFuriten) return true;
    const w = waits(idsToCounts(pl.hand), pl.melds.length);
    return pl.discards.some((d) => w.includes(kindOf(d.tile)));
  }

  ronResult(p: number, tile: number, chankan: boolean): ScoreResult | null {
    const pl = this.players[p];
    const hand = [...pl.hand, tile];
    if (shanten(idsToCounts(hand), pl.melds.length) !== -1) return null;
    if (this.isFuriten(p)) return null;
    return scoreHand(this.winContext(p, hand, tile, false, { houtei: this.wall.length === 0 && !chankan, chankan }));
  }

  private kuikaeForbidden(meld: Meld): Set<number> {
    const called = kindOf(meld.called!);
    const f = new Set([called]);
    if (meld.type === 'chi') {
      const ks = meld.tiles.map(kindOf).sort((a, b) => a - b);
      if (called === ks[0] && ks[2] % 9 !== 8) f.add(ks[2] + 1);
      if (called === ks[2] && ks[0] % 9 !== 0) f.add(ks[0] - 1);
    }
    return f;
  }

  selfOptions(p: number): SelfOptions {
    const pl = this.players[p];
    const opts: SelfOptions = { canTsumo: false, riichiTiles: [], ankan: [], kakan: [], discardable: [] };
    if (this.phase !== 'self' || this.turn !== p) return opts;
    if (this.afterCall) {
      opts.discardable = pl.hand.filter((id) => !this.afterCall!.forbidden.has(kindOf(id)));
      return opts;
    }
    opts.canTsumo = this.tsumoResult(p) !== null;
    const counts = idsToCounts(pl.hand);
    const canKan = this.kanCount < 4 && this.wall.length > 0;
    if (pl.riichi) {
      opts.discardable = [pl.drawn!];
      const k = kindOf(pl.drawn!);
      if (canKan && counts[k] === 4) {
        const before = waits(idsToCounts(pl.hand.filter((id) => id !== pl.drawn)), pl.melds.length);
        const c2 = [...counts];
        c2[k] = 0;
        const after = waits(c2, pl.melds.length + 1);
        if (before.length && before.length === after.length && before.every((x) => after.includes(x))) opts.ankan.push(k);
      }
      return opts;
    }
    opts.discardable = [...pl.hand];
    if (canKan) {
      for (let k = 0; k < 34; k++) if (counts[k] === 4) opts.ankan.push(k);
      for (const m of pl.melds) if (m.type === 'pon' && counts[kindOf(m.tiles[0])] > 0) opts.kakan.push(kindOf(m.tiles[0]));
    }
    if (this.isMenzen(p) && pl.points >= 1000 && this.wall.length >= 4) {
      for (const id of pl.hand) {
        const c = [...counts];
        c[kindOf(id)]--;
        if (shanten(c, pl.melds.length) === 0) opts.riichiTiles.push(id);
      }
    }
    return opts;
  }

  callOptions(q: number, tile: number, discarder: number): CallOptions {
    const pl = this.players[q];
    const k = kindOf(tile);
    const o: CallOptions = { ron: this.ronResult(q, tile, false) !== null, pon: [], minkan: [], chi: [] };
    if (this.wall.length === 0 || pl.riichi) return o;
    const same = pl.hand.filter((id) => kindOf(id) === k);
    const hasDiscardAfter = (used: number[], meld: Meld) => {
      const forbidden = this.kuikaeForbidden(meld);
      return pl.hand.some((id) => !used.includes(id) && !forbidden.has(kindOf(id)));
    };
    if (same.length >= 2) {
      // 赤5の有無で選択肢を分ける
      const reds = same.filter(isRed);
      const normals = same.filter((id) => !reds.includes(id));
      const choices: number[][] = [];
      if (normals.length >= 2) choices.push(normals.slice(0, 2));
      if (reds.length && normals.length >= 1) choices.push([reds[0], normals[0]]);
      for (const c of choices) if (hasDiscardAfter(c, { type: 'pon', tiles: [...c, tile], called: tile })) o.pon.push(c);
    }
    if (same.length === 3 && this.kanCount < 4) o.minkan.push(same);
    if (q === (discarder + 1) % 4 && k < 27) {
      const n = k % 9;
      const patterns = [[-2, -1], [-1, 1], [1, 2]];
      for (const [a, b] of patterns) {
        if (n + a < 0 || n + b > 8) continue;
        if (!pl.hand.some((id) => kindOf(id) === k + a) || !pl.hand.some((id) => kindOf(id) === k + b)) continue;
        // 赤を優先して使わない（通常牌があれば通常牌）
        const pick = (kind: number) => {
          const all = pl.hand.filter((id) => kindOf(id) === kind);
          return all.find((id) => !isRed(id)) ?? all[0];
        };
        const used = [pick(k + a), pick(k + b)];
        if (hasDiscardAfter(used, { type: 'chi', tiles: [...used, tile], called: tile })) o.chi.push(used);
      }
    }
    return o;
  }

  // ------------------------------------------------------------ 手番の行動

  actSelf(p: number, a: SelfAction) {
    const pl = this.players[p];
    if (this.phase !== 'self' || this.turn !== p) return;
    if (a.type === 'tsumo') {
      const r = this.tsumoResult(p);
      if (!r) return;
      this.settleWin([{ player: p, from: null, result: r, hand: [...pl.hand], melds: pl.melds, winTile: pl.drawn! }]);
      return;
    }
    if (a.type === 'ankan') {
      const ids = pl.hand.filter((id) => kindOf(id) === a.kind);
      pl.hand = sortIds(pl.hand.filter((id) => kindOf(id) !== a.kind));
      pl.melds.push({ type: 'ankan', tiles: ids });
      this.afterKan(p, '暗槓');
      return;
    }
    if (a.type === 'kakan') {
      const id = pl.hand.find((x) => kindOf(x) === a.kind)!;
      pl.hand = sortIds(pl.hand.filter((x) => x !== id));
      // 槍槓の確認
      this.kakanPending = { player: p, tile: id };
      this.pendingCalls.clear();
      this.callDecisions.clear();
      for (let q = 0; q < 4; q++) {
        if (q === p) continue;
        if (this.ronResult(q, id, true)) this.pendingCalls.set(q, { ron: true, pon: [], minkan: [], chi: [] });
      }
      if (this.pendingCalls.size) {
        this.phase = 'call';
        this.touch();
      } else this.completeKakan();
      return;
    }
    // 打牌
    const legal = this.selfOptions(p);
    if (!legal.discardable.includes(a.tile)) return;
    if (a.riichi && !legal.riichiTiles.includes(a.tile)) return;
    const tsumogiri = a.tile === pl.drawn && !this.afterCall;
    pl.hand = sortIds(pl.hand.filter((id) => id !== a.tile));
    if (pl.riichi) pl.ippatsu = false;
    if (a.riichi) {
      pl.riichi = true;
      pl.riichiPending = true;
      pl.ippatsu = true;
      pl.doubleRiichi = this.firstUninterrupted(p);
      this.emit({ type: 'riichi', player: p, text: `${pl.name} リーチ` });
    }
    pl.discards.push({ tile: a.tile, tsumogiri, riichi: !!a.riichi, called: false });
    if (!pl.riichi) pl.tempFuriten = false;
    pl.drawn = null;
    for (const other of this.players) if (other !== pl && other.riichi && !other.riichiPending) other.safeAfterRiichi.add(kindOf(a.tile));
    this.afterCall = null;
    this.rinshanFlag = false;
    this.lastDiscard = { player: p, tile: a.tile };
    this.emit({ type: 'discard', player: p, text: '' });
    this.pendingCalls.clear();
    this.callDecisions.clear();
    for (let q = 0; q < 4; q++) {
      if (q === p) continue;
      const o = this.callOptions(q, a.tile, p);
      if (o.ron || o.pon.length || o.minkan.length || o.chi.length) this.pendingCalls.set(q, o);
    }
    if (this.pendingCalls.size) {
      this.phase = 'call';
      this.touch();
    } else this.passDiscard();
  }

  private afterKan(p: number, label: string) {
    this.kanCount++;
    this.doraCount = Math.min(5, this.doraCount + 1);
    this.noCalls = false;
    for (const pl of this.players) pl.ippatsu = false;
    this.emit({ type: 'kan', player: p, text: `${this.players[p].name} ${label}` });
    this.draw(p, true);
  }

  private completeKakan() {
    const { player, tile } = this.kakanPending!;
    this.kakanPending = null;
    const pl = this.players[player];
    const m = pl.melds.find((x) => x.type === 'pon' && kindOf(x.tiles[0]) === kindOf(tile))!;
    m.type = 'kakan';
    m.tiles.push(tile);
    this.phase = 'self';
    this.afterKan(player, '加槓');
  }

  private establishRiichi(p: number) {
    const pl = this.players[p];
    if (pl.riichiPending) {
      pl.riichiPending = false;
      pl.points -= 1000;
      this.sticks++;
    }
  }

  private passDiscard() {
    const p = this.lastDiscard!.player;
    this.establishRiichi(p);
    this.pendingCalls.clear();
    if (this.wall.length === 0) {
      this.exhaustiveDraw();
      return;
    }
    this.draw((p + 1) % 4, false);
  }

  actCall(q: number, a: CallAction) {
    if (this.phase !== 'call' || !this.pendingCalls.has(q) || this.callDecisions.has(q)) return;
    this.callDecisions.set(q, a);
    if (this.callDecisions.size === this.pendingCalls.size) this.resolveCalls();
    else this.touch();
  }

  private resolveCalls() {
    const chankan = this.kakanPending;
    const from = chankan ? chankan.player : this.lastDiscard!.player;
    const tile = chankan ? chankan.tile : this.lastDiscard!.tile;
    // ロンを見逃した人はフリテン
    for (const [q, o] of this.pendingCalls) {
      if (o.ron && this.callDecisions.get(q)?.type !== 'ron') {
        const pl = this.players[q];
        pl.tempFuriten = true;
        if (pl.riichi) pl.riichiFuriten = true;
      }
    }
    const order = [1, 2, 3].map((d) => (from + d) % 4);
    const ronner = order.find((q) => this.callDecisions.get(q)?.type === 'ron');
    if (ronner !== undefined) {
      const pl = this.players[ronner];
      const result = this.ronResult(ronner, tile, !!chankan)!;
      if (!chankan) this.markCalled();
      this.settleWin([{ player: ronner, from, result, hand: [...pl.hand, tile], melds: pl.melds, winTile: tile }]);
      return;
    }
    if (chankan) {
      this.completeKakan();
      return;
    }
    let caller: number | undefined;
    let action: CallAction | undefined;
    for (const q of order) {
      const a = this.callDecisions.get(q);
      if (a && (a.type === 'pon' || a.type === 'minkan')) {
        caller = q;
        action = a;
        break;
      }
    }
    if (caller === undefined) {
      for (const q of order) {
        const a = this.callDecisions.get(q);
        if (a && a.type === 'chi') {
          caller = q;
          action = a;
        }
      }
    }
    if (caller === undefined || !action || action.type === 'pass' || action.type === 'ron') {
      this.passDiscard();
      return;
    }
    this.establishRiichi(from);
    this.markCalled();
    const pl = this.players[caller];
    const used = action.tiles;
    pl.hand = sortIds(pl.hand.filter((id) => !used.includes(id)));
    const meld: Meld = { type: action.type, tiles: [...used, tile], called: tile, from };
    pl.melds.push(meld);
    this.noCalls = false;
    for (const x of this.players) x.ippatsu = false;
    this.pendingCalls.clear();
    this.callDecisions.clear();
    const label = { pon: 'ポン', chi: 'チー', minkan: '大明槓' }[action.type];
    if (action.type === 'minkan') {
      this.afterKan(caller, label);
      return;
    }
    this.emit({ type: 'call', player: caller, text: `${pl.name} ${label}` });
    this.turn = caller;
    this.phase = 'self';
    pl.drawn = null;
    this.rinshanFlag = false;
    this.afterCall = { forbidden: this.kuikaeForbidden(meld) };
    this.touch();
  }

  private markCalled() {
    const d = this.players[this.lastDiscard!.player].discards;
    d[d.length - 1].called = true;
  }

  // ------------------------------------------------------------ 精算

  private settleWin(wins: WinInfo[]) {
    const deltas = [0, 0, 0, 0];
    const w = wins[0];
    const r = w.result;
    const h = this.honba;
    if (w.from === null) {
      for (let q = 0; q < 4; q++) {
        if (q === w.player) continue;
        const pay = (w.player === this.dealer ? r.tsumoChild : q === this.dealer ? r.tsumoDealer : r.tsumoChild) + 100 * h;
        deltas[q] -= pay;
        deltas[w.player] += pay;
      }
    } else {
      const pay = r.ron + 300 * h;
      deltas[w.from] -= pay;
      deltas[w.player] += pay;
    }
    deltas[w.player] += this.sticks * 1000;
    this.sticks = 0;
    for (let q = 0; q < 4; q++) this.players[q].points += deltas[q];
    const pl = this.players[w.player];
    const title = `${pl.name} ${w.from === null ? 'ツモ' : 'ロン'}`;
    this.emit({ type: 'win', player: w.player, text: title });
    this.result = {
      kind: 'win', wins, tenpai: [false, false, false, false], deltas,
      uraIndicators: pl.riichi ? this.uraInd.slice(0, this.doraCount).map(kindOf) : [], title,
    };
    this.phase = 'roundEnd';
    this.touch();
  }

  private exhaustiveDraw() {
    const tenpai = this.players.map((pl) => shanten(idsToCounts(pl.hand), pl.melds.length) === 0);
    const n = tenpai.filter(Boolean).length;
    const deltas = [0, 0, 0, 0];
    if (n > 0 && n < 4) {
      for (let q = 0; q < 4; q++) deltas[q] = tenpai[q] ? 3000 / n : -3000 / (4 - n);
    }
    for (let q = 0; q < 4; q++) this.players[q].points += deltas[q];
    this.emit({ type: 'draw', text: '流局' });
    this.result = { kind: 'draw', wins: [], tenpai, deltas, uraIndicators: [], title: '流局' };
    this.phase = 'roundEnd';
    this.touch();
  }

  /** 局の結果を受けて次局へ（または終局） */
  nextRound() {
    if (this.phase !== 'roundEnd' || !this.result) return;
    const r = this.result;
    const dealerKeeps = r.kind === 'win' ? r.wins.some((w) => w.player === this.dealer) : r.tenpai[this.dealer];
    const bust = this.players.some((p) => p.points < 0);
    const isAllLast = this.kyoku === this.lastKyoku;
    const dealerTop = this.players.every((p, i) => i === this.dealer || p.points < this.players[this.dealer].points);
    let end = bust;
    if (dealerKeeps) {
      this.honba++;
      if (isAllLast && dealerTop) end = true; // アガリやめ・テンパイやめ
    } else {
      this.honba = r.kind === 'draw' ? this.honba + 1 : 0;
      this.kyoku++;
      if (this.kyoku > this.lastKyoku) end = true;
    }
    if (end) {
      // 残った供託はトップへ
      if (this.sticks) {
        const top = this.ranking()[0];
        this.players[top].points += this.sticks * 1000;
        this.sticks = 0;
      }
      this.phase = 'gameEnd';
      this.touch();
      return;
    }
    this.startRound();
  }

  /** 着順（同点は起家に近い方が上） */
  ranking(): number[] {
    return [0, 1, 2, 3].sort((a, b) => {
      const d = this.players[b].points - this.players[a].points;
      if (d) return d;
      return ((a - this.startDealer + 4) % 4) - ((b - this.startDealer + 4) % 4);
    });
  }

  // ------------------------------------------------------------ 進行

  humanPending(): 'self' | 'call' | 'roundEnd' | 'gameEnd' | null {
    if (this.phase === 'roundEnd') return 'roundEnd';
    if (this.phase === 'gameEnd') return 'gameEnd';
    if (this.phase === 'self' && this.players[this.turn].human) return 'self';
    if (this.phase === 'call') {
      for (const [q] of this.pendingCalls) if (this.players[q].human && !this.callDecisions.has(q)) return 'call';
    }
    return null;
  }

  humanSeat() {
    return this.players.findIndex((p) => p.human);
  }
}
