import { useMemo, useState } from 'react';
import { Quiz, generateQuiz } from '../engine/quiz';
import { Candidate, Rating, describeCandidate, rateChoice, shantenLabel } from '../engine/eval';
import { WIND_NAMES, kindOf, kindShort } from '../engine/tile';
import { Tile } from './Tile';
import { recordQuiz, loadStats } from './stats';

const ratingClass = (r: Rating) => (r === '最善' ? 'best' : r === '次善' ? 'good' : 'bad');

export function CandidateTable({ candidates, chosenKind, showDanger }: { candidates: Candidate[]; chosenKind?: number; showDanger?: boolean }) {
  return (
    <table className="cand-table">
      <thead>
        <tr>
          <th>打牌</th>
          <th>向聴</th>
          <th className="num">受け入れ</th>
          {showDanger && <th>危険度</th>}
          <th>有効牌</th>
        </tr>
      </thead>
      <tbody>
        {candidates.map((c, i) => (
          <tr key={c.kind} className={`${i === 0 ? 'is-best' : ''} ${c.kind === chosenKind ? 'is-chosen' : ''}`}>
            <td><Tile id={c.tile} /></td>
            <td>{shantenLabel(c.shanten)}</td>
            <td className="num">{c.ukeire.length}種{c.ukeireCount}枚</td>
            {showDanger && <td className="small">{c.dangerLabel}</td>}
            <td>
              <div className="uk">
                {c.ukeire.map((u) => <Tile key={u.kind} kind={u.kind} />)}
              </div>
              {c.notes.length > 0 && <div className="small muted">{c.notes.join('・')}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function QuizView() {
  const [quiz, setQuiz] = useState<Quiz>(() => generateQuiz());
  const [selected, setSelected] = useState<number | null>(null);
  const [answer, setAnswer] = useState<number | null>(null);
  const [stats, setStats] = useState(loadStats);
  const [session, setSession] = useState({ n: 0, ok: 0 });

  const result = useMemo(() => (answer === null ? null : rateChoice(quiz.evaluation, kindOf(answer))), [answer, quiz]);

  const submit = (id: number) => {
    if (answer !== null) return;
    setAnswer(id);
    const r = rateChoice(quiz.evaluation, kindOf(id));
    setStats(recordQuiz(r.rating));
    setSession((s) => ({ n: s.n + 1, ok: s.ok + (r.rating === '最善' ? 1 : 0) }));
  };

  const onTile = (id: number) => {
    if (answer !== null) return;
    if (selected === id) submit(id);
    else setSelected(id);
  };

  const next = () => {
    setQuiz(generateQuiz());
    setSelected(null);
    setAnswer(null);
  };

  const best = quiz.evaluation.candidates[0];
  const others = quiz.evaluation.candidates.filter((c) => c.shanten === best.shanten).length;

  return (
    <div>
      <div className="card">
        <div className="quiz-meta">
          <span>{WIND_NAMES[quiz.roundWind - 27]}場・{WIND_NAMES[quiz.seatWind - 27]}家</span>
          <span>{quiz.turn}巡目</span>
          <span className="dora">ドラ表示 <Tile kind={quiz.doraIndicator} /></span>
          <span>今回 {session.ok}/{session.n}・連続正解 {stats.quiz.streak}</span>
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          最も牌効率の良い1枚を選んでください。タップで選択、もう一度タップ（または「これを切る」）で解答します。
        </p>
        <div className="hand" role="group" aria-label="手牌">
          {quiz.hand.map((id) => {
            let cls = '';
            if (selected === id && answer === null) cls = 'selected';
            if (answer !== null) {
              if (kindOf(id) === best.kind) cls = 'hint';
              if (id === answer) cls += ' selected';
            }
            return <Tile key={id} id={id} className={cls} onClick={() => onTile(id)} />;
          })}
        </div>
        {answer === null && (
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={selected === null} onClick={() => selected !== null && submit(selected)}>
              {selected !== null ? `打${kindShort(kindOf(selected))}　これを切る` : '切る牌を選択'}
            </button>
            <button className="btn" onClick={next}>別の問題</button>
          </div>
        )}
      </div>

      {result && (
        <div className={`card advice ${ratingClass(result.rating)}`}>
          <div className="head">
            <span className={`verdict ${ratingClass(result.rating)}`}>
              {result.rating === '最善' ? '正解' : result.rating === '次善' ? '次善手' : '不正解'}
            </span>
            <span>正解は 打</span><Tile id={best.tile} />
          </div>
          <p><b>打{kindShort(best.kind)}</b>：{describeCandidate(best, 'attack')}</p>
          {result.chosen && result.chosen.kind !== best.kind && (
            <p>あなたの <b>打{kindShort(result.chosen.kind)}</b>：{describeCandidate(result.chosen, 'attack')}</p>
          )}
          <p className="small muted">
            {shantenLabel(best.shanten)}を保てる打牌は{others}通り。その中で次のツモで向聴数が進む牌（有効牌）の残り枚数が最も多い打牌を正解としています。
            同じ枚数ならドラ・赤・役牌を残し、字牌→1・9牌→2・8牌の順に先に切ります。
          </p>
          <CandidateTable candidates={quiz.evaluation.candidates} chosenKind={result.chosen?.kind} />
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn primary block" onClick={next}>次の問題</button>
          </div>
        </div>
      )}
    </div>
  );
}
