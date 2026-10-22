import { EAST, doraFromIndicator, idsToCounts, kindOf, sortIds } from './tile';
import { shanten } from './shanten';
import { Evaluation, evaluateDiscards } from './eval';

export interface Quiz {
  hand: number[]; // 14枚
  doraIndicator: number; // kind
  seatWind: number;
  roundWind: number;
  turn: number; // 巡目
  evaluation: Evaluation;
}

function randomCompleteKinds(rand: () => number): number[] {
  const counts = new Array(34).fill(0);
  const out: number[] = [];
  const add = (ks: number[]) => {
    if (ks.some((k) => counts[k] + ks.filter((x) => x === k).length > 4)) return false;
    for (const k of ks) { counts[k]++; out.push(k); }
    return true;
  };
  let sets = 0;
  while (sets < 4) {
    const r = rand();
    if (r < 0.7) {
      const s = Math.floor(rand() * 3);
      const n = Math.floor(rand() * 7);
      if (add([s * 9 + n, s * 9 + n + 1, s * 9 + n + 2])) sets++;
    } else {
      const k = rand() < 0.75 ? Math.floor(rand() * 27) : 27 + Math.floor(rand() * 7);
      if (add([k, k, k])) sets++;
    }
  }
  while (true) {
    const k = Math.floor(rand() * 34);
    if (add([k, k])) break;
  }
  return out;
}

/** 何切る問題を1問作る（1〜2向聴、門前、最善手が他と区別できるもの） */
export function generateQuiz(rand: () => number = Math.random): Quiz {
  for (let attempt = 0; attempt < 500; attempt++) {
    const kinds = randomCompleteKinds(rand);
    // 2〜4枚を入れ替えて崩す
    const swaps = 2 + Math.floor(rand() * 3);
    const counts = idsToCounts([]);
    for (const k of kinds) counts[k]++;
    for (let i = 0; i < swaps; i++) {
      const idx = Math.floor(rand() * kinds.length);
      let nk: number;
      do nk = Math.floor(rand() * 34); while (counts[nk] >= 4);
      counts[kinds[idx]]--;
      counts[nk]++;
      kinds[idx] = nk;
    }
    const s = shanten(counts, 0);
    if (s < 1 || s > 2) continue;
    // 牌idを割り当てる（5は3割程度で赤を含める）
    const used = new Array(34).fill(0);
    const start = Array.from({ length: 34 }, () => (rand() < 0.3 ? 0 : 1));
    const ids = kinds.map((k) => k * 4 + ((start[k] + used[k]++) % 4));
    let ind: number;
    do ind = Math.floor(rand() * 34); while (counts[ind] >= 4);
    const visible = new Array(34).fill(0);
    visible[ind]++;
    const seatWind = EAST + Math.floor(rand() * 4);
    const roundWind = EAST + (rand() < 0.7 ? 0 : 1);
    const evaluation = evaluateDiscards({
      hand: ids, melds: [], visible, doraKinds: [doraFromIndicator(ind)], seatWind, roundWind, threats: [],
    });
    const c = evaluation.candidates;
    if (c.length < 2) continue;
    // 最善と次点がほぼ同点の問題は避ける
    if (c[0].shanten === c[1].shanten && c[0].ukeireCount - c[1].ukeireCount < 2 && c[0].valueLoss === c[1].valueLoss) continue;
    // 自明すぎる問題（向聴を戻さない候補が1つしかない）は避ける
    const keep = c.filter((x) => x.shanten === c[0].shanten).length;
    if (keep < 3) continue;
    return {
      hand: sortIds(ids), doraIndicator: ind, seatWind, roundWind,
      turn: 4 + Math.floor(rand() * 6), evaluation,
    };
  }
  // 見つからない場合は条件を緩めずに再試行
  return generateQuiz(rand);
}

export const quizKinds = (q: Quiz) => q.hand.map(kindOf);
