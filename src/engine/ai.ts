import { idsToCounts, kindOf, kindShort } from './tile';
import { shanten } from './shanten';
import { Meld } from './score';
import { CallAction, CallOptions, Game, SelfAction } from './game';
import { EvalContext, Evaluation, Threat, evaluateDiscards, isYakuhai, pathShanten, shantenLabel } from './eval';

export function threatsFor(game: Game, p: number): Threat[] {
  const res: Threat[] = [];
  for (let q = 0; q < 4; q++) {
    if (q === p) continue;
    const pl = game.players[q];
    const safe = new Set<number>(pl.discards.map((d) => kindOf(d.tile)));
    for (const k of pl.safeAfterRiichi) safe.add(k);
    res.push({ riichi: pl.riichi, openMelds: pl.melds.filter((m) => m.type !== 'ankan').length, safeKinds: safe });
  }
  return res;
}

export function evalContextFor(game: Game, p: number, hand?: number[], melds?: Meld[], allowed?: (id: number) => boolean): EvalContext {
  const pl = game.players[p];
  const opts = game.phase === 'self' && game.turn === p ? game.selfOptions(p) : null;
  return {
    hand: hand ?? pl.hand,
    melds: melds ?? pl.melds,
    visible: game.visibleFor(p),
    doraKinds: game.doraKinds(),
    seatWind: game.seatWind(p),
    roundWind: game.roundWind,
    threats: threatsFor(game, p),
    allowed: allowed ?? (opts ? (id) => opts.discardable.includes(id) : undefined),
  };
}

export function evaluateTurn(game: Game, p: number): Evaluation {
  return evaluateDiscards(evalContextFor(game, p));
}

// ---------------------------------------------------------------- 鳴きの評価

export interface CallAdvice {
  action: CallAction;
  label: string;
  recommend: boolean;
  reason: string;
  afterShanten: number;
  afterUkeire: number;
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

export function adviseCalls(game: Game, q: number, opts: CallOptions): CallAdvice[] {
  const pl = game.players[q];
  const tile = game.kakanPending ? game.kakanPending.tile : game.lastDiscard!.tile;
  const k = kindOf(tile);
  const seat = game.seatWind(q);
  const round = game.roundWind;
  const res: CallAdvice[] = [];
  const counts = idsToCounts(pl.hand);
  const before = pathShanten(counts, pl.melds, seat, round);
  const menzen = game.isMenzen(q);
  const threats = threatsFor(game, q);
  const underAttack = threats.some((t) => t.riichi);

  if (opts.ron) {
    const r = game.ronResult(q, tile, !!game.kakanPending)!;
    res.push({
      action: { type: 'ron' }, label: 'ロン', recommend: true,
      reason: `${r.yaku.map((y) => y.name).join('・')}　${r.yakuman ? '' : `${r.han}翻${r.fu}符 `}${r.ron}点`,
      afterShanten: -1, afterUkeire: 0,
    });
  }

  const evalCall = (type: 'pon' | 'chi' | 'minkan', used: number[]) => {
    const meld: Meld = { type, tiles: [...used, tile], called: tile };
    const hand = pl.hand.filter((id) => !used.includes(id));
    const melds = [...pl.melds, meld];
    if (type === 'minkan') {
      const s = pathShanten(idsToCounts(hand), melds, seat, round);
      return { s: s.s, uk: 0, path: s.path };
    }
    const forb = forbiddenAfter(meld);
    const ev = evaluateDiscards(evalContextFor(game, q, hand, melds, (id) => !forb.has(kindOf(id))));
    const best = ev.candidates[0];
    return { s: best.shanten, uk: best.ukeireCount, path: ev.path, bestKind: best.kind };
  };

  const judge = (type: 'pon' | 'chi' | 'minkan', used: number[], label: string) => {
    const after = evalCall(type, used);
    const yakuhaiPon = type !== 'chi' && isYakuhai(k, seat, round) && counts[k] >= 2;
    let recommend = false;
    let reason = '';
    if (after.path === '役なし') {
      reason = '鳴くと役がなくなる（和了できない）';
    } else if (underAttack && after.s >= 1) {
      reason = `リーチ者がいる中で鳴いても${shantenLabel(after.s)}。手牌が減って守りにくくなる`;
    } else if (type === 'minkan') {
      recommend = !menzen && !underAttack && after.s <= before.s;
      reason = recommend ? '既に鳴いていて、カンしても形が崩れない（ドラが増える）' : '大明槓は相手にもドラが乗るうえ、手が固くなる';
    } else if (yakuhaiPon) {
      recommend = true;
      reason = `役牌 ${kindShort(k)} のポンで役が確定し、${shantenLabel(after.s)}に進む`;
    } else if (after.s >= before.s) {
      reason = `鳴いても${shantenLabel(after.s)}のままで進まない`;
    } else if (menzen && before.s <= 1) {
      reason = `門前で${shantenLabel(before.s)}。鳴かずにリーチを目指す方が打点が高い`;
    } else {
      recommend = true;
      reason = `${after.path}で${shantenLabel(after.s)}に進む${after.bestKind !== undefined ? `（鳴いた後は打${kindShort(after.bestKind)}）` : ''}`;
    }
    res.push({ action: { type, tiles: used } as CallAction, label, recommend, reason, afterShanten: after.s, afterUkeire: after.uk });
  };

  for (const used of opts.pon) judge('pon', used, used.some((id) => (id & 3) === 0 && [4, 13, 22].includes(id >> 2)) ? 'ポン（赤使用）' : 'ポン');
  for (const used of opts.minkan) judge('minkan', used, 'カン');
  for (const used of opts.chi) {
    const ks = [...used.map(kindOf), k].sort((a, b) => a - b).map(kindShort).join('');
    judge('chi', used, `チー ${ks}`);
  }
  return res;
}

// ---------------------------------------------------------------- CPU

export function cpuSelfAction(game: Game, p: number): SelfAction {
  const pl = game.players[p];
  const opts = game.selfOptions(p);
  if (opts.canTsumo) return { type: 'tsumo' };
  const threats = threatsFor(game, p);
  const underAttack = threats.some((t) => t.riichi);
  for (const k of opts.ankan) {
    if (pl.riichi) return { type: 'ankan', kind: k };
    const c = idsToCounts(pl.hand);
    const before = shanten(c, pl.melds.length);
    c[k] = 0;
    if (!underAttack && shanten(c, pl.melds.length + 1) <= before) return { type: 'ankan', kind: k };
  }
  if (!underAttack) {
    for (const k of opts.kakan) {
      const c = idsToCounts(pl.hand);
      const before = shanten(c, pl.melds.length);
      c[k]--;
      if (shanten(c, pl.melds.length) <= before) return { type: 'kakan', kind: k };
    }
  }
  const ev = evaluateTurn(game, p);
  const best = ev.candidates[0];
  const riichi = opts.riichiTiles.includes(best.tile) && best.ukeireCount > 0;
  return { type: 'discard', tile: best.tile, riichi };
}

export function cpuCallAction(game: Game, q: number): CallAction {
  const opts = game.pendingCalls.get(q)!;
  if (opts.ron) return { type: 'ron' };
  const advice = adviseCalls(game, q, opts).filter((a) => a.recommend && a.action.type !== 'minkan');
  if (!advice.length) return { type: 'pass' };
  advice.sort((a, b) => a.afterShanten - b.afterShanten || b.afterUkeire - a.afterUkeire);
  return advice[0].action;
}

/** CPU の手番・鳴き判断を1ステップ進める。進めた場合 true */
export function stepCPU(game: Game): boolean {
  if (game.phase === 'self' && !game.players[game.turn].human) {
    game.actSelf(game.turn, cpuSelfAction(game, game.turn));
    return true;
  }
  if (game.phase === 'call') {
    let acted = false;
    for (const [q] of [...game.pendingCalls]) {
      if (game.phase !== 'call') break;
      if (!game.players[q].human && !game.callDecisions.has(q)) {
        game.actCall(q, cpuCallAction(game, q));
        acted = true;
      }
    }
    return acted;
  }
  return false;
}
