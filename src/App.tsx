import { useState } from 'react';
import { QuizView } from './ui/QuizView';
import { GameView } from './ui/GameView';
import { StatsView } from './ui/StatsView';
import { RulesView } from './ui/RulesView';

type Tab = 'home' | 'quiz' | 'game' | 'stats' | 'rules';

const TABS: { id: Tab; label: string; ic: string }[] = [
  { id: 'home', label: 'ホーム', ic: '⌂' },
  { id: 'quiz', label: '何切る', ic: '?' },
  { id: 'game', label: '実戦', ic: '▶' },
  { id: 'stats', label: '成績', ic: '▤' },
  { id: 'rules', label: 'ルール', ic: '§' },
];

const TAB_KEY = 'mahjong-trainer-tab';

function initialTab(): Tab {
  try {
    const t = localStorage.getItem(TAB_KEY) as Tab | null;
    return t && TABS.some((x) => x.id === t) ? t : 'home';
  } catch {
    return 'home';
  }
}

export default function App() {
  const [tab, setTabState] = useState<Tab>(initialTab);
  // 対局はタブを切り替えても保持する
  const [gameMounted, setGameMounted] = useState(tab === 'game');
  const setTab = (t: Tab) => {
    setTabState(t);
    if (t === 'game') setGameMounted(true);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // 保存できなくても動作に影響しない
    }
    window.scrollTo(0, 0);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>麻雀トレーナー</h1>
          <div className="sub">牌効率・押し引き・点数を実戦形式で鍛える</div>
        </div>
      </header>

      {tab === 'home' && (
        <div className="menu-grid">
          <button className="card menu-card" onClick={() => setTab('quiz')}>
            <div className="title">何切るクイズ</div>
            <p className="small muted">14枚の手牌から最も牌効率の良い1枚を選ぶ。受け入れ枚数つきの解説で、正解の理由が分かります。</p>
          </button>
          <button className="card menu-card" onClick={() => setTab('game')}>
            <div className="title">実戦アドバイス</div>
            <p className="small muted">CPU 3人と東風戦・半荘戦。切るたびに最善手と比べて評価し、リーチ者がいるときは安全度も加味します。</p>
          </button>
          <button className="card menu-card" onClick={() => setTab('stats')}>
            <div className="title">成績</div>
            <p className="small muted">クイズの正答率と、実戦での最善手との一致率を記録します。</p>
          </button>
          <button className="card menu-card" onClick={() => setTab('rules')}>
            <div className="title">ルール・役・点数表</div>
            <p className="small muted">採用ルール、役の一覧、符の数え方と点数早見表。</p>
          </button>
        </div>
      )}
      {tab === 'quiz' && <QuizView />}
      {gameMounted && <div style={{ display: tab === 'game' ? 'block' : 'none' }}><GameView /></div>}
      {tab === 'stats' && <StatsView />}
      {tab === 'rules' && <RulesView />}

      <nav className="tabbar" aria-label="メニュー">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              <span className="ic" aria-hidden>{t.ic}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
