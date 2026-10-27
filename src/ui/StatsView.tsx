import { useState } from 'react';
import { loadStats, resetStats } from './stats';

function Bar({ best, good, bad }: { best: number; good: number; bad: number }) {
  const t = best + good + bad || 1;
  return (
    <div className="bar" aria-hidden>
      <span style={{ width: `${(best / t) * 100}%`, background: 'var(--best)' }} />
      <span style={{ width: `${(good / t) * 100}%`, background: 'var(--good)' }} />
      <span style={{ width: `${(bad / t) * 100}%`, background: 'var(--bad)' }} />
    </div>
  );
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

export function StatsView() {
  const [s, setS] = useState(loadStats);
  const q = s.quiz;
  const g = s.game;
  return (
    <div>
      <div className="card">
        <h2>何切るクイズ</h2>
        <div className="stat-grid">
          <div className="stat"><div className="v">{pct(q.best, q.answered)}</div><div className="l">正答率</div></div>
          <div className="stat"><div className="v">{q.answered}</div><div className="l">解答数</div></div>
          <div className="stat"><div className="v">{q.bestStreak}</div><div className="l">最高連続正解</div></div>
        </div>
        <div style={{ marginTop: 12 }}><Bar best={q.best} good={q.good} bad={q.bad} /></div>
        <p className="small muted">正解 {q.best}・次善 {q.good}・不正解 {q.bad}</p>
      </div>
      <div className="card">
        <h2>鳴き判断クイズ</h2>
        <div className="stat-grid">
          <div className="stat"><div className="v">{pct(s.call.correct, s.call.answered)}</div><div className="l">正答率</div></div>
          <div className="stat"><div className="v">{s.call.answered}</div><div className="l">解答数</div></div>
          <div className="stat"><div className="v">{s.call.bestStreak}</div><div className="l">最高連続正解</div></div>
        </div>
        <p className="small muted">正解 {s.call.correct}・不正解 {s.call.answered - s.call.correct}</p>
      </div>
      <div className="card">
        <h2>実戦</h2>
        <div className="stat-grid">
          <div className="stat"><div className="v">{pct(g.best, g.decisions)}</div><div className="l">最善手との一致率</div></div>
          <div className="stat"><div className="v">{g.games}</div><div className="l">対局数</div></div>
          <div className="stat"><div className="v">{g.results.length ? (g.results.reduce((a, r) => a + r.rank, 0) / g.results.length).toFixed(2) : '—'}</div><div className="l">平均順位</div></div>
        </div>
        <div style={{ marginTop: 12 }}><Bar best={g.best} good={g.good} bad={g.bad} /></div>
        <p className="small muted">最善 {g.best}・次善 {g.good}・悪手 {g.bad}（{g.decisions}打）</p>
        {g.results.length > 0 && (
          <table className="delta-table">
            <tbody>
              {g.results.slice(0, 10).map((r, i) => (
                <tr key={i}>
                  <td>{r.date}</td>
                  <td>{r.length === 'tonpu' ? '東風' : '半荘'}</td>
                  <td>{r.rank}位</td>
                  <td className="num">{r.points.toLocaleString()}</td>
                  <td className="num">一致 {r.match}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="small muted">記録はこの端末のブラウザにのみ保存されます。</p>
      <button className="btn sm" onClick={() => { if (confirm('成績をリセットしますか？')) setS(resetStats()); }}>成績をリセット</button>
    </div>
  );
}
