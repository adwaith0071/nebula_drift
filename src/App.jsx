import { useEffect, useRef, useState } from 'react';
import { Game } from './game/engine.js';
import Hud from './components/Hud.jsx';
import { GameOverScreen, MenuScreen, PauseScreen } from './components/Screens.jsx';

const BEST_KEY = 'nebula-drift-best';

const INITIAL_HUD = {
  score: 0,
  hp: 100,
  maxHp: 100,
  wave: 0,
  kills: 0,
  mult: 1,
  comboT: 0,
  triple: 0,
  rapid: 0,
  shield: 0,
  dash: 1,
  boss: null,
};

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export default function App() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const bestRef = useRef(loadBest());
  const [mode, setMode] = useState('menu');
  const [hud, setHud] = useState(INITIAL_HUD);
  const [banner, setBanner] = useState(null);
  const [result, setResult] = useState(null);
  const [best, setBest] = useState(bestRef.current);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const game = new Game(canvasRef.current, {
      onMode: setMode,
      onHud: setHud,
      onWave: (n, boss) => setBanner({ n, boss, id: `${n}-${Date.now()}` }),
      onGameOver: (r) => {
        const isBest = r.score > bestRef.current;
        if (isBest) {
          bestRef.current = r.score;
          setBest(r.score);
          try {
            localStorage.setItem(BEST_KEY, String(r.score));
          } catch {
            // storage unavailable (private mode): the score just won't persist
          }
        }
        setResult({ ...r, isBest });
      },
    });
    gameRef.current = game;
    return () => game.destroy();
  }, []);

  const start = () => {
    setHud(INITIAL_HUD);
    setBanner(null);
    gameRef.current?.start();
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    gameRef.current?.setMuted(next);
  };

  const inGame = mode === 'playing' || mode === 'paused';

  return (
    <div className={`app ${mode}`}>
      <canvas ref={canvasRef} />

      {inGame && (
        <Hud
          hud={hud}
          best={best}
          muted={muted}
          onPause={() => gameRef.current?.togglePause()}
          onMute={toggleMute}
        />
      )}

      {inGame && banner && (
        <div
          key={banner.id}
          className={`wave-banner ${banner.boss ? 'boss' : ''}`}
          onAnimationEnd={() => setBanner(null)}
        >
          <span className="wave-banner-sub">{banner.boss ? 'WARNING · WARDEN INBOUND' : 'INCOMING'}</span>
          <span className="wave-banner-main">WAVE {String(banner.n).padStart(2, '0')}</span>
        </div>
      )}

      {mode === 'menu' && <MenuScreen best={best} onStart={start} />}
      {mode === 'paused' && (
        <PauseScreen onResume={() => gameRef.current?.togglePause()} onQuit={() => gameRef.current?.toMenu()} />
      )}
      {mode === 'over' && result && (
        <GameOverScreen result={result} best={best} onRetry={start} onMenu={() => gameRef.current?.toMenu()} />
      )}
    </div>
  );
}
