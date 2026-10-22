import { describe, expect, it } from 'vitest';
import { generateQuiz } from './quiz';
import { idsToCounts } from './tile';
import { shanten } from './shanten';

describe('何切る問題', () => {
  it('1〜2向聴の14枚を生成する', () => {
    const t0 = Date.now();
    for (let i = 0; i < 30; i++) {
      const q = generateQuiz();
      expect(q.hand).toHaveLength(14);
      expect(new Set(q.hand).size).toBe(14);
      const s = shanten(idsToCounts(q.hand), 0);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(2);
      expect(q.evaluation.candidates[0].ukeireCount).toBeGreaterThan(0);
    }
    expect(Date.now() - t0).toBeLessThan(15000);
  }, 30000);
});
