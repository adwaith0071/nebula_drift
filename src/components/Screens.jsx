import { useEffect, useState } from 'react';

const CONTROLS = [
  { keys: ['W', 'A', 'S', 'D'], text: 'Move' },
  { keys: ['MOUSE'], text: 'Aim' },
  { keys: ['CLICK'], text: 'Fire (hold)' },
  { keys: ['SPACE'], text: 'Dash — slices small enemies' },
  { keys: ['ESC'], text: 'Pause' },
];

function useCountUp(target, ms = 1100) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export function MenuScreen({ best, onStart }) {
  return (
    <div className="screen menu">
      <div className="menu-inner">
        <p className="eyebrow">ARENA SURVIVAL · SECTOR 7</p>
        <h1 className="title">
          <span>NEBULA</span>
          <span>DRIFT</span>
        </h1>
        <p className="tagline">Hold the line against the swarm. Chain kills. Outlast the Warden.</p>

        <button className="btn" onClick={onStart} autoFocus>
          LAUNCH
        </button>
        <p className="hint">or press ENTER</p>
        <p className="touch-hint">Drag to move · auto-aim &amp; fire · tap a second finger to dash</p>

        <div className="controls glass">
          {CONTROLS.map((c) => (
            <div className="control" key={c.text}>
              <span className="keys">
                {c.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
              <span>{c.text}</span>
            </div>
          ))}
        </div>

        {best > 0 && (
          <p className="menu-best">
            BEST <b>{best.toLocaleString()}</b>
          </p>
        )}
      </div>
    </div>
  );
}

export function PauseScreen({ onResume, onQuit }) {
  return (
    <div className="screen dim">
      <div className="card glass">
        <h2 className="card-title">PAUSED</h2>
        <div className="card-actions">
          <button className="btn" onClick={onResume} autoFocus>
            RESUME
          </button>
          <button className="btn ghost" onClick={onQuit}>
            QUIT
          </button>
        </div>
        <p className="hint">ESC to resume</p>
      </div>
    </div>
  );
}

export function GameOverScreen({ result, best, onRetry, onMenu }) {
  const score = useCountUp(result.score);
  return (
    <div className="screen dim">
      <div className="card glass">
        <p className="eyebrow danger">SHIP LOST</p>
        <h2 className="card-title">GAME OVER</h2>
        {result.isBest && <p className="new-best">★ NEW BEST ★</p>}
        <p className="final-score">{score.toLocaleString()}</p>
        <div className="stats">
          <div>
            <span className="label">WAVE</span>
            <b>{result.wave}</b>
          </div>
          <div>
            <span className="label">KILLS</span>
            <b>{result.kills}</b>
          </div>
          <div>
            <span className="label">BEST</span>
            <b>{best.toLocaleString()}</b>
          </div>
        </div>
        <div className="card-actions">
          <button className="btn" onClick={onRetry} autoFocus>
            RETRY
          </button>
          <button className="btn ghost" onClick={onMenu}>
            MENU
          </button>
        </div>
      </div>
    </div>
  );
}
