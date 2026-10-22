import {
  NUM_KINDS, idsToCounts, isDragon, isHonor, isRed, isTerminal, isYaochu, kindOf, kindShort, suitOf, numOf,
} from './tile';
import { shanten } from './shanten';
import { Meld, isOpenMeld } from './score';

export interface Threat {
  riichi: boolean;
  openMelds: number;
  /** その相手に対して安全な牌（本人の捨て牌＋リーチ後に誰かが通した牌） */
  safeKinds: Set<number>;
}

export interface EvalContext {
  hand: number[]; // 3n+2枚の牌id
  melds: Meld[];
  /** 自分の手牌以外で見えている枚数（全員の河・副露・ドラ表示牌） */
  visible: number[];
  doraKinds: number[];
  seatWind: number;
  roundWind: number;
  threats: Threat[];
  /** 切れる牌の制限（リーチ中・喰い替え） */
  allowed?: (id: number) => boolean;
}

export interface Candidate {
  tile: number;
  kind: number;
  shanten: number; // 役を考慮した向聴数
  rawShanten: number;
  ukeire: { kind: number; count: number }[];
  ukeireCount: number;
  valueLoss: number;
  danger: number; // 0-10
  dangerLabel: string;
  score: number;
  notes: string[];
}

export type Mode = 'attack' | 'push' | 'balance' | 'fold';

export interface Evaluation {
  candidates: Candidate[];
  mode: Mode;
  modeReason: string;
  path: string; // 狙う役の説明
}

// ---------------------------------------------------------------- 役の見込み

interface PathResult {
  s: number;
  path: string;
}

const yakuhaiKinds = (seat: number, round: number) => [31, 32, 33, seat, round];

/** 役を考慮した向聴数。門前ならリーチで役が付くので通常の向聴数 */
export function pathShanten(counts: number[], melds: Meld[], seat: number, round: number): PathResult {
  const mc = melds.length;
  const raw = shanten(counts, mc);
  const open = melds.some(isOpenMeld);
  if (!open) return { s: raw, path: 'リーチ・門前役' };
  const yh = yakuhaiKinds(seat, round);
  if (melds.some((m) => m.type !== 'chi' && yh.includes(kindOf(m.tiles[0])))) return { s: raw, path: '役牌（鳴き済み）' };
  if (yh.some((k) => counts[k] >= 3)) return { s: raw, path: '役牌（暗刻）' };

  let best: PathResult = { s: raw + 3, path: '役なし' };
  const consider = (s: number, path: string) => {
    if (s < best.s) best = { s, path };
  };
  // タンヤオ
  const meldTiles = melds.flatMap((m) => m.tiles.map(kindOf));
  if (meldTiles.every((k) => !isYaochu(k))) {
    const c = counts.map((x, k) => (isYaochu(k) ? 0 : x));
    consider(shanten(c, mc), 'タンヤオ');
  }
  // 染め手
  for (let s = 0; s < 3; s++) {
    if (meldTiles.every((k) => isHonor(k) || suitOf(k) === s)) {
      const c = counts.map((x, k) => (isHonor(k) || suitOf(k) === s ? x : 0));
      consider(shanten(c, mc), `${['萬子', '筒子', '索子'][s]}の染め手`);
    }
  }
  // 役牌の対子をポンする前提
  for (const k of new Set(yh)) {
    if (counts[k] === 2) {
      const c = [...counts];
      c[k] = 0;
      consider(shanten(c, mc + 1) + 1, `役牌 ${kindShort(k)} の重ね`);
    }
  }
  // 対々和
  if (melds.every((m) => m.type !== 'chi')) {
    let pairs = 0;
    let trips = 0;
    for (let k = 0; k < NUM_KINDS; k++) {
      if (counts[k] >= 3) trips++;
      else if (counts[k] === 2) pairs++;
    }
    const need = 4 - mc;
    const t = Math.min(trips, need);
    const r = need - t;
    const s = 2 * need - 2 * t - Math.min(pairs, r) - (pairs > r ? 1 : 0);
    consider(Math.max(raw, s), '対々和');
  }
  return best;
}

// ---------------------------------------------------------------- 危険度

export function dangerOf(kind: number, threats: Threat[], visible: number[], handCounts: number[]): { danger: number; label: string } {
  let worst = { danger: 0, label: '安全' };
  for (const t of threats) {
    const weight = t.riichi ? 1 : t.openMelds >= 3 ? 0.5 : 0;
    if (weight === 0) continue;
    let d: number;
    let label: string;
    const seen = visible[kind] + handCounts[kind];
    if (t.safeKinds.has(kind)) {
      d = 0; label = '現物';
    } else if (isHonor(kind)) {
      if (seen >= 3) { d = 0.5; label = 'ラス牌の字牌'; }
      else if (seen === 2) { d = 2; label = '2枚見えの字牌'; }
      else { d = 4; label = '生牌に近い字牌'; }
    } else {
      const n = numOf(kind);
      const lo = n - 3 >= 1 ? t.safeKinds.has(kind - 3) : null;
      const hi = n + 3 <= 9 ? t.safeKinds.has(kind + 3) : null;
      const partners = [lo, hi].filter((x) => x !== null);
      const safe = partners.filter((x) => x).length;
      if (safe === partners.length) {
        d = n <= 3 || n >= 7 ? 2.5 : 3; label = partners.length === 2 ? '両スジ' : 'スジ';
      } else if (safe > 0) {
        d = 5; label = '片スジ';
      } else if (isTerminal(kind)) {
        d = 5.5; label = '無スジの1・9牌';
      } else if (n === 2 || n === 8) {
        d = 7; label = '無スジの2・8牌';
      } else {
        d = 8.5; label = '無スジの中張牌';
      }
    }
    d *= weight;
    if (d > worst.danger || worst.label === '安全') worst = { danger: Math.max(d, worst.danger), label: d >= worst.danger ? label : worst.label };
  }
  return worst;
}

// ---------------------------------------------------------------- 評価本体

function keepValue(kind: number, seat: number, round: number): number {
  if (isHonor(kind)) return yakuhaiKinds(seat, round).includes(kind) ? 0.3 : 0;
  if (isTerminal(kind)) return 0.5;
  const n = numOf(kind);
  if (n === 2 || n === 8) return 0.7;
  return 0.9;
}

function ukeireOf(counts: number[], melds: Meld[], ctx: EvalContext, base: number) {
  const list: { kind: number; count: number }[] = [];
  for (let k = 0; k < NUM_KINDS; k++) {
    const remain = 4 - counts[k] - ctx.visible[k];
    if (remain <= 0) continue;
    counts[k]++;
    const s = pathShanten(counts, melds, ctx.seatWind, ctx.roundWind).s;
    counts[k]--;
    if (s < base) list.push({ kind: k, count: remain });
  }
  return list;
}

export function evaluateDiscards(ctx: EvalContext): Evaluation {
  const counts = idsToCounts(ctx.hand);
  const kinds = [...new Set(ctx.hand.map(kindOf))];
  const hasThreat = ctx.threats.some((t) => t.riichi || t.openMelds >= 3);
  const yh = yakuhaiKinds(ctx.seatWind, ctx.roundWind);
  const raw: Candidate[] = [];
  let path = '';

  for (const k of kinds) {
    const ids = ctx.hand.filter((id) => kindOf(id) === k && (!ctx.allowed || ctx.allowed(id)));
    if (ids.length === 0) continue;
    const tile = ids.find((id) => !isRed(id)) ?? ids[0];
    counts[k]--;
    const pr = pathShanten(counts, ctx.melds, ctx.seatWind, ctx.roundWind);
    const rawS = shanten(counts, ctx.melds.length);
    const uk = ukeireOf(counts, ctx.melds, ctx, pr.s);
    counts[k]++;
    const ukCount = uk.reduce((a, b) => a + b.count, 0);
    let loss = 0;
    const notes: string[] = [];
    if (ctx.doraKinds.includes(k)) {
      loss += 4 * ctx.doraKinds.filter((d) => d === k).length;
      notes.push('ドラを手放す');
    }
    if (isRed(tile)) {
      loss += 3;
      notes.push('赤ドラを手放す');
    }
    if (yh.includes(k) && counts[k] === 2) {
      loss += 3;
      notes.push('役牌の対子を崩す');
    }
    const dg = dangerOf(k, ctx.threats, ctx.visible, counts);
    raw.push({
      tile, kind: k, shanten: pr.s, rawShanten: rawS, ukeire: uk, ukeireCount: ukCount, valueLoss: loss,
      danger: dg.danger, dangerLabel: dg.label, score: 0, notes,
    });
    if (!path) path = pr.path;
  }

  const bestS = Math.min(...raw.map((c) => c.shanten));
  let mode: Mode = 'attack';
  let modeReason = '';
  if (hasThreat) {
    if (bestS >= 2) {
      mode = 'fold';
      modeReason = `相手の攻撃に対して自分は${bestS}向聴。和了は遠いので安全な牌を優先（ベタオリ）`;
    } else if (bestS === 1) {
      mode = 'balance';
      modeReason = '相手の攻撃に対して自分は1向聴。牌効率と安全度を両方見て判断';
    } else {
      mode = 'push';
      modeReason = 'テンパイしているので、危険すぎる牌でなければ押す';
    }
  }

  for (const c of raw) {
    const attack = -c.shanten * 1000 + c.ukeireCount * 10 - c.valueLoss * 10 - keepValue(c.kind, ctx.seatWind, ctx.roundWind);
    if (mode === 'fold') c.score = -c.danger * 1000 + attack * 0.01;
    else if (mode === 'balance') c.score = attack - c.danger * 60;
    else if (mode === 'push') c.score = attack - c.danger * 15;
    else c.score = attack;
  }
  raw.sort((a, b) => b.score - a.score);
  const best = raw[0];
  if (best) path = pathShanten(
    (() => { const c = [...counts]; c[best.kind]--; return c; })(),
    ctx.melds, ctx.seatWind, ctx.roundWind,
  ).path;
  return { candidates: raw, mode, modeReason, path };
}

// ---------------------------------------------------------------- 説明・判定

export function shantenLabel(s: number) {
  if (s <= -1) return '和了';
  if (s === 0) return 'テンパイ';
  return `${s}向聴`;
}

export function describeCandidate(c: Candidate, mode: Mode): string {
  const parts: string[] = [];
  parts.push(c.shanten !== c.rawShanten && c.shanten > c.rawShanten ? `${shantenLabel(c.shanten)}（役を考慮）` : shantenLabel(c.shanten));
  if (c.ukeire.length) {
    const tiles = c.ukeire.map((u) => kindShort(u.kind)).join(' ');
    parts.push(`${c.shanten === 0 ? '待ち' : '受け入れ'} ${c.ukeire.length}種${c.ukeireCount}枚（${tiles}）`);
  } else parts.push('受け入れなし');
  if (mode !== 'attack') parts.push(`危険度 ${c.danger.toFixed(1)}（${c.dangerLabel}）`);
  parts.push(...c.notes);
  return parts.join(' / ');
}

export type Rating = '最善' | '次善' | '悪手';

export function rateChoice(ev: Evaluation, kind: number): { rating: Rating; chosen?: Candidate; best: Candidate } {
  const best = ev.candidates[0];
  const chosen = ev.candidates.find((c) => c.kind === kind);
  if (!chosen) return { rating: '悪手', best };
  if (chosen.score >= best.score - 1e-6 || chosen.kind === best.kind) return { rating: '最善', chosen, best };
  // 同点（同じ受け入れ）の別候補も最善扱い
  const sameValue = chosen.shanten === best.shanten && chosen.ukeireCount === best.ukeireCount &&
    chosen.valueLoss === best.valueLoss && Math.abs(chosen.danger - best.danger) < 0.01;
  if (sameValue) return { rating: '最善', chosen, best };
  let good = false;
  if (ev.mode === 'fold') good = chosen.danger <= best.danger + 1;
  else good = chosen.shanten === best.shanten && chosen.ukeireCount >= best.ukeireCount * 0.8 && chosen.danger <= best.danger + 2;
  return { rating: good ? '次善' : '悪手', chosen, best };
}

export const isYakuhai = (k: number, seat: number, round: number) => isDragon(k) || k === seat || k === round;
