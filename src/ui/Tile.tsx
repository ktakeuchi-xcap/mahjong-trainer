import { memo } from 'react';
import { isRed, kindName, kindOf } from '../engine/tile';

const BLUE = '#1f5fa8';
const GREEN = '#2e7d32';
const RED = '#c62828';
const INK = '#1d2433';

const KANJI_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONORS = ['東', '南', '西', '北', '', '發', '中'];

type Dot = [number, number, number, string];

function pinDots(n: number, red: boolean): Dot[] {
  const r5 = red ? RED : BLUE;
  switch (n) {
    case 1: return [[15, 20, 9, RED]];
    case 2: return [[15, 11, 5.5, GREEN], [15, 29, 5.5, BLUE]];
    case 3: return [[8, 10, 4.6, BLUE], [15, 20, 4.6, RED], [22, 30, 4.6, GREEN]];
    case 4: return [[9, 12, 5, BLUE], [21, 12, 5, GREEN], [9, 28, 5, GREEN], [21, 28, 5, BLUE]];
    case 5: return [[8.5, 10, 4.4, r5], [21.5, 10, 4.4, red ? RED : GREEN], [15, 20, 4.4, RED], [8.5, 30, 4.4, red ? RED : GREEN], [21.5, 30, 4.4, r5]];
    case 6: return [[9, 9, 4.2, GREEN], [21, 9, 4.2, GREEN], [9, 21, 4.2, RED], [21, 21, 4.2, RED], [9, 32, 4.2, RED], [21, 32, 4.2, RED]];
    case 7: return [[7, 7, 3.6, GREEN], [15, 10.5, 3.6, GREEN], [23, 14, 3.6, GREEN], [9.5, 24, 3.6, RED], [20.5, 24, 3.6, RED], [9.5, 33, 3.6, RED], [20.5, 33, 3.6, RED]];
    case 8: return [8, 16.5, 25, 33.5].flatMap((y): Dot[] => [[9.5, y, 3.7, BLUE], [20.5, y, 3.7, BLUE]]);
    default: return [9, 20, 31].flatMap((y, i): Dot[] => [7, 15, 23].map((x): Dot => [x, y, 3.5, [BLUE, RED, GREEN][i]]));
  }
}

type Stick = [number, number, string]; // 中心x, 中心y, 色

function souSticks(n: number, red: boolean): { sticks: Stick[]; h: number } {
  const g = red ? RED : GREEN;
  switch (n) {
    case 2: return { sticks: [[15, 11, g], [15, 29, g]], h: 13 };
    case 3: return { sticks: [[15, 11, g], [9, 29, g], [21, 29, g]], h: 13 };
    case 4: return { sticks: [[9, 11, g], [21, 11, g], [9, 29, g], [21, 29, g]], h: 13 };
    case 5: return { sticks: [[8, 11, g], [22, 11, g], [15, 20, RED], [8, 29, g], [22, 29, g]], h: 12 };
    case 6: return { sticks: [7, 15, 23].flatMap((x): Stick[] => [[x, 11, g], [x, 29, g]]), h: 13 };
    case 7: return { sticks: [[15, 8, RED], ...[7, 15, 23].flatMap((x): Stick[] => [[x, 21, g], [x, 32, g]])], h: 9 };
    case 8: return { sticks: [6, 12, 18, 24].flatMap((x): Stick[] => [[x, 11, g], [x, 29, g]]), h: 13 };
    default: return { sticks: [7, 15, 23].flatMap((x, i): Stick[] => [8.5, 20, 31.5].map((y): Stick => [x, y, i === 1 ? RED : g])), h: 9.5 };
  }
}

function Face({ kind, red }: { kind: number; red: boolean }) {
  if (kind < 9) {
    const n = kind + 1;
    return (
      <g fontFamily="'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif" textAnchor="middle" fontWeight={700}>
        <text x={15} y={17} fontSize={13} fill={red ? RED : INK}>{KANJI_NUM[n - 1]}</text>
        <text x={15} y={34.5} fontSize={14} fill={RED}>萬</text>
      </g>
    );
  }
  if (kind < 18) {
    return (
      <g>
        {pinDots(kind - 8, red).map(([x, y, r, c], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth={r > 6 ? 2.2 : 1.4} />
            <circle cx={x} cy={y} r={r * 0.42} fill={c} />
          </g>
        ))}
      </g>
    );
  }
  if (kind < 27) {
    const n = kind - 17;
    if (n === 1) {
      return (
        <g>
          <ellipse cx={15} cy={23} rx={7} ry={9} fill={GREEN} />
          <path d="M15 14 L10 6 L15 9 L20 6 Z" fill={BLUE} />
          <circle cx={15} cy={12} r={3.2} fill={RED} />
          <path d="M11 30 L15 36 L19 30 Z" fill={red ? RED : '#8a5a2b'} />
        </g>
      );
    }
    const { sticks, h } = souSticks(n, red);
    const w = n === 8 ? 3.2 : 3.6;
    return (
      <g>
        {sticks.map(([x, y, c], i) => (
          <g key={i}>
            <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={1.6} fill={c} />
            <line x1={x - w / 2} x2={x + w / 2} y1={y} y2={y} stroke="#fff" strokeWidth={0.7} opacity={0.8} />
          </g>
        ))}
      </g>
    );
  }
  if (kind === 31) {
    return <rect x={7.5} y={9} width={15} height={22} rx={2} fill="none" stroke={BLUE} strokeWidth={1.8} />;
  }
  const color = kind === 32 ? GREEN : kind === 33 ? RED : INK;
  return (
    <text x={15} y={28} fontSize={20} textAnchor="middle" fontWeight={700} fill={color}
      fontFamily="'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif">
      {HONORS[kind - 27]}
    </text>
  );
}

export interface TileProps {
  id?: number;
  kind?: number;
  size?: number; // 幅px（省略時はCSS変数）
  className?: string;
  onClick?: () => void;
  rotated?: boolean;
  title?: string;
}

export const Tile = memo(function Tile({ id, kind, size, className, onClick, rotated, title }: TileProps) {
  const k = kind ?? kindOf(id!);
  const red = id !== undefined && isRed(id);
  const style = size ? { width: rotated ? size * 4 / 3 : size } : undefined;
  const label = title ?? `${kindName(k)}${red ? '（赤）' : ''}`;
  const body = (
    <>
      <rect x={0.75} y={0.75} width={28.5} height={38.5} rx={3.5} className="tile-body" />
      <Face kind={k} red={red} />
      {red && <circle cx={26} cy={4} r={1.6} fill={RED} />}
    </>
  );
  const svg = rotated ? (
    <svg viewBox="0 0 40 30" className="tile-svg" aria-hidden>
      <g transform="translate(40 0) rotate(90)">{body}</g>
    </svg>
  ) : (
    <svg viewBox="0 0 30 40" className="tile-svg" aria-hidden>{body}</svg>
  );
  const cls = `tile${rotated ? ' rotated' : ''}${onClick ? ' clickable' : ''} ${className ?? ''}`;
  if (onClick) {
    return (
      <button type="button" className={cls} style={style} onClick={onClick} aria-label={label} title={label}>
        {svg}
      </button>
    );
  }
  return <span className={cls} style={style} title={label}>{svg}</span>;
});
