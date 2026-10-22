import { NUM_KINDS, YAOCHU_KINDS } from './tile';

// 一般形の向聴数は色ごとに「面子数・塔子数・雀頭有無」の到達可能な組を求め、
// 4色を組み合わせて最小値を取る。色ごとの結果はメモ化する。

type State = [number, number, number]; // [面子, 塔子, 雀頭]

const suitCache = new Map<string, State[]>();

function suitStates(c: number[], honor: boolean): State[] {
  const key = (honor ? 'z' : 'n') + c.join('');
  const hit = suitCache.get(key);
  if (hit) return hit;
  const found = new Map<string, State>();
  const cc = [...c];
  const rec = (i: number, m: number, t: number, p: number) => {
    while (i < cc.length && cc[i] === 0) i++;
    if (i >= cc.length) {
      const k = `${m},${t},${p}`;
      if (!found.has(k)) found.set(k, [m, t, p]);
      return;
    }
    if (cc[i] >= 3) {
      cc[i] -= 3;
      rec(i, m + 1, t, p);
      cc[i] += 3;
    }
    if (!honor && i <= 6 && cc[i + 1] > 0 && cc[i + 2] > 0) {
      cc[i]--; cc[i + 1]--; cc[i + 2]--;
      rec(i, m + 1, t, p);
      cc[i]++; cc[i + 1]++; cc[i + 2]++;
    }
    if (cc[i] >= 2) {
      cc[i] -= 2;
      if (p === 0) rec(i, m, t, 1);
      rec(i, m, t + 1, p);
      cc[i] += 2;
    }
    if (!honor && i <= 7 && cc[i + 1] > 0) {
      cc[i]--; cc[i + 1]--;
      rec(i, m, t + 1, p);
      cc[i]++; cc[i + 1]++;
    }
    if (!honor && i <= 6 && cc[i + 2] > 0) {
      cc[i]--; cc[i + 2]--;
      rec(i, m, t + 1, p);
      cc[i]++; cc[i + 2]++;
    }
    cc[i]--;
    rec(i, m, t, p);
    cc[i]++;
  };
  rec(0, 0, 0, 0);
  // 支配される状態を除く
  const all = [...found.values()];
  const res = all.filter(
    (a) => !all.some((b) => b !== a && b[0] >= a[0] && b[1] >= a[1] && b[2] >= a[2] && (b[0] > a[0] || b[1] > a[1] || b[2] > a[2])),
  );
  suitCache.set(key, res);
  return res;
}

export function normalShanten(counts: number[], melds: number): number {
  const groups = [
    suitStates(counts.slice(0, 9), false),
    suitStates(counts.slice(9, 18), false),
    suitStates(counts.slice(18, 27), false),
    suitStates(counts.slice(27, 34), true),
  ];
  const need = 4 - melds;
  let best = 8;
  for (const a of groups[0])
    for (const b of groups[1])
      for (const c of groups[2])
        for (const d of groups[3]) {
          const p = a[2] + b[2] + c[2] + d[2];
          if (p > 1) continue;
          const m = Math.min(a[0] + b[0] + c[0] + d[0], need);
          const t = Math.min(a[1] + b[1] + c[1] + d[1], need - m);
          const s = 2 * need - 2 * m - t - p;
          if (s < best) best = s;
        }
  return best;
}

export function chiitoiShanten(counts: number[]): number {
  let pairs = 0;
  let kinds = 0;
  for (let k = 0; k < NUM_KINDS; k++) {
    if (counts[k] > 0) kinds++;
    if (counts[k] >= 2) pairs++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

export function kokushiShanten(counts: number[]): number {
  let kinds = 0;
  let pair = 0;
  for (const k of YAOCHU_KINDS) {
    if (counts[k] > 0) kinds++;
    if (counts[k] >= 2) pair = 1;
  }
  return 13 - kinds - pair;
}

/** 向聴数（-1 = 和了形）。melds は副露（暗槓含む）の数 */
export function shanten(counts: number[], melds = 0): number {
  let s = normalShanten(counts, melds);
  if (melds === 0) {
    s = Math.min(s, chiitoiShanten(counts), kokushiShanten(counts));
  }
  return s;
}

/** 13枚（+副露）の手で、何を引けば向聴数が進むか */
export function effectiveDraws(counts: number[], melds: number): number[] {
  const base = shanten(counts, melds);
  const res: number[] = [];
  for (let k = 0; k < NUM_KINDS; k++) {
    if (counts[k] >= 4) continue;
    counts[k]++;
    if (shanten(counts, melds) < base) res.push(k);
    counts[k]--;
  }
  return res;
}

/** テンパイ時の待ち（手牌で4枚使い切っている牌は除く） */
export function waits(counts: number[], melds: number): number[] {
  const res: number[] = [];
  for (let k = 0; k < NUM_KINDS; k++) {
    if (counts[k] >= 4) continue;
    counts[k]++;
    if (shanten(counts, melds) === -1) res.push(k);
    counts[k]--;
  }
  return res;
}
