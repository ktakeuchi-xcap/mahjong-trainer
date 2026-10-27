import { useState } from 'react';
import { CallQuiz, generateCallQuiz } from '../engine/callquiz';
import { shantenLabel } from '../engine/eval';
import { WIND_NAMES } from '../engine/tile';
import { Tile } from './Tile';
import { loadStats, recordCall } from './stats';

type Pick = number | 'pass';

export function CallQuizView() {
  const [quiz, setQuiz] = useState<CallQuiz>(() => generateCallQuiz());
  const [picked, setPicked] = useState<Pick | null>(null);
  const [stats, setStats] = useState(loadStats);
  const [session, setSession] = useState({ n: 0, ok: 0 });

  const answered = picked !== null;
  const correct = answered && (quiz.answer.type === 'pass'
    ? picked === 'pass'
    : picked === quiz.answer.optionIndex);

  const choose = (p: Pick) => {
    if (answered) return;
    setPicked(p);
    const ok = quiz.answer.type === 'pass' ? p === 'pass' : p === quiz.answer.optionIndex;
    setStats(recordCall(ok));
    setSession((s) => ({ n: s.n + 1, ok: s.ok + (ok ? 1 : 0) }));
  };

  const next = () => {
    setQuiz(generateCallQuiz());
    setPicked(null);
  };

  return (
    <div>
      <div className="card">
        <div className="quiz-meta">
          <span>{WIND_NAMES[quiz.roundWind - 27]}場・{WIND_NAMES[quiz.seatWind - 27]}家</span>
          <span>{quiz.turn}巡目</span>
          <span className="dora">ドラ表示 {quiz.doraIndicators.map((k) => <Tile key={k} kind={k} />)}</span>
          <span>今回 {session.ok}/{session.n}・連続正解 {stats.call.streak}</span>
        </div>
        <p className="small" style={{ margin: '8px 0 0' }}>{quiz.note}</p>
        {quiz.riichi && <p className="call-riichi">⚠ 他家がリーチ中です</p>}
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          {quiz.discardFrom}の捨て牌（右端が打牌）です。この牌を鳴きますか？
        </p>
        <div className="river" aria-label={`${quiz.discardFrom}の捨て牌`}>
          {quiz.river.map((id, i) => <Tile key={`${id}-${i}`} id={id} />)}
          <Tile id={quiz.discardTile} rotated className="call-target" />
        </div>
        <div className="hand" aria-label="手牌">
          {quiz.hand.map((id) => <Tile key={id} id={id} />)}
          {quiz.melds.length > 0 && (
            <span className="melds" style={{ marginLeft: 8 }}>
              {quiz.melds.map((m, i) => (
                <span key={i} className="meld">
                  {m.tiles.map((t) => <Tile key={t} id={t} rotated={t === m.called} />)}
                </span>
              ))}
            </span>
          )}
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          現在は{shantenLabel(quiz.before.s)}（狙い：{quiz.before.path}）
        </p>
        {!answered && (
          <div className="call-choices">
            {quiz.options.map((opt, i) => (
              <button key={i} className="btn" onClick={() => choose(i)}>
                {opt.label}
                <span className="call-opt-tiles">
                  {opt.tiles.map((t) => <Tile key={t} id={t} />)}
                  <span className="call-plus">＋</span>
                  <Tile id={quiz.discardTile} />
                </span>
              </button>
            ))}
            <button className="btn primary" onClick={() => choose('pass')}>鳴かない（スルー）</button>
            <button className="btn" onClick={next}>別の問題</button>
          </div>
        )}
      </div>

      {answered && (
        <div className={`card advice ${correct ? 'best' : 'bad'}`}>
          <div className="head">
            <span className={`verdict ${correct ? 'best' : 'bad'}`}>{correct ? '正解' : '不正解'}</span>
            <span>
              {quiz.answer.type === 'call'
                ? <>正解は「{quiz.options[quiz.answer.optionIndex].label}」</>
                : <>正解は「鳴かない」</>}
            </span>
          </div>
          <p>{quiz.summary}</p>
          {quiz.after && (
            <p className="small muted">
              鳴いた場合の見込み：{shantenLabel(quiz.after.s)}・受け入れ{quiz.after.ukeire}枚・狙いは「{quiz.after.path}」（鳴く前は{shantenLabel(quiz.before.s)}・「{quiz.before.path}」）
            </p>
          )}
          <div className="call-axes">
            {quiz.axes.map((a) => (
              <div key={a.label} className="call-axis">
                <span className="call-axis-label">{a.label}</span>
                <p>{a.text}</p>
              </div>
            ))}
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn primary block" onClick={next}>次の問題</button>
          </div>
        </div>
      )}
    </div>
  );
}
