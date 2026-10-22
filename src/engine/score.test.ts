import { describe, expect, it } from 'vitest';
import { parseKinds, toCounts, EAST } from './tile';
import { shanten } from './shanten';
import { scoreHand, WinContext, Meld } from './score';

// kind 配列から牌idを割り当てる（同種は0,1,2,3枚目の順。赤を避けたい場合は1枚目から）
function ids(kinds: number[], avoidRed = true): number[] {
  const used = new Map<number, number>();
  return kinds.map((k) => {
    const n = used.get(k) ?? (avoidRed ? 1 : 0);
    used.set(k, n + 1);
    return k * 4 + (n % 4);
  });
}

function ctx(hand: string, win: string, extra: Partial<WinContext> = {}): WinContext {
  const handIds = ids(parseKinds(hand));
  const wk = parseKinds(win)[0];
  return {
    hand: handIds,
    melds: [],
    winTile: handIds.find((id) => id >> 2 === wk)!,
    tsumo: false,
    seatWind: EAST + 1,
    roundWind: EAST,
    doraIndicators: [],
    dealer: false,
    ...extra,
  };
}

describe('shanten', () => {
  it('和了形は-1', () => {
    expect(shanten(toCounts(parseKinds('123m456p789s11122z')))).toBe(-1);
  });
  it('テンパイは0', () => {
    expect(shanten(toCounts(parseKinds('123m456p789s1112z')))).toBe(0);
  });
  it('七対子1向聴', () => {
    expect(shanten(toCounts(parseKinds('1133m2256p78s1234z')))).toBe(3);
    expect(shanten(toCounts(parseKinds('1133m2255p7799s12z')))).toBe(0);
  });
  it('国士テンパイ', () => {
    expect(shanten(toCounts(parseKinds('19m19p19s1234567z')))).toBe(0);
  });
  it('一般形', () => {
    expect(shanten(toCounts(parseKinds('13m468p2579s1357z')))).toBe(5);
    expect(shanten(toCounts(parseKinds('123m456p78s11z359m')))).toBe(1);
  });
});

describe('scoreHand', () => {
  it('平和ツモ 20符2翻 子 400-700', () => {
    const r = scoreHand(ctx('123m567p345s678s22p', '8s', { tsumo: true }))!;
    expect(r.fu).toBe(20);
    expect(r.yaku.map((y) => y.name)).toEqual(expect.arrayContaining(['平和', '門前清自摸和']));
    expect(r.tsumoDealer).toBe(700);
    expect(r.tsumoChild).toBe(400);
  });
  it('リーチ平和ロン 30符2翻 2000', () => {
    const r = scoreHand(ctx('123m567p345s678s22p', '6s', { riichi: true }))!;
    expect(r.fu).toBe(30);
    expect(r.han).toBe(2);
    expect(r.ron).toBe(2000);
  });
  it('ドラのみは役なし', () => {
    const r = scoreHand(ctx('123m456p789s11z333z', '3z', { doraIndicators: [EAST + 3] }));
    expect(r).toBeNull();
  });
  it('役牌 中 嵌張ロン 40符1翻 1300', () => {
    // 中中中 + 456p + 13m待ち2m + 789s + 55s
    const r = scoreHand(ctx('777z123m456p789s55s', '2m'))!;
    expect(r.yaku.map((y) => y.name)).toContain('役牌 中');
    // 20 + 門前ロン10 + 中暗刻8 + 嵌張2 = 40
    expect(r.fu).toBe(40);
    expect(r.ron).toBe(1300);
  });
  it('七対子 25符2翻 1600', () => {
    const r = scoreHand(ctx('1133m2255p7799s11z', '1z'))!;
    expect(r.fu).toBe(25);
    expect(r.ron).toBe(1600);
  });
  it('親 満貫 12000（清一色）', () => {
    const r = scoreHand(ctx('11123455678999m', '5m', { dealer: true }))!;
    expect(r.yakuman).toBe(true); // 九蓮宝燈
    const r2 = scoreHand(ctx('11122233345699m', '6m', { dealer: true }))!;
    expect(r2.yaku.map((y) => y.name)).toContain('清一色');
    expect(r2.ron).toBeGreaterThanOrEqual(18000);
  });
  it('喰いタン 30符1翻 1000', () => {
    const chi: Meld = { type: 'chi', tiles: [4 * 1 + 1, 4 * 2 + 1, 4 * 3 + 1], called: 4 * 1 + 1 };
    const c = ctx('456p678s234s55m', '5m');
    c.melds = [chi];
    const r = scoreHand(c)!;
    expect(r.yaku.map((y) => y.name)).toEqual(['断幺九']);
    expect(r.fu).toBe(30);
    expect(r.ron).toBe(1000);
  });
  it('シャンポンロンは明刻扱い（四暗刻にならない）', () => {
    // 111m 222p 333s 55z 66z ロン6z → 二暗刻 + 中? 6z=發
    const r = scoreHand(ctx('111m222p333s55z666z', '6z'))!;
    expect(r.yaku.map((y) => y.name)).toContain('三暗刻');
    expect(r.yakuman).toBe(false);
    const t = scoreHand(ctx('111m222p333s55z666z', '6z', { tsumo: true }))!;
    expect(t.yakuman).toBe(true); // 四暗刻ツモ
  });
});
