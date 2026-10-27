import { describe, expect, it } from 'vitest';
import { CALL_SEEDS, buildCallQuiz, generateCallQuiz } from './callquiz';
import { LESSONS } from './lecture';
import { idsToCounts, parseKinds } from './tile';

describe('鳴き判断クイズのシード', () => {
  it('全シードがエンジン判定と一致して構築できる', () => {
    for (const seed of CALL_SEEDS) {
      const q = buildCallQuiz(seed);
      expect(q, `シード「${seed.note}」が構築できませんでした`).not.toBeNull();
      expect(q!.answer.type).toBe(seed.expect);
      expect(q!.options.length).toBeGreaterThan(0);
      expect(q!.hand).toHaveLength(13 - (seed.melds?.length ?? 0) * 3);
    }
  });

  it('全シードで同種の牌が4枚を超えない', () => {
    for (const seed of CALL_SEEDS) {
      const q = buildCallQuiz(seed)!;
      const all = [
        ...q.hand,
        ...q.melds.flatMap((m) => m.tiles),
        ...q.river,
        q.discardTile,
      ];
      const counts = idsToCounts(all);
      const ind = idsToCounts(q.doraIndicators.map((k) => k * 4));
      for (let k = 0; k < 34; k++) {
        expect(counts[k] + ind[k], `シード「${seed.note}」の kind ${k}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it('鳴くが正解のシードは、鳴いた後に役が残り向聴が進む（明槓を除く）', () => {
    for (const seed of CALL_SEEDS.filter((s) => s.expect === 'call')) {
      const q = buildCallQuiz(seed)!;
      expect(q.after!.path).not.toBe('役なし');
      const opt = q.options[(q.answer as { optionIndex: number }).optionIndex];
      if (opt.type !== 'minkan') expect(q.after!.s).toBeLessThan(q.before.s);
    }
  });

  it('ランダム生成でも常に妥当な問題が返る', () => {
    let n = 0;
    const rand = () => {
      n = (n * 9301 + 49297) % 233280;
      return n / 233280;
    };
    for (let i = 0; i < 20; i++) {
      const q = generateCallQuiz(rand);
      expect(q.options.length).toBeGreaterThan(0);
      expect(q.axes).toHaveLength(5);
    }
  });
});

describe('鳴き講義の例題', () => {
  it('全レッスンの例題の手牌が合法（13枚・同種4枚まで）', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(7);
    for (const lesson of LESSONS) {
      expect(lesson.sections.length).toBeGreaterThan(0);
      const examples = lesson.sections.flatMap((s) => (s.example ? [s.example] : []));
      expect(examples.length, `${lesson.title} に例題がありません`).toBeGreaterThan(0);
      for (const ex of examples) {
        const kinds = parseKinds(ex.hand);
        expect(kinds, `${lesson.title}: ${ex.hand}`).toHaveLength(13 - (ex.melds?.length ?? 0) * 3);
        const counts = new Array(34).fill(0);
        for (const k of kinds) counts[k]++;
        for (const m of ex.melds ?? []) for (const k of parseKinds(m.tiles)) counts[k]++;
        expect(Math.max(...counts), `${lesson.title}: ${ex.hand}`).toBeLessThanOrEqual(4);
      }
    }
  });
});
