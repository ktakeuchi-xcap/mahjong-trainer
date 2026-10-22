import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { stepCPU } from './ai';

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('CPU同士の対局シミュレーション', () => {
  it('半荘を最後まで進められ、点棒の合計が保たれる', () => {
    const stats = { wins: 0, draws: 0, rounds: 0, calls: 0, riichi: 0 };
    for (let seed = 1; seed <= 12; seed++) {
      const g = new Game({ length: 'hanchan', cpuOnly: true }, mulberry32(seed));
      let guard = 0;
      while (g.phase !== 'gameEnd') {
        if (++guard > 20000) throw new Error('進行が止まった seed=' + seed);
        if (g.phase === 'roundEnd') {
          const total = g.players.reduce((a, p) => a + p.points, 0) + g.sticks * 1000;
          expect(total).toBe(100000);
          stats.rounds++;
          if (g.result!.kind === 'win') stats.wins++; else stats.draws++;
          g.nextRound();
          continue;
        }
        const moved = stepCPU(g);
        if (!moved) throw new Error('CPUが行動しない phase=' + g.phase);
      }
      for (const e of g.events) {
        if (e.type === 'call') stats.calls++;
        if (e.type === 'riichi') stats.riichi++;
      }
      const total = g.players.reduce((a, p) => a + p.points, 0);
      expect(total).toBe(100000);
    }
    console.log(stats);
    expect(stats.wins).toBeGreaterThan(stats.rounds * 0.4);
  }, 120000);
});
