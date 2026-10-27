// 牌の表現
// kind: 0-8 萬子 / 9-17 筒子 / 18-26 索子 / 27-30 東南西北 / 31-33 白發中
// id:   0-135（kind = id >> 2）。各5の0枚目を赤ドラとする

export const NUM_KINDS = 34;
export const EAST = 27;
export const HAKU = 31;
export const HATSU = 32;
export const CHUN = 33;

export const kindOf = (id: number): number => id >> 2;
export const isRed = (id: number): boolean =>
  (id & 3) === 0 && (id >> 2 === 4 || id >> 2 === 13 || id >> 2 === 22);

export const suitOf = (k: number): number => (k < 27 ? Math.floor(k / 9) : 3);
export const numOf = (k: number): number => (k < 27 ? (k % 9) + 1 : 0);
export const isHonor = (k: number): boolean => k >= 27;
export const isTerminal = (k: number): boolean => k < 27 && (k % 9 === 0 || k % 9 === 8);
export const isYaochu = (k: number): boolean => isHonor(k) || isTerminal(k);
export const isDragon = (k: number): boolean => k >= 31;
export const isWind = (k: number): boolean => k >= 27 && k <= 30;

export const YAOCHU_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

const SUIT_CHARS = ['m', 'p', 's'];
const HONOR_NAMES = ['東', '南', '西', '北', '白', '發', '中'];
const SUIT_NAMES = ['萬', '筒', '索'];

/** 表示用の名前（例：5萬、東） */
export function kindName(k: number): string {
  if (k >= 27) return HONOR_NAMES[k - 27];
  return `${numOf(k)}${SUIT_NAMES[suitOf(k)]}`;
}

/** 短い表記（例：5m, 東） */
export function kindShort(k: number): string {
  if (k >= 27) return HONOR_NAMES[k - 27];
  return `${numOf(k)}${SUIT_CHARS[suitOf(k)]}`;
}

export const WIND_NAMES = ['東', '南', '西', '北'];

/** ドラ表示牌からドラの種類を求める */
export function doraFromIndicator(k: number): number {
  if (k < 27) return k % 9 === 8 ? k - 8 : k + 1;
  if (k <= 30) return k === 30 ? 27 : k + 1;
  return k === 33 ? 31 : k + 1;
}

/** "123m456p789s11z" 形式から kind 配列へ（z: 1-7 = 東南西北白發中） */
export function parseKinds(s: string): number[] {
  const out: number[] = [];
  let buf: number[] = [];
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') buf.push(Number(ch));
    else {
      const base = ch === 'm' ? 0 : ch === 'p' ? 9 : ch === 's' ? 18 : 27;
      for (const n of buf) out.push(ch === 'z' ? base + n - 1 : base + (n === 0 ? 5 : n) - 1);
      buf = [];
    }
  }
  return out;
}

export function toCounts(kinds: number[]): number[] {
  const c = new Array(NUM_KINDS).fill(0);
  for (const k of kinds) c[k]++;
  return c;
}

export function idsToCounts(ids: number[]): number[] {
  const c = new Array(NUM_KINDS).fill(0);
  for (const id of ids) c[id >> 2]++;
  return c;
}

/** kind 配列に牌idを割り当てる（同じ kind は連番、5の1枚目は赤になる） */
export class IdAssigner {
  private used = new Array(NUM_KINDS).fill(0);
  assign(kinds: number[]): number[] {
    return kinds.map((k) => k * 4 + (this.used[k]++ % 4));
  }
  countOf(k: number): number {
    return this.used[k];
  }
}

/** 理牌順（kind→赤を先に） */
export function sortIds(ids: number[]): number[] {
  return [...ids].sort((a, b) => a - b);
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
