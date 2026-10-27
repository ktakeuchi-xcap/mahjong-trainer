import { useMemo, useState } from 'react';
import { LESSONS, LectureExample } from '../engine/lecture';
import { IdAssigner, parseKinds, sortIds } from '../engine/tile';
import { Meld } from '../engine/score';
import { Tile } from './Tile';

function ExampleHand({ ex }: { ex: LectureExample }) {
  const { hand, melds } = useMemo(() => {
    const asg = new IdAssigner();
    const hand = sortIds(asg.assign(parseKinds(ex.hand)));
    const melds: Meld[] = (ex.melds ?? []).map((m) => {
      const tiles = asg.assign(parseKinds(m.tiles));
      return { type: m.type, tiles, called: tiles[tiles.length - 1] };
    });
    return { hand, melds };
  }, [ex]);
  const discardKind = ex.discard ? parseKinds(ex.discard)[0] : null;
  return (
    <figure className="lecture-example">
      <div className="hand mini" aria-label="例の手牌">
        {hand.map((id) => <Tile key={id} id={id} />)}
        {melds.map((m, i) => (
          <span key={i} className="meld" style={{ marginLeft: 8 }}>
            {m.tiles.map((t) => <Tile key={t} id={t} rotated={t === m.called} />)}
          </span>
        ))}
      </div>
      {ex.caption && (
        <figcaption className="small muted" style={{ marginTop: 6 }}>
          {ex.caption}
          {discardKind !== null && (
            <span className="lecture-discard">　捨て牌 <Tile kind={discardKind} /></span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

export function LectureView({ onGoQuiz }: { onGoQuiz: () => void }) {
  const [current, setCurrent] = useState<number | null>(null);

  if (current === null) {
    return (
      <div>
        <div className="card">
          <h2>鳴き講義</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            「鳴くべきか」を判断する基準を、7つのレッスンで体系的に学びます。各レッスンは短い説明と手牌の例で構成されています。読み終えたら鳴きクイズで実践しましょう。
          </p>
        </div>
        {LESSONS.map((l, i) => (
          <button key={l.id} className="card menu-card" onClick={() => setCurrent(i)}>
            <div className="title">レッスン{i + 1}　{l.title}</div>
            <p className="small muted">{l.intro}</p>
          </button>
        ))}
      </div>
    );
  }

  const lesson = LESSONS[current];
  const isLast = current === LESSONS.length - 1;
  return (
    <div>
      <div className="card">
        <p className="small muted" style={{ margin: 0 }}>レッスン{current + 1} / {LESSONS.length}</p>
        <h2 style={{ marginTop: 4 }}>{lesson.title}</h2>
        <p>{lesson.intro}</p>
        {lesson.sections.map((sec) => (
          <section key={sec.heading}>
            <h3>{sec.heading}</h3>
            {sec.body.map((p, i) => <p key={i}>{p}</p>)}
            {sec.example && <ExampleHand ex={sec.example} />}
          </section>
        ))}
        <div className="lecture-key">
          <span className="lecture-key-label">ポイント</span>
          <p style={{ margin: 0 }}>{lesson.keyPoint}</p>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn" onClick={() => setCurrent(null)}>一覧へ戻る</button>
        {current > 0 && <button className="btn" onClick={() => setCurrent(current - 1)}>前のレッスン</button>}
        {!isLast && <button className="btn primary" onClick={() => setCurrent(current + 1)}>次のレッスン</button>}
        {isLast && <button className="btn primary" onClick={onGoQuiz}>鳴きクイズに挑戦</button>}
      </div>
    </div>
  );
}
