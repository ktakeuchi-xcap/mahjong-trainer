import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CallAction, Game, GameConfig, Player } from '../engine/game';
import { adviseCalls, evaluateTurn, stepCPU } from '../engine/ai';
import { Evaluation, Rating, describeCandidate, rateChoice, shantenLabel } from '../engine/eval';
import { Meld } from '../engine/score';
import { WIND_NAMES, idsToCounts, kindName, kindOf, kindShort, sortIds } from '../engine/tile';
import { shanten } from '../engine/shanten';
import { Tile } from './Tile';
import { CandidateTable } from './QuizView';
import { recordGame } from './stats';

interface Decision {
  rating: Rating;
  chosen: number; // kind
  best: number; // tile id
  bestText: string;
  chosenText: string;
  mode: string;
  modeReason: string;
  round: string;
}

const ratingClass = (r: Rating) => (r === '最善' ? 'best' : r === '次善' ? 'good' : 'bad');
const CPU_DELAY = 420;

function MeldView({ meld, owner }: { meld: Meld; owner: number }) {
  const tiles = meld.tiles;
  // 鳴いた相手の方向に横向きの牌を置く（上家=左、対面=中、下家=右）
  const rel = meld.from === undefined ? -1 : (meld.from - owner + 4) % 4;
  const calledIdx = meld.called === undefined ? -1 : rel === 3 ? 0 : rel === 2 ? 1 : tiles.length - 1;
  const others = tiles.filter((t) => t !== meld.called);
  const ordered = calledIdx < 0 ? sortIds(tiles) : (() => {
    const arr = sortIds(others);
    arr.splice(Math.min(calledIdx, arr.length), 0, meld.called!);
    return arr;
  })();
  return (
    <span className="meld" aria-label={`${{ chi: 'チー', pon: 'ポン', minkan: '明槓', ankan: '暗槓', kakan: '加槓' }[meld.type]}`}>
      {ordered.map((t, i) => {
        if (meld.type === 'ankan' && (i === 0 || i === 3)) return <span key={t} className="tile" style={{ width: 'var(--river-w)' }}><svg viewBox="0 0 30 40" className="tile-svg"><rect x={0.75} y={0.75} width={28.5} height={38.5} rx={3.5} fill="#2f6f9a" stroke="#1b4560" /></svg></span>;
        return <Tile key={t} id={t} rotated={t === meld.called} />;
      })}
    </span>
  );
}

function SeatView({ game, p, me }: { game: Game; p: number; me?: boolean }) {
  const pl: Player = game.players[p];
  const wind = game.seatWind(p);
  const isTurn = game.turn === p && game.phase === 'self';
  return (
    <div className={`seat${me ? ' me' : ''}`}>
      <div className="seat-head">
        <span className={`wind${p === game.dealer ? ' dealer' : ''}`}>{WIND_NAMES[wind - 27]}</span>
        <span>{pl.name}</span>
        <span className="pts">{pl.points.toLocaleString()}</span>
        {pl.riichi && <span className="badge">リーチ</span>}
        {isTurn && !me && <span className="badge turn">考慮中</span>}
        {!me && <span className="hidden">手牌{pl.hand.length}枚</span>}
      </div>
      <div className="seat-body">
        {pl.melds.length > 0 && (
          <div className="melds">{pl.melds.map((m, i) => <MeldView key={i} meld={m} owner={p} />)}</div>
        )}
        <div className="river" aria-label={`${pl.name}の河`}>
          {pl.discards.map((d, i) => (
            <Tile key={i} id={d.tile} rotated={d.riichi} className={d.called ? 'called' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WinHand({ hand, melds, winTile, owner }: { hand: number[]; melds: Meld[]; winTile: number; owner: number }) {
  const rest = [...hand];
  rest.splice(rest.indexOf(winTile), 1);
  return (
    <div className="win-hand">
      <span className="group">{sortIds(rest).map((t) => <Tile key={t} id={t} />)}</span>
      <span className="group"><Tile id={winTile} className="hint" /></span>
      {melds.map((m, i) => <span key={i} className="group"><MeldView meld={m} owner={owner} /></span>)}
    </div>
  );
}

export function GameView() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [length, setLength] = useState<'tonpu' | 'hanchan'>('tonpu');
  const gameRef = useRef<Game | null>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [selected, setSelected] = useState<number | null>(null);
  const [riichiMode, setRiichiMode] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [lastDecision, setLastDecision] = useState<Decision | null>(null);
  const [recorded, setRecorded] = useState(false);

  const game = gameRef.current;
  const version = game?.version ?? -1;
  const me = game ? game.humanSeat() : 0;
  const pending = game?.humanPending() ?? null;

  const start = (len: 'tonpu' | 'hanchan') => {
    const cfg: GameConfig = { length: len };
    gameRef.current = new Game(cfg);
    setConfig(cfg);
    setDecisions([]);
    setLastDecision(null);
    setSelected(null);
    setRiichiMode(false);
    setShowHint(false);
    setRecorded(false);
    force();
  };

  // CPU の進行
  useEffect(() => {
    if (!game) return;
    if (pending === null) {
      const t = setTimeout(() => {
        stepCPU(game);
        force();
      }, game.phase === 'call' ? 120 : CPU_DELAY);
      return () => clearTimeout(t);
    }
    if (pending === 'self') {
      const pl = game.players[me];
      const opts = game.selfOptions(me);
      if (pl.riichi && !opts.canTsumo && opts.ankan.length === 0) {
        const t = setTimeout(() => {
          game.actSelf(me, { type: 'discard', tile: pl.drawn! });
          force();
        }, 550);
        return () => clearTimeout(t);
      }
    }
    return undefined;
  }, [version, pending, game, me]);

  const selfOpts = useMemo(() => (game && pending === 'self' ? game.selfOptions(me) : null), [version, pending]);
  const evaluation: Evaluation | null = useMemo(
    () => (game && pending === 'self' && !game.players[me].riichi ? evaluateTurn(game, me) : null),
    [version, pending],
  );
  const callAdvice = useMemo(
    () => (game && pending === 'call' ? adviseCalls(game, me, game.pendingCalls.get(me)!) : null),
    [version, pending],
  );

  // 自分の手番でツモ牌が画面外にならないよう、手牌を右端までスクロールする
  useEffect(() => {
    if (pending === 'self' && handRef.current) handRef.current.scrollLeft = handRef.current.scrollWidth;
  }, [version, pending]);

  // 局・半荘の終了時に記録
  useEffect(() => {
    if (!game || game.phase !== 'gameEnd' || recorded) return;
    const rank = game.ranking().indexOf(me) + 1;
    recordGame(decisions.map((d) => d.rating), game.config.length, rank, game.players[me].points);
    setRecorded(true);
  }, [version]);

  if (!game || !config) {
    return (
      <div className="card">
        <h2>実戦（CPU 3人と対局）</h2>
        <p className="muted small">
          打牌のたびに、牌効率・役・安全度から見た最善手と比べて「最善／次善／悪手」を表示します。切る前に「ヒント」で最善手を確認することもできます。
        </p>
        <div className="seg" role="group" aria-label="対局の長さ" style={{ margin: '6px 0 14px' }}>
          <button className={length === 'tonpu' ? 'on' : ''} onClick={() => setLength('tonpu')}>東風戦</button>
          <button className={length === 'hanchan' ? 'on' : ''} onClick={() => setLength('hanchan')}>半荘戦</button>
        </div>
        <button className="btn primary block" onClick={() => start(length)}>対局を始める</button>
      </div>
    );
  }

  const pl = game.players[me];
  const drawn = pending === 'self' ? pl.drawn : null;
  const handSorted = drawn !== null ? sortIds(pl.hand.filter((t) => t !== drawn)) : sortIds(pl.hand);

  const legal = (id: number) => {
    if (!selfOpts) return false;
    if (riichiMode) return selfOpts.riichiTiles.includes(id);
    return selfOpts.discardable.includes(id);
  };

  const discard = (id: number) => {
    if (!selfOpts || !legal(id)) return;
    if (evaluation) {
      const r = rateChoice(evaluation, kindOf(id));
      const d: Decision = {
        rating: r.rating, chosen: kindOf(id), best: r.best.tile,
        bestText: describeCandidate(r.best, evaluation.mode),
        chosenText: r.chosen ? describeCandidate(r.chosen, evaluation.mode) : '',
        mode: evaluation.mode, modeReason: evaluation.modeReason, round: game.roundLabel(),
      };
      setDecisions((ds) => [...ds, d]);
      setLastDecision(d);
    }
    game.actSelf(me, { type: 'discard', tile: id, riichi: riichiMode });
    setSelected(null);
    setRiichiMode(false);
    setShowHint(false);
    force();
  };

  const onTile = (id: number) => {
    if (!legal(id)) return;
    if (selected === id) discard(id);
    else setSelected(id);
  };

  const call = (a: CallAction) => {
    game.actCall(me, a);
    force();
  };

  const bestTile = evaluation?.candidates[0]?.tile;
  const bestKind = bestTile !== undefined ? kindOf(bestTile) : -1;
  const myShanten = shanten(idsToCounts(pl.hand), pl.melds.length);
  const roundDecisions = decisions.filter((d) => d.round === game.roundLabel());
  const opponents = [1, 2, 3].map((d) => (me + d) % 4);

  return (
    <div>
      <div className="table">
        <div className="info">
          <span><b>{game.roundLabel()}</b>　供託{game.sticks}</span>
          <span>残り{game.wall.length}枚</span>
          <span className="dora">ドラ表示 {game.doraIndicators().map((k, i) => <Tile key={i} kind={k} />)}</span>
        </div>
        {opponents.map((p) => <SeatView key={p} game={game} p={p} />)}
        <SeatView game={game} p={me} me />
        <div className="hand" ref={handRef} role="group" aria-label="あなたの手牌">
          {handSorted.map((id) => {
            const cls = [
              selected === id ? 'selected' : '',
              showHint && kindOf(id) === bestKind ? 'hint' : '',
              pending === 'self' && !legal(id) ? 'dim' : '',
            ].join(' ');
            return <Tile key={id} id={id} className={cls} onClick={pending === 'self' ? () => onTile(id) : undefined} />;
          })}
          {drawn !== null && <span className="gap" />}
          {drawn !== null && (
            <Tile id={drawn} onClick={() => onTile(drawn)}
              className={[selected === drawn ? 'selected' : '', showHint && kindOf(drawn) === bestKind ? 'hint' : '', !legal(drawn) ? 'dim' : ''].join(' ')} />
          )}
        </div>
        {pending === 'self' && selfOpts && !pl.riichi && (
          <div className="actions">
            {selfOpts.canTsumo && <button className="btn primary" onClick={() => { game.actSelf(me, { type: 'tsumo' }); force(); }}>ツモ</button>}
            {selfOpts.riichiTiles.length > 0 && (
              <button className={`btn${riichiMode ? ' on' : ''}`} onClick={() => { setRiichiMode(!riichiMode); setSelected(null); }}>
                {riichiMode ? 'リーチ取消' : 'リーチ'}
              </button>
            )}
            {selfOpts.ankan.map((k) => <button key={`a${k}`} className="btn" onClick={() => { game.actSelf(me, { type: 'ankan', kind: k }); force(); }}>暗槓 {kindShort(k)}</button>)}
            {selfOpts.kakan.map((k) => <button key={`k${k}`} className="btn" onClick={() => { game.actSelf(me, { type: 'kakan', kind: k }); force(); }}>加槓 {kindShort(k)}</button>)}
            <button className="btn" onClick={() => setShowHint(!showHint)}>{showHint ? 'ヒントを隠す' : 'ヒント'}</button>
            <button className="btn primary" disabled={selected === null} onClick={() => selected !== null && discard(selected)}>
              {selected !== null ? `打${kindShort(kindOf(selected))}` : '切る牌を選択'}
            </button>
          </div>
        )}
        {pending === 'self' && pl.riichi && selfOpts && (
          <div className="actions">
            {selfOpts.canTsumo && <button className="btn primary" onClick={() => { game.actSelf(me, { type: 'tsumo' }); force(); }}>ツモ</button>}
            {selfOpts.ankan.map((k) => <button key={k} className="btn" onClick={() => { game.actSelf(me, { type: 'ankan', kind: k }); force(); }}>暗槓 {kindShort(k)}</button>)}
            {(selfOpts.canTsumo || selfOpts.ankan.length > 0) && (
              <button className="btn" onClick={() => { game.actSelf(me, { type: 'discard', tile: pl.drawn! }); force(); }}>ツモ切り</button>
            )}
          </div>
        )}
      </div>

      {pending === 'call' && callAdvice && (
        <div className="card call-panel">
          <h2>
            {game.kakanPending ? '槍槓できます' : `${game.players[game.lastDiscard!.player].name}の打${kindShort(kindOf(game.lastDiscard!.tile))}`}
          </h2>
          {callAdvice.map((a, i) => (
            <div className="call-opt" key={i}>
              <div>
                <div><b>{a.label}</b> {a.recommend && <span className="rec">推奨</span>}</div>
                <div className="why">{a.reason}</div>
              </div>
              <button className={`btn sm${a.recommend ? ' primary' : ''}`} onClick={() => call(a.action)}>{a.label.split(' ')[0]}</button>
            </div>
          ))}
          <div className="call-opt">
            <div className="why">鳴かずに進める（現在 {shantenLabel(myShanten)}）</div>
            <button className={`btn sm${callAdvice.some((a) => a.recommend) ? '' : ' primary'}`} onClick={() => call({ type: 'pass' })}>スキップ</button>
          </div>
        </div>
      )}

      {showHint && evaluation && pending === 'self' && (
        <div className="card advice">
          <div className="head">ヒント：最善手は 打<Tile id={evaluation.candidates[0].tile} /></div>
          {evaluation.modeReason && <p><b>{{ attack: '', push: '押し', balance: '押し引き', fold: 'ベタオリ' }[evaluation.mode]}</b>　{evaluation.modeReason}</p>}
          <p className="small muted">狙い：{evaluation.path}</p>
          <CandidateTable candidates={evaluation.candidates.slice(0, 5)} showDanger={evaluation.mode !== 'attack'} />
        </div>
      )}

      {lastDecision && (
        <div className={`card advice ${ratingClass(lastDecision.rating)}`} aria-live="polite">
          <div className="head">
            <span className={`pill ${ratingClass(lastDecision.rating)}`}>{lastDecision.rating}</span>
            <span>あなたの打{kindShort(lastDecision.chosen)}</span>
            {lastDecision.rating !== '最善' && <><span className="muted">最善は 打</span><Tile id={lastDecision.best} /></>}
          </div>
          {lastDecision.modeReason && <p className="small">{lastDecision.modeReason}</p>}
          {lastDecision.rating !== '最善' ? (
            <>
              <p><b>最善 打{kindShort(kindOf(lastDecision.best))}</b>：{lastDecision.bestText}</p>
              <p><b>あなた 打{kindShort(lastDecision.chosen)}</b>：{lastDecision.chosenText}</p>
            </>
          ) : (
            <p>{lastDecision.bestText}</p>
          )}
          <p className="small muted">この局の一致率 {roundDecisions.filter((d) => d.rating === '最善').length}/{roundDecisions.length}</p>
        </div>
      )}

      {game.phase === 'roundEnd' && game.result && (
        <RoundResultModal game={game} decisions={roundDecisions} onNext={() => { game.nextRound(); setLastDecision(null); force(); }} />
      )}
      {game.phase === 'gameEnd' && (
        <GameEndModal game={game} decisions={decisions} onRestart={() => start(game.config.length)} onQuit={() => { gameRef.current = null; setConfig(null); }} />
      )}
    </div>
  );
}

function pointText(w: { player: number; from: number | null; result: { ron: number; tsumoChild: number; tsumoDealer: number } }, game: Game) {
  const r = w.result;
  if (w.from !== null) return `${r.ron.toLocaleString()}点`;
  if (w.player === game.dealer) return `${r.tsumoChild.toLocaleString()}点オール`;
  return `${r.tsumoChild.toLocaleString()}-${r.tsumoDealer.toLocaleString()}点`;
}

function RoundResultModal({ game, decisions, onNext }: { game: Game; decisions: Decision[]; onNext: () => void }) {
  const r = game.result!;
  const bad = decisions.filter((d) => d.rating !== '最善');
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="局の結果">
      <div className="modal">
        <h2>{r.title}</h2>
        {r.wins.map((w, i) => (
          <div key={i}>
            {w.from !== null && <div className="small muted">放銃：{game.players[w.from].name}</div>}
            <WinHand hand={w.hand} melds={w.melds} winTile={w.winTile} owner={w.player} />
            <ul className="yaku-list">
              {w.result.yaku.map((y, j) => (
                <li key={j}><span>{y.name}</span><span>{y.yakuman ? '役満' : `${y.han}翻`}</span></li>
              ))}
            </ul>
            <div className="score-big">
              {w.result.yakuman ? '' : `${w.result.fu}符${w.result.han}翻 `}{w.result.label} {pointText(w, game)}
            </div>
            {w.result.fuDetail.length > 0 && !w.result.yakuman && (
              <details className="small"><summary>符の内訳</summary><ul>{w.result.fuDetail.map((f, j) => <li key={j}>{f}</li>)}</ul></details>
            )}
            <div className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
              ドラ表示 <span className="mini" style={{ display: 'inline-flex', gap: 1 }}>{game.doraIndicators().map((k, j) => <Tile key={j} kind={k} />)}</span>
              {r.uraIndicators.length > 0 && <>裏ドラ表示 <span className="mini" style={{ display: 'inline-flex', gap: 1 }}>{r.uraIndicators.map((k, j) => <Tile key={j} kind={k} />)}</span></>}
            </div>
          </div>
        ))}
        {r.kind === 'draw' && (
          <p>テンパイ：{r.tenpai.map((t, i) => (t ? game.players[i].name : null)).filter(Boolean).join('、') || 'なし（全員ノーテン）'}</p>
        )}
        <table className="delta-table">
          <tbody>
            {game.players.map((p, i) => (
              <tr key={i}>
                <td>{p.name}</td>
                <td className={`num ${r.deltas[i] > 0 ? 'plus' : r.deltas[i] < 0 ? 'minus' : ''}`}>{r.deltas[i] > 0 ? '+' : ''}{r.deltas[i].toLocaleString()}</td>
                <td className="num">{p.points.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {decisions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>この局の振り返り：最善手との一致 {decisions.length - bad.length}/{decisions.length}</h3>
            {bad.length > 0 && (
              <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
                {bad.map((d, i) => (
                  <li key={i}>
                    <span className={`pill ${ratingClass(d.rating)}`}>{d.rating}</span> 打{kindName(d.chosen)} → 最善 打{kindName(kindOf(d.best))}：{d.bestText}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div style={{ height: 12 }} />
        <button className="btn primary block" onClick={onNext}>次へ</button>
      </div>
    </div>
  );
}

function GameEndModal({ game, decisions, onRestart, onQuit }: { game: Game; decisions: Decision[]; onRestart: () => void; onQuit: () => void }) {
  const rank = game.ranking();
  const best = decisions.filter((d) => d.rating === '最善').length;
  const good = decisions.filter((d) => d.rating === '次善').length;
  const bad = decisions.length - best - good;
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label="終局">
      <div className="modal">
        <h2>終局</h2>
        <table className="delta-table">
          <tbody>
            {rank.map((p, i) => (
              <tr key={p}>
                <td>{i + 1}位</td>
                <td>{game.players[p].name}</td>
                <td className="num">{game.players[p].points.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {decisions.length > 0 && (
          <p>
            最善手との一致率 <b>{Math.round((best / decisions.length) * 100)}%</b>（最善 {best}・次善 {good}・悪手 {bad} / {decisions.length}打）
          </p>
        )}
        <div className="btn-row">
          <button className="btn primary" onClick={onRestart}>もう一度</button>
          <button className="btn" onClick={onQuit}>終了</button>
        </div>
      </div>
    </div>
  );
}
