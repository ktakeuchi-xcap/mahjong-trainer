import {
  EAST, IdAssigner, NUM_KINDS, doraFromIndicator, idsToCounts, isRed, kindOf, kindShort, parseKinds,
} from './tile';
import { Meld, MeldType, isOpenMeld } from './score';
import { EvalContext, Threat, evaluateDiscards, isYakuhai, pathShanten, shantenLabel } from './eval';

export type CallKind = 'pon' | 'chi' | 'minkan';

export interface CallOption {
  type: CallKind;
  tiles: number[]; // 自分の手牌から使う牌id
  label: string;
}

export interface CallAxis {
  label: string;
  text: string;
}

export interface CallQuiz {
  hand: number[];
  melds: Meld[];
  discardTile: number;
  discardFrom: '上家' | '対面' | '下家';
  river: number[]; // 鳴き元の捨て牌（表示用）
  roundWind: number;
  seatWind: number;
  turn: number;
  doraIndicators: number[]; // kind
  riichi: boolean;
  note: string;
  options: CallOption[];
  answer: { type: 'call'; optionIndex: number } | { type: 'pass' };
  summary: string;
  axes: CallAxis[];
  before: { s: number; path: string };
  after?: { s: number; ukeire: number; path: string };
}

// ---------------------------------------------------------------- シード

export interface CallSeed {
  hand: string;
  melds?: { type: MeldType; tiles: string }[];
  discard: string; // 1種
  from: '上家' | '対面' | '下家';
  river: string;
  roundWind: number;
  seatWind: number;
  turn: number;
  dora: string; // ドラ表示牌（kind文字列・1枚）
  riichi?: boolean;
  note: string;
  expect: 'call' | 'pass';
}

export const CALL_SEEDS: CallSeed[] = [
  {
    hand: '345m678p24s99s55z3m', discard: '5z', from: '対面', river: '2m6p1s8s44z6m',
    roundWind: EAST, seatWind: EAST, turn: 9, dora: '2s',
    note: '東3局・中盤。あなたは親で2位、トップと3,900点差', expect: 'call',
  },
  {
    hand: '345m678m34p68s66s9p', discard: '5p', from: '下家', river: '1p9m3s22z7m1s',
    roundWind: EAST, seatWind: EAST + 1, turn: 8, dora: '1m',
    note: '東2局・中盤。あなたは南家で3位、2位と2,600点差', expect: 'call',
  },
  {
    hand: '345p678s24m99m66z3p', discard: '6z', from: '上家', river: '1m5m2p6s11z9p',
    roundWind: EAST, seatWind: EAST + 2, turn: 15, dora: '8s',
    note: '南4局（オーラス）・終盤。あなたは西家で3位、2位と1,500点差', expect: 'call',
  },
  {
    hand: '222s666s78s33s99s5z', discard: '9s', from: '対面', river: '1s5s9m33z8m2p',
    roundWind: EAST + 1, seatWind: EAST + 1, turn: 10, dora: '4s',
    note: '南2局・中盤。あなたは南家（親）でトップと1,200点差の2位', expect: 'call',
  },
  {
    hand: '33m99m55p7p999s222z', discard: '9m', from: '上家', river: '2m8p1s6s44z5m',
    roundWind: EAST, seatWind: EAST + 3, turn: 10, dora: '4s',
    note: '東4局・中盤。あなたは北家で2位、トップと5,200点差', expect: 'call',
  },
  {
    hand: '345m234s888p3m', melds: [{ type: 'pon', tiles: '222p' }], discard: '8p', from: '対面',
    river: '5m1p7s33z9s6p', roundWind: EAST, seatWind: EAST + 1, turn: 11, dora: '7p',
    note: '南2局・中盤。あなたは南家で2位。タンヤオを1副露済み', expect: 'call',
  },
  {
    hand: '24m55p67s99s55z333p', discard: '5z', from: '対面', river: '1m8m4s2s66z9p',
    roundWind: EAST, seatWind: EAST + 1, turn: 7, dora: '6m',
    note: '東2局・序盤。あなたは南家で2位、トップと3,000点差', expect: 'call',
  },
  {
    hand: '123m789m123p99s31z', discard: '9s', from: '上家', river: '4m6p5s2s1p7m',
    roundWind: EAST, seatWind: EAST, turn: 8, dora: '5m',
    note: '東3局・中盤。あなたは親で2位', expect: 'pass',
  },
  {
    hand: '345m678m345p67p55s', discard: '8p', from: '下家', river: '2m9p6s3s44z8m',
    roundWind: EAST, seatWind: EAST + 1, turn: 9, dora: '4s',
    note: '東3局・中盤。あなたは南家で2位、トップと4,500点差', expect: 'pass',
  },
  {
    hand: '234m678m555s34p67p', discard: '5p', from: '下家', river: '1m9m2s33z6m8s',
    roundWind: EAST, seatWind: EAST, turn: 7, dora: '4s',
    note: '東2局・序盤。あなたは親で3位、トップと6,800点差', expect: 'pass',
  },
  {
    hand: '567m34p89s345s7z22z', discard: '2z', from: '上家', river: '6m2p1s9p55z3s',
    roundWind: EAST, seatWind: EAST, turn: 11, dora: '1s', riichi: true,
    note: '東4局・中盤。対面がリーチ中。あなたは親で2位', expect: 'pass',
  },
  {
    hand: '123m456p9p345s66s3m', discard: '3p', from: '下家', river: '8m2s55p6z9m1z',
    roundWind: EAST + 1, seatWind: EAST + 3, turn: 8, dora: '7m',
    note: '南1局・中盤。あなたは北家で3位', expect: 'pass',
  },
  {
    hand: '379m278p49s55z136z', discard: '5z', from: '対面', river: '2m6s11p4m88z3s',
    roundWind: EAST + 1, seatWind: EAST + 1, turn: 5, dora: '2m',
    note: '南1局・序盤。あなたは南家で2位', expect: 'pass',
  },
];

// ---------------------------------------------------------------- 分析

interface AfterInfo {
  s: number;
  ukeire: number;
  path: string;
}

function forbiddenAfter(meld: Meld): Set<number> {
  const called = kindOf(meld.called!);
  const f = new Set([called]);
  if (meld.type === 'chi') {
    const ks = meld.tiles.map(kindOf).sort((a, b) => a - b);
    if (called === ks[0] && ks[2] % 9 !== 8) f.add(ks[2] + 1);
    if (called === ks[2] && ks[0] % 9 !== 0) f.add(ks[0] - 1);
  }
  return f;
}

function doraCountOf(ids: number[], doraKinds: number[]): number {
  let n = 0;
  for (const id of ids) {
    if (doraKinds.includes(kindOf(id))) n++;
    if (isRed(id)) n++;
  }
  return n;
}

function analyzeOption(
  hand: number[], melds: Meld[], opt: CallOption, discardTile: number,
  visible: number[], doraKinds: number[], seat: number, round: number, threats: Threat[],
): AfterInfo {
  const meld: Meld = { type: opt.type, tiles: [...opt.tiles, discardTile], called: discardTile };
  const rest = hand.filter((id) => !opt.tiles.includes(id));
  const newMelds = [...melds, meld];
  if (opt.type === 'minkan') {
    const s = pathShanten(idsToCounts(rest), newMelds, seat, round);
    return { s: s.s, ukeire: 0, path: s.path };
  }
  const forb = forbiddenAfter(meld);
  const ctx: EvalContext = {
    hand: rest, melds: newMelds, visible, doraKinds, seatWind: seat, roundWind: round,
    threats, allowed: (id) => !forb.has(kindOf(id)),
  };
  const ev = evaluateDiscards(ctx);
  const best = ev.candidates[0];
  return { s: best.shanten, ukeire: best.ukeireCount, path: ev.path };
}

// ---------------------------------------------------------------- 判定

interface JudgeResult {
  call: boolean;
  axis: '役' | '守備' | '打点' | '速度' | '種類';
  why: string;
}

function judgeOption(
  opt: CallOption, after: AfterInfo,
  base: { s: number; menzen: boolean; doraCount: number },
  melds: Meld[], seat: number, round: number, riichi: boolean, discardKind: number,
): JudgeResult {
  const yakuhaiPon = opt.type !== 'chi' && isYakuhai(discardKind, seat, round);
  if (after.path === '役なし') {
    return { call: false, axis: '役', why: '鳴いても役が付かない（役なし）ため、和了できない' };
  }
  if (riichi && after.s >= 1) {
    return { call: false, axis: '守備', why: `リーチ者がいる中で鳴いても${shantenLabel(after.s)}。攻めきれず守りきれない形になる` };
  }
  if (base.menzen && base.s === 0) {
    return { call: false, axis: '打点', why: 'すでに門前でテンパイしている。鳴くとリーチの道が消え、待ちも悪くなる' };
  }
  if (opt.type === 'minkan') {
    const ok = melds.length > 0 && after.s <= base.s && !riichi;
    return ok
      ? { call: true, axis: '種類', why: '既に鳴いていて形が崩れず、新ドラの期待も増える' }
      : { call: false, axis: '種類', why: '大明槓は相手にもドラが増え、手が固くなる。原則として控える' };
  }
  if (yakuhaiPon) {
    if (after.s <= base.s && after.s <= 3) {
      return { call: true, axis: '役', why: `役牌 ${kindShort(discardKind)} のポンで役が確定し、${shantenLabel(after.s)}に進む` };
    }
    return { call: false, axis: '役', why: `役牌ポンでも${shantenLabel(after.s)}では遠すぎる。序盤に手を開く代償（打点・守備の低下）に見合わない` };
  }
  if (after.s >= base.s) {
    return { call: false, axis: '速度', why: `鳴いても${shantenLabel(after.s)}のままで手が進まない` };
  }
  if (base.menzen && base.s === 1 && after.s === 0 && base.doraCount >= 2) {
    return { call: false, axis: '打点', why: `ドラを${base.doraCount}枚抱えた門前${shantenLabel(base.s)}。安い鳴きで固定せず、リーチで打点を伸ばす方が期待値が高い` };
  }
  return { call: true, axis: '速度', why: `${after.path}の形で${shantenLabel(after.s)}に進み、受け入れも${after.ukeire}枚ある` };
}

// ---------------------------------------------------------------- 構築

export function buildCallQuiz(seed: CallSeed): CallQuiz | null {
  const asg = new IdAssigner();
  const handKinds = parseKinds(seed.hand);
  const hand = asg.assign(handKinds);
  const melds: Meld[] = (seed.melds ?? []).map((m) => {
    const tiles = asg.assign(parseKinds(m.tiles));
    return { type: m.type, tiles, called: tiles[tiles.length - 1] };
  });
  const riverKinds = parseKinds(seed.river);
  const river = asg.assign(riverKinds);
  const doraIndicators = parseKinds(seed.dora);
  asg.assign(doraIndicators);
  const discardKind = parseKinds(seed.discard)[0];
  const discardTile = asg.assign([discardKind])[0];
  // 牌の総数チェック（同種5枚以上は不正）
  for (let k = 0; k < NUM_KINDS; k++) if (asg.countOf(k) > 4) return null;

  const counts = idsToCounts(hand);
  const doraKinds = doraIndicators.map(doraFromIndicator);
  const visible = new Array(NUM_KINDS).fill(0);
  for (const k of riverKinds) visible[k]++;
  for (const k of doraIndicators) visible[k]++;
  for (const m of melds) for (const t of m.tiles) visible[kindOf(t)]++;
  visible[discardKind]++;

  const threats: Threat[] = seed.riichi
    ? [{ riichi: true, openMelds: 0, safeKinds: new Set(riverKinds) }]
    : [];

  // 選択肢の列挙
  const options: CallOption[] = [];
  const idsOf = (k: number) => hand.filter((id) => kindOf(id) === k);
  if (counts[discardKind] >= 2) {
    const ids = idsOf(discardKind);
    const nonRed = ids.filter((id) => !isRed(id));
    const use = [...nonRed, ...ids.filter((id) => isRed(id))].slice(0, 2);
    options.push({ type: 'pon', tiles: use, label: 'ポン' });
  }
  if (counts[discardKind] >= 3) {
    options.push({ type: 'minkan', tiles: idsOf(discardKind).slice(0, 3), label: 'カン（大明槓）' });
  }
  if (seed.from === '下家' && discardKind < 27) {
    const suitBase = Math.floor(discardKind / 9) * 9;
    const n = discardKind - suitBase;
    const combos: [number, number][] = [[n - 2, n - 1], [n - 1, n + 1], [n + 1, n + 2]];
    for (const [a, b] of combos) {
      if (a < 0 || b > 8) continue;
      const ka = suitBase + a;
      const kb = suitBase + b;
      if (counts[ka] > 0 && counts[kb] > 0) {
        const tiles = [idsOf(ka)[0], idsOf(kb)[0]];
        const ks = [...tiles.map(kindOf), discardKind].sort((x, y) => x - y).map(kindShort).join('');
        options.push({ type: 'chi', tiles, label: `チー ${ks}` });
      }
    }
  }
  if (options.length === 0) return null;

  const basePath = pathShanten(counts, melds, seed.seatWind, seed.roundWind);
  const base = {
    s: basePath.s,
    menzen: !melds.some(isOpenMeld),
    doraCount: doraCountOf(hand, doraKinds),
  };

  const judged = options.map((opt) => {
    const after = analyzeOption(hand, melds, opt, discardTile, visible, doraKinds, seed.seatWind, seed.roundWind, threats);
    const j = judgeOption(opt, after, base, melds, seed.seatWind, seed.roundWind, !!seed.riichi, discardKind);
    return { opt, after, j };
  });

  const callIdx = judged
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.j.call)
    .sort((a, b) => a.x.after.s - b.x.after.s || b.x.after.ukeire - a.x.after.ukeire)[0];

  const verdict: CallQuiz['answer'] = callIdx ? { type: 'call', optionIndex: callIdx.i } : { type: 'pass' };
  if ((verdict.type === 'call') !== (seed.expect === 'call')) return null;

  const decided = callIdx ? callIdx.x : judged.slice().sort((a, b) => a.after.s - b.after.s)[0];
  const after = decided.after;

  const axes: CallAxis[] = [
    {
      label: '役',
      text: after.path === '役なし'
        ? '鳴いた後はどの役も付きません（役なし）。和了できない鳴きは、形が進んでも意味がありません。'
        : `鳴いた後の狙いは「${after.path}」。鳴く前は「${basePath.path}」で、役の見込みは確保できます。`,
    },
    {
      label: '打点',
      text: base.doraCount >= 2
        ? `手にはドラが${base.doraCount}枚。門前でリーチまで持っていければ満貫級も見えるため、鳴きで打点を固定する損失が大きい局面です。`
        : verdict.type === 'call'
          ? '鳴いても狙う役の打点は大きくは落ちません。リーチを失う分より、速度で得る分の方が大きい局面です。'
          : '鳴いても打点が伸びるわけではありません。門前で進めた方が、リーチ分だけ期待値が高くなります。',
    },
    {
      label: '速度',
      text: `向聴数は鳴く前 ${shantenLabel(base.s)} → 鳴いた後 ${shantenLabel(after.s)}（受け入れ ${after.ukeire}枚）。` +
        (after.s < base.s ? '鳴くことで手が前に進みます。' : '鳴いても手は進みません。'),
    },
    {
      label: '状況',
      text: `${seed.note}。${seed.turn >= 13 ? '終盤なので、テンパイの確保や和了そのものの価値が上がります。' : seed.turn <= 6 ? 'まだ序盤で、門前で伸ばす時間も残っています。' : '中盤戦で、速度と打点のバランスを見る局面です。'}`,
    },
    {
      label: '守備',
      text: seed.riichi
        ? 'リーチ者がいます。鳴いてテンパイに届かないと、攻めきれず守りきれない最も危険な形になります。副露で手牌が減り、安全牌も抱えにくくなります。'
        : `リーチ者はいません。ただし鳴くと副露が${melds.length + 1}つになり、手の狙いが伝わるうえ安全牌を抱える余裕は減ります。`,
    },
  ];

  const summary = verdict.type === 'call'
    ? `正解は「${options[callIdx!.i].label}」。${callIdx!.x.j.why}。`
    : `正解は「鳴かない」。${decided.j.why}。`;

  return {
    hand, melds, discardTile, discardFrom: seed.from, river,
    roundWind: seed.roundWind, seatWind: seed.seatWind, turn: seed.turn,
    doraIndicators, riichi: !!seed.riichi, note: seed.note, options,
    answer: verdict, summary, axes,
    before: { s: base.s, path: basePath.path },
    after: { s: after.s, ukeire: after.ukeire, path: after.path },
  };
}

/** 鳴き判断クイズを1問作る（シードをシャッフルし、エンジン判定と一致するものを返す） */
export function generateCallQuiz(rand: () => number = Math.random): CallQuiz {
  const order = CALL_SEEDS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const i of order) {
    const q = buildCallQuiz(CALL_SEEDS[i]);
    if (q) return q;
  }
  // 全滅は想定外だが、その場合は先頭シードをそのまま返す
  const first = buildCallQuiz(CALL_SEEDS[0]);
  if (first) return first;
  throw new Error('鳴きクイズを生成できませんでした');
}
