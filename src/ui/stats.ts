import type { Rating } from '../engine/eval';

export interface Stats {
  quiz: { answered: number; best: number; good: number; bad: number; streak: number; bestStreak: number };
  game: { games: number; decisions: number; best: number; good: number; bad: number; results: { date: string; length: string; rank: number; points: number; match: number }[] };
}

const KEY = 'mahjong-trainer-stats-v1';

const empty = (): Stats => ({
  quiz: { answered: 0, best: 0, good: 0, bad: 0, streak: 0, bestStreak: 0 },
  game: { games: 0, decisions: 0, best: 0, good: 0, bad: 0, results: [] },
});

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const s = JSON.parse(raw);
    const e = empty();
    return { quiz: { ...e.quiz, ...s.quiz }, game: { ...e.game, ...s.game } };
  } catch {
    return empty();
  }
}

function save(s: Stats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できない環境では記録しない
  }
}

const key = (r: Rating) => (r === '最善' ? 'best' : r === '次善' ? 'good' : 'bad');

export function recordQuiz(r: Rating): Stats {
  const s = loadStats();
  s.quiz.answered++;
  s.quiz[key(r)]++;
  s.quiz.streak = r === '最善' ? s.quiz.streak + 1 : 0;
  s.quiz.bestStreak = Math.max(s.quiz.bestStreak, s.quiz.streak);
  save(s);
  return s;
}

export function recordGame(ratings: Rating[], length: string, rank: number, points: number): Stats {
  const s = loadStats();
  s.game.games++;
  for (const r of ratings) {
    s.game.decisions++;
    s.game[key(r)]++;
  }
  const match = ratings.length ? Math.round((ratings.filter((r) => r === '最善').length / ratings.length) * 100) : 0;
  s.game.results = [{ date: new Date().toISOString().slice(0, 10), length, rank, points, match }, ...s.game.results].slice(0, 30);
  save(s);
  return s;
}

export function resetStats(): Stats {
  const s = empty();
  save(s);
  return s;
}
