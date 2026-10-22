import {
  NUM_KINDS, YAOCHU_KINDS, doraFromIndicator, idsToCounts, isDragon, isHonor, isRed,
  isTerminal, isYaochu, kindOf, suitOf, HATSU,
} from './tile';

export type MeldType = 'chi' | 'pon' | 'minkan' | 'ankan' | 'kakan';

export interface Meld {
  type: MeldType;
  tiles: number[]; // 牌id
  called?: number; // 鳴いた牌のid
  from?: number; // 鳴いた相手のプレイヤー番号
}

export const isOpenMeld = (m: Meld) => m.type !== 'ankan';
export const isKanMeld = (m: Meld) => m.type === 'minkan' || m.type === 'ankan' || m.type === 'kakan';

export interface WinContext {
  hand: number[]; // 手牌（和了牌を含む）の牌id
  melds: Meld[];
  winTile: number;
  tsumo: boolean;
  riichi?: boolean;
  doubleRiichi?: boolean;
  ippatsu?: boolean;
  haitei?: boolean;
  houtei?: boolean;
  rinshan?: boolean;
  chankan?: boolean;
  tenhou?: boolean;
  chiihou?: boolean;
  seatWind: number; // 27-30
  roundWind: number; // 27-30
  doraIndicators: number[]; // kind
  uraIndicators?: number[]; // kind
  dealer: boolean;
}

export interface YakuItem {
  name: string;
  han: number; // 役満は13
  yakuman?: boolean;
}

export interface ScoreResult {
  yaku: YakuItem[]; // ドラ含む
  han: number;
  fu: number;
  fuDetail: string[];
  yakuman: boolean;
  base: number;
  label: string; // 満貫・跳満など
  ron: number; // ロン時の支払い（本場抜き）
  tsumoDealer: number; // 子のツモ時に親が払う額
  tsumoChild: number; // ツモ時に子が払う額
  total: number; // 本場抜きの合計
}

interface Block {
  type: 'shuntsu' | 'koutsu' | 'kantsu';
  kind: number; // 順子は先頭
  open: boolean;
  fromWin?: boolean; // ロンで完成した刻子（明刻扱い）
}

type Wait = 'ryanmen' | 'kanchan' | 'penchan' | 'shanpon' | 'tanki';

// ---------------------------------------------------------------- 面子分解

interface Decomp {
  pair: number;
  sets: { type: 'shuntsu' | 'koutsu'; kind: number }[];
}

export function decompose(counts: number[]): Decomp[] {
  const res: Decomp[] = [];
  const c = [...counts];
  const total = c.reduce((a, b) => a + b, 0);
  if (total % 3 !== 2) return res;
  const sets: Decomp['sets'] = [];
  const rec = (pair: number) => {
    let i = 0;
    while (i < NUM_KINDS && c[i] === 0) i++;
    if (i === NUM_KINDS) {
      res.push({ pair, sets: [...sets] });
      return;
    }
    if (c[i] >= 3) {
      c[i] -= 3;
      sets.push({ type: 'koutsu', kind: i });
      rec(pair);
      sets.pop();
      c[i] += 3;
    }
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      sets.push({ type: 'shuntsu', kind: i });
      rec(pair);
      sets.pop();
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
  };
  for (let p = 0; p < NUM_KINDS; p++) {
    if (c[p] >= 2) {
      c[p] -= 2;
      rec(p);
      c[p] += 2;
    }
  }
  return res;
}

const isChiitoi = (c: number[]) => c.filter((x) => x === 2).length === 7;
const isKokushi = (c: number[]) =>
  YAOCHU_KINDS.every((k) => c[k] >= 1) && YAOCHU_KINDS.some((k) => c[k] === 2) &&
  c.reduce((a, b) => a + b, 0) === 14;

/** 和了形かどうか（役の有無は問わない） */
export function isAgariShape(counts: number[], meldCount: number): boolean {
  if (meldCount === 0 && (isChiitoi(counts) || isKokushi(counts))) return true;
  return decompose(counts).length > 0;
}

// ---------------------------------------------------------------- 点数

function roundUp100(x: number) {
  return Math.ceil(x / 100) * 100;
}

function pointsFromBase(base: number, dealer: boolean) {
  if (dealer) {
    const ron = roundUp100(base * 6);
    const each = roundUp100(base * 2);
    return { ron, tsumoDealer: 0, tsumoChild: each, total: ron };
  }
  const ron = roundUp100(base * 4);
  const d = roundUp100(base * 2);
  const ch = roundUp100(base);
  return { ron, tsumoDealer: d, tsumoChild: ch, total: ron };
}

export function baseFrom(han: number, fu: number, yakuman: boolean): { base: number; label: string } {
  if (yakuman || han >= 13) return { base: 8000, label: yakuman ? '役満' : '数え役満' };
  if (han >= 11) return { base: 6000, label: '三倍満' };
  if (han >= 8) return { base: 4000, label: '倍満' };
  if (han >= 6) return { base: 3000, label: '跳満' };
  const b = fu * Math.pow(2, han + 2);
  if (han >= 5 || b >= 2000) return { base: 2000, label: '満貫' };
  return { base: b, label: '' };
}

/** 早見表用：符・翻・親子から点数を求める */
export function quickPoints(han: number, fu: number, dealer: boolean) {
  const { base, label } = baseFrom(han, fu, false);
  return { ...pointsFromBase(base, dealer), label };
}

// ---------------------------------------------------------------- 役判定

function countDora(ctx: WinContext, allIds: number[]) {
  const kinds = allIds.map(kindOf);
  const cnt = (inds: number[]) => {
    let n = 0;
    for (const ind of inds) {
      const d = doraFromIndicator(ind);
      n += kinds.filter((k) => k === d).length;
    }
    return n;
  };
  return {
    dora: cnt(ctx.doraIndicators),
    ura: ctx.riichi && ctx.uraIndicators ? cnt(ctx.uraIndicators) : 0,
    aka: allIds.filter(isRed).length,
  };
}

function meldToBlock(m: Meld): Block {
  const k = Math.min(...m.tiles.map(kindOf));
  if (m.type === 'chi') return { type: 'shuntsu', kind: k, open: true };
  if (m.type === 'pon') return { type: 'koutsu', kind: k, open: true };
  return { type: 'kantsu', kind: k, open: m.type !== 'ankan' };
}

const blockKinds = (b: Block) => (b.type === 'shuntsu' ? [b.kind, b.kind + 1, b.kind + 2] : [b.kind]);
const isTripletLike = (b: Block) => b.type !== 'shuntsu';

function situationalYaku(ctx: WinContext, menzen: boolean): YakuItem[] {
  const y: YakuItem[] = [];
  if (ctx.doubleRiichi) y.push({ name: 'ダブル立直', han: 2 });
  else if (ctx.riichi) y.push({ name: '立直', han: 1 });
  if (ctx.ippatsu && ctx.riichi) y.push({ name: '一発', han: 1 });
  if (menzen && ctx.tsumo) y.push({ name: '門前清自摸和', han: 1 });
  if (ctx.rinshan) y.push({ name: '嶺上開花', han: 1 });
  if (ctx.chankan) y.push({ name: '槍槓', han: 1 });
  if (ctx.haitei && ctx.tsumo && !ctx.rinshan) y.push({ name: '海底摸月', han: 1 });
  if (ctx.houtei && !ctx.tsumo) y.push({ name: '河底撈魚', han: 1 });
  return y;
}

function finalize(ctx: WinContext, yaku: YakuItem[], fu: number, fuDetail: string[], allIds: number[]): ScoreResult | null {
  const yakuman = yaku.filter((y) => y.yakuman);
  if (yakuman.length > 0) {
    // ダブル役満なし：最も代表的な役満1つ分として扱う（複数成立時は名前は全て表示）
    const { base, label } = baseFrom(13, fu, true);
    return { yaku: yakuman, han: 13, fu, fuDetail, yakuman: true, base, label, ...pointsFromBase(base, ctx.dealer) };
  }
  if (yaku.length === 0) return null;
  const d = countDora(ctx, allIds);
  const all = [...yaku];
  if (d.dora) all.push({ name: 'ドラ', han: d.dora });
  if (d.aka) all.push({ name: '赤ドラ', han: d.aka });
  if (d.ura) all.push({ name: '裏ドラ', han: d.ura });
  const han = all.reduce((a, b) => a + b.han, 0);
  const { base, label } = baseFrom(han, fu, false);
  return { yaku: all, han, fu, fuDetail, yakuman: false, base, label, ...pointsFromBase(base, ctx.dealer) };
}

function better(a: ScoreResult | null, b: ScoreResult | null) {
  if (!a) return b;
  if (!b) return a;
  if (b.total !== a.total) return b.total > a.total ? b : a;
  if (b.han !== a.han) return b.han > a.han ? b : a;
  return b.fu > a.fu ? b : a;
}

function yakuhaiValue(k: number, ctx: WinContext) {
  let n = 0;
  if (isDragon(k)) n++;
  if (k === ctx.seatWind) n++;
  if (k === ctx.roundWind) n++;
  return n;
}

function windLabel(k: number) {
  return ['東', '南', '西', '北'][k - 27];
}

/** 和了の点数計算。役がなければ null */
export function scoreHand(ctx: WinContext): ScoreResult | null {
  const melds = ctx.melds;
  const menzen = melds.every((m) => !isOpenMeld(m));
  const allIds = [...ctx.hand, ...melds.flatMap((m) => m.tiles)];
  const counts = idsToCounts(ctx.hand);
  const win = kindOf(ctx.winTile);
  const allCounts = idsToCounts(allIds);
  const situ = situationalYaku(ctx, menzen);
  let best: ScoreResult | null = null;

  // 天和・地和
  const special: YakuItem[] = [];
  if (ctx.tenhou) special.push({ name: '天和', han: 13, yakuman: true });
  if (ctx.chiihou) special.push({ name: '地和', han: 13, yakuman: true });

  // 国士無双
  if (melds.length === 0 && isKokushi(counts)) {
    return finalize(ctx, [...special, { name: '国士無双', han: 13, yakuman: true }], 0, [], allIds);
  }

  // 七対子
  if (melds.length === 0 && isChiitoi(counts)) {
    const y: YakuItem[] = [...situ, { name: '七対子', han: 2 }];
    const kinds = counts.map((c, k) => (c ? k : -1)).filter((k) => k >= 0);
    if (kinds.every(isHonor)) special.push({ name: '字一色', han: 13, yakuman: true });
    if (kinds.every((k) => !isYaochu(k))) y.push({ name: '断幺九', han: 1 });
    if (kinds.every(isYaochu)) y.push({ name: '混老頭', han: 2 });
    const suits = new Set(kinds.filter((k) => !isHonor(k)).map(suitOf));
    if (suits.size === 1) {
      if (kinds.some(isHonor)) y.push({ name: '混一色', han: 3 });
      else y.push({ name: '清一色', han: 6 });
    }
    best = better(best, finalize(ctx, special.length ? special : y, 25, ['七対子 25符'], allIds));
  }

  const meldBlocks = melds.map(meldToBlock);
  for (const d of decompose(counts)) {
    // 和了牌がどのブロックに入るかで待ちの解釈を変える
    const options: { blocks: Block[]; wait: Wait }[] = [];
    const concealed: Block[] = d.sets.map((s) => ({ type: s.type, kind: s.kind, open: false }));
    if (d.pair === win) options.push({ blocks: concealed, wait: 'tanki' });
    concealed.forEach((b, i) => {
      if (!blockKinds(b).includes(win)) return;
      let wait: Wait;
      if (b.type === 'koutsu') wait = 'shanpon';
      else {
        const pos = win - b.kind;
        const n = b.kind % 9;
        if (pos === 1) wait = 'kanchan';
        else if (pos === 0) wait = n === 6 ? 'penchan' : 'ryanmen';
        else wait = n === 0 ? 'penchan' : 'ryanmen';
      }
      const blocks = concealed.map((x, j) =>
        j === i && x.type === 'koutsu' && !ctx.tsumo ? { ...x, fromWin: true } : x,
      );
      options.push({ blocks, wait });
    });

    for (const opt of options) {
      const blocks = [...opt.blocks, ...meldBlocks];
      const yaku: YakuItem[] = [...situ];
      const ym: YakuItem[] = [...special];
      const pair = d.pair;
      const shuntsu = blocks.filter((b) => b.type === 'shuntsu');
      const triplets = blocks.filter(isTripletLike);
      const concealedTriplets = triplets.filter((b) => !b.open && !b.fromWin).length;
      const kans = blocks.filter((b) => b.type === 'kantsu').length;
      const usedKinds = allCounts.map((c, k) => (c ? k : -1)).filter((k) => k >= 0);

      // ---- 役満
      if (concealedTriplets === 4) ym.push({ name: '四暗刻', han: 13, yakuman: true });
      const dragonTrip = triplets.filter((b) => isDragon(b.kind)).length;
      if (dragonTrip === 3) ym.push({ name: '大三元', han: 13, yakuman: true });
      const windTrip = triplets.filter((b) => b.kind >= 27 && b.kind <= 30).length;
      if (windTrip === 4) ym.push({ name: '大四喜', han: 13, yakuman: true });
      else if (windTrip === 3 && pair >= 27 && pair <= 30) ym.push({ name: '小四喜', han: 13, yakuman: true });
      if (usedKinds.every(isHonor)) ym.push({ name: '字一色', han: 13, yakuman: true });
      if (usedKinds.every(isTerminal)) ym.push({ name: '清老頭', han: 13, yakuman: true });
      const green = [19, 20, 21, 23, 25, HATSU];
      if (usedKinds.every((k) => green.includes(k))) ym.push({ name: '緑一色', han: 13, yakuman: true });
      if (kans === 4) ym.push({ name: '四槓子', han: 13, yakuman: true });
      if (melds.length === 0) {
        const s = suitOf(win);
        if (s < 3 && usedKinds.every((k) => suitOf(k) === s)) {
          const base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
          const cc = counts.slice(s * 9, s * 9 + 9);
          if (cc.every((x, i) => x >= base[i])) ym.push({ name: '九蓮宝燈', han: 13, yakuman: true });
        }
      }
      if (ym.length) {
        best = better(best, finalize(ctx, ym, 0, [], allIds));
        continue;
      }

      // ---- 通常役
      const pairValue = yakuhaiValue(pair, ctx);
      const isPinfu = menzen && shuntsu.length === 4 && pairValue === 0 && opt.wait === 'ryanmen';
      if (isPinfu) yaku.push({ name: '平和', han: 1 });
      if (usedKinds.every((k) => !isYaochu(k))) yaku.push({ name: '断幺九', han: 1 });

      for (const b of triplets) {
        if (b.kind === 31) yaku.push({ name: '役牌 白', han: 1 });
        if (b.kind === 32) yaku.push({ name: '役牌 發', han: 1 });
        if (b.kind === 33) yaku.push({ name: '役牌 中', han: 1 });
        if (b.kind === ctx.seatWind) yaku.push({ name: `自風 ${windLabel(b.kind)}`, han: 1 });
        if (b.kind === ctx.roundWind) yaku.push({ name: `場風 ${windLabel(b.kind)}`, han: 1 });
      }

      if (menzen) {
        const seq = shuntsu.map((b) => b.kind).sort((a, b) => a - b);
        let dup = 0;
        const used = new Array(seq.length).fill(false);
        for (let i = 0; i < seq.length; i++) {
          if (used[i]) continue;
          for (let j = i + 1; j < seq.length; j++) {
            if (!used[j] && seq[i] === seq[j]) {
              used[i] = used[j] = true;
              dup++;
              break;
            }
          }
        }
        if (dup === 2) yaku.push({ name: '二盃口', han: 3 });
        else if (dup === 1) yaku.push({ name: '一盃口', han: 1 });
      }

      const sStarts = new Set(shuntsu.map((b) => b.kind));
      for (let n = 0; n < 7; n++) {
        if (sStarts.has(n) && sStarts.has(n + 9) && sStarts.has(n + 18)) {
          yaku.push({ name: '三色同順', han: menzen ? 2 : 1 });
          break;
        }
      }
      for (let s = 0; s < 3; s++) {
        if (sStarts.has(s * 9) && sStarts.has(s * 9 + 3) && sStarts.has(s * 9 + 6)) {
          yaku.push({ name: '一気通貫', han: menzen ? 2 : 1 });
          break;
        }
      }
      const tripKinds = new Set(triplets.map((b) => b.kind));
      for (let n = 0; n < 9; n++) {
        if (tripKinds.has(n) && tripKinds.has(n + 9) && tripKinds.has(n + 18)) {
          yaku.push({ name: '三色同刻', han: 2 });
          break;
        }
      }
      if (triplets.length === 4) yaku.push({ name: '対々和', han: 2 });
      if (concealedTriplets === 3) yaku.push({ name: '三暗刻', han: 2 });
      if (kans === 3) yaku.push({ name: '三槓子', han: 2 });
      if (dragonTrip === 2 && isDragon(pair)) yaku.push({ name: '小三元', han: 2 });

      const allYaochu = usedKinds.every(isYaochu);
      if (allYaochu) yaku.push({ name: '混老頭', han: 2 });
      else {
        const everyHasYaochu = blocks.every((b) => blockKinds(b).some(isYaochu)) && isYaochu(pair);
        if (everyHasYaochu && shuntsu.length > 0) {
          if (usedKinds.some(isHonor)) yaku.push({ name: '混全帯幺九', han: menzen ? 2 : 1 });
          else yaku.push({ name: '純全帯幺九', han: menzen ? 3 : 2 });
        }
      }

      const suits = new Set(usedKinds.filter((k) => !isHonor(k)).map(suitOf));
      if (suits.size === 1) {
        if (usedKinds.some(isHonor)) yaku.push({ name: '混一色', han: menzen ? 3 : 2 });
        else yaku.push({ name: '清一色', han: menzen ? 6 : 5 });
      }

      // ---- 符
      const fuDetail: string[] = [];
      let fu: number;
      if (isPinfu && ctx.tsumo) {
        fu = 20;
        fuDetail.push('平和ツモ 20符');
      } else {
        fu = 20;
        fuDetail.push('副底 20符');
        if (menzen && !ctx.tsumo) {
          fu += 10;
          fuDetail.push('門前ロン +10符');
        }
        if (ctx.tsumo) {
          fu += 2;
          fuDetail.push('ツモ +2符');
        }
        for (const b of blocks) {
          if (b.type === 'shuntsu') continue;
          let f = b.type === 'kantsu' ? 8 : 2;
          const concealedB = !b.open && !b.fromWin;
          if (concealedB) f *= 2;
          if (isYaochu(b.kind)) f *= 2;
          fu += f;
          const nm = `${b.type === 'kantsu' ? (concealedB ? '暗槓' : '明槓') : concealedB ? '暗刻' : '明刻'}`;
          fuDetail.push(`${nm}（${isYaochu(b.kind) ? '么九牌' : '中張牌'}） +${f}符`);
        }
        if (pairValue) {
          fu += pairValue * 2;
          fuDetail.push(`役牌の雀頭 +${pairValue * 2}符`);
        }
        if (opt.wait === 'kanchan' || opt.wait === 'penchan' || opt.wait === 'tanki') {
          fu += 2;
          fuDetail.push(`${{ kanchan: '嵌張', penchan: '辺張', tanki: '単騎' }[opt.wait]}待ち +2符`);
        }
        if (!menzen && fu === 20) {
          fu = 30;
          fuDetail.push('鳴き平和形 → 30符');
        }
        fu = Math.ceil(fu / 10) * 10;
      }
      best = better(best, finalize(ctx, yaku, fu, fuDetail, allIds));
    }
  }
  return best;
}

/** 役があるか（ドラのみは不可） */
export function hasYaku(ctx: WinContext): boolean {
  return scoreHand(ctx) !== null;
}
