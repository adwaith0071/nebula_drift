const POWERS = [
  { key: 'triple', label: 'TRIPLE SHOT', color: 'var(--cyan)' },
  { key: 'rapid', label: 'RAPID FIRE', color: 'var(--amber)' },
  { key: 'shield', label: 'SHIELD', color: 'var(--violet)' },
];

// Blur after click so Space (dash) can't re-trigger a focused HUD button.
const click = (fn) => (e) => {
  e.currentTarget.blur();
  fn();
};

export default function Hud({ hud, best, muted, onPause, onMute }) {
  const hpPct = (hud.hp / hud.maxHp) * 100;
  const low = hpPct <= 30;

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-block">
          <span className="label">SCORE</span>
          <span className="score">{hud.score.toLocaleString()}</span>
          <div className={`combo ${hud.mult > 1 ? 'on' : ''}`}>
            <span className="mult">×{hud.mult}</span>
            <div className="combo-bar">
              <i style={{ transform: `scaleX(${hud.comboT})` }} />
            </div>
          </div>
        </div>

        <div className="hud-block center">
          <span className="label">WAVE</span>
          <span className="wave-num">{String(hud.wave).padStart(2, '0')}</span>
          {hud.boss != null && (
            <div className="boss">
              <span className="label">WARDEN</span>
              <div className="boss-bar">
                <i style={{ transform: `scaleX(${hud.boss})` }} />
              </div>
            </div>
          )}
        </div>

        <div className="hud-block right">
          <span className="label">BEST</span>
          <span className="best">{Math.max(best, hud.score).toLocaleString()}</span>
          <div className="hud-buttons">
            <button className="icon-btn" onClick={click(onMute)} aria-label={muted ? 'Unmute' : 'Mute'}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
                {muted ? (
                  <path d="M16 9l5 6m0-6l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                ) : (
                  <path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                )}
              </svg>
            </button>
            <button className="icon-btn" onClick={click(onPause)} aria-label="Pause">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="hud-bottom">
        <div className="hull">
          <div className="hull-head">
            <span className="label">HULL</span>
            <span className={`hull-val ${low ? 'low' : ''}`}>{Math.ceil(hud.hp)}</span>
          </div>
          <div className={`bar hull-bar ${low ? 'low' : ''}`}>
            <i style={{ transform: `scaleX(${hpPct / 100})` }} />
          </div>
          <div className="hull-head dash-head">
            <span className="label">DASH</span>
            <span className={`dash-state ${hud.dash >= 1 ? 'ready' : ''}`}>{hud.dash >= 1 ? 'READY' : '···'}</span>
          </div>
          <div className={`bar dash-bar ${hud.dash >= 1 ? 'ready' : ''}`}>
            <i style={{ transform: `scaleX(${hud.dash})` }} />
          </div>
        </div>

        <div className="powers">
          {POWERS.filter((p) => hud[p.key] > 0).map((p) => (
            <div className="power" key={p.key} style={{ '--c': p.color }}>
              <span>{p.label}</span>
              <div className="power-bar">
                <i style={{ transform: `scaleX(${hud[p.key]})` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
