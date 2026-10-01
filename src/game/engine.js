import { Sfx } from './sfx.js';

const TAU = Math.PI * 2;
const WORLD = { w: 2800, h: 1900 };
const GRID = 100;
const SPAWN_TIME = 0.7;
const COMBO_TIME = 3;
const DASH_CD = 1.4;
const MAX_PARTICLES = 1200;
const POWER_TIME = { triple: 10, rapid: 10, shield: 8 };

const C = {
  cyan: '#5ef2ff',
  magenta: '#ff4fd8',
  violet: '#a78bfa',
  amber: '#ffc857',
  lime: '#7dffb0',
  orange: '#ff7a45',
  crimson: '#ff3b6b',
  red: '#ff5470',
  white: '#ffffff',
};

const DEFS = {
  drone: { r: 16, hp: 2, speed: 140, score: 100, color: C.magenta, cost: 1, knock: 0.04 },
  dart: { r: 13, hp: 1, speed: 310, score: 150, color: C.amber, cost: 1.5, knock: 0 },
  orb: { r: 20, hp: 5, speed: 100, score: 250, color: C.violet, cost: 3, knock: 0.02 },
  brute: { r: 34, hp: 14, speed: 64, score: 500, color: C.orange, cost: 5, knock: 0.005 },
  warden: { r: 68, hp: 130, speed: 125, score: 5000, color: C.crimson, cost: 0, knock: 0.002 },
};

const PICKUPS = {
  triple: { color: C.cyan, label: 'TRIPLE SHOT' },
  rapid: { color: C.amber, label: 'RAPID FIRE' },
  shield: { color: C.violet, label: 'SHIELD' },
  heal: { color: C.lime, label: '+30 HULL' },
};

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => ((((b - a) % TAU) + TAU + Math.PI) % TAU) - Math.PI;

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function compact(arr, keep) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) {
    const it = arr[i];
    if (keep(it)) arr[j++] = it;
  }
  arr.length = j;
}

function poly(ctx, n, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

// Pre-rendered soft glow sprites: far cheaper than shadowBlur for hundreds of particles.
const spriteCache = new Map();
function glow(color) {
  let s = spriteCache.get(color);
  if (!s) {
    s = document.createElement('canvas');
    s.width = s.height = 64;
    const g = s.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, hexA(color, 0.9));
    grad.addColorStop(0.5, hexA(color, 0.22));
    grad.addColorStop(1, hexA(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    spriteCache.set(color, s);
  }
  return s;
}

// Seamlessly tiling nebula cloud texture.
function makeNebula(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'lighter';
  const cols = ['#4a22b8', '#0f55a8', '#a3207f', '#1746a0', '#6d28c9', '#0c7f96', '#b02a5e'];
  for (let i = 0; i < 30; i++) {
    const x = rand(0, size);
    const y = rand(0, size);
    const r = rand(130, 360);
    const col = cols[i % cols.length];
    const a = rand(0.07, 0.16);
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx + r < 0 || cx - r > size || cy + r < 0 || cy - r > size) continue;
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, hexA(col, a));
        grad.addColorStop(1, hexA(col, 0));
        g.fillStyle = grad;
        g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
  }
  return c;
}

function makeStars() {
  const tints = ['#ffffff', '#cfe6ff', '#ffd9f4', '#fff3cf', '#bff6ff'];
  const layers = [
    { n: 150, f: 0.04, size: [0.7, 1.3], a: [0.25, 0.65], glow: false },
    { n: 70, f: 0.1, size: [1.1, 1.9], a: [0.45, 0.9], glow: false },
    { n: 24, f: 0.22, size: [1.4, 2.6], a: [0.6, 1], glow: true },
  ];
  return layers.map((L) => ({
    f: L.f,
    glow: L.glow,
    list: Array.from({ length: L.n }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: rand(L.size[0], L.size[1]),
      a: rand(L.a[0], L.a[1]),
      tw: rand(0.6, 2.6),
      ph: rand(0, TAU),
      color: tints[Math.floor(Math.random() * tints.length)],
    })),
  }));
}

function newPlayer() {
  return {
    x: WORLD.w / 2,
    y: WORLD.h / 2,
    vx: 0,
    vy: 0,
    r: 16,
    angle: -Math.PI / 2,
    hp: 100,
    maxHp: 100,
    alive: false,
    invuln: 0,
    fireCd: 0,
    dashCd: 0,
    dashT: 0,
    thrust: 0,
    triple: 0,
    rapid: 0,
    shield: 0,
  };
}

export class Game {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cb = callbacks;
    this.audio = new Sfx();

    this.keys = new Set();
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, down: false };
    this.touch = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
    this.touchMode = false;
    this.wantDash = false;

    this.mode = 'menu'; // menu | playing | paused | over
    this.time = 0;
    this.cam = { x: WORLD.w / 2, y: WORLD.h / 2 };
    this.nebula = makeNebula();
    this.stars = makeStars();

    this.resetWorld();
    this.spawnAmbient();
    this.resize();
    this.bind();

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ───────────────────────── lifecycle ─────────────────────────

  resetWorld() {
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.pickups = [];
    this.player = newPlayer();
    this.score = 0;
    this.kills = 0;
    this.streak = 0;
    this.comboT = 0;
    this.wave = 0;
    this.queue = [];
    this.waveActive = false;
    this.intermission = 0;
    this.spawnT = 0;
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '255,60,100';
    this.timeScale = 1;
    this.deathT = 0;
    this.hudT = 0;
  }

  spawnAmbient() {
    const types = ['drone', 'drone', 'dart', 'orb', 'brute'];
    for (let i = 0; i < 14; i++) {
      const e = this.spawnEnemy(types[i % types.length], rand(200, WORLD.w - 200), rand(200, WORLD.h - 200));
      e.spawnT = 0;
    }
  }

  start() {
    this.audio.init();
    this.resetWorld();
    this.player.alive = true;
    this.player.invuln = 1.5;
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.intermission = 1;
    this.mouse.down = false;
    this.wantDash = false;
    this.setMode('playing');
    this.ring(this.player.x, this.player.y, 220, C.cyan);
    this.burst(this.player.x, this.player.y, C.cyan, 30, 380, 0.8, 10);
    this.emitHud(true);
  }

  toMenu() {
    this.resetWorld();
    this.spawnAmbient();
    this.setMode('menu');
  }

  togglePause() {
    if (this.mode === 'playing') this.setMode('paused');
    else if (this.mode === 'paused') {
      this.last = performance.now();
      this.setMode('playing');
    }
  }

  setMuted(muted) {
    this.audio.setMuted(muted);
  }

  setMode(mode) {
    this.mode = mode;
    this.cb.onMode?.(mode);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.onTouchEnd);
    this.audio.ctx?.close?.();
  }

  // ───────────────────────── input ─────────────────────────

  bind() {
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('blur', this.onBlur);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.onTouchEnd);
    this.canvas.addEventListener('touchcancel', this.onTouchEnd);
  }

  resize = () => {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.zoom = clamp(Math.sqrt(this.W * this.H) / 1100, 0.6, 1.4);

    const { ctx, W, H } = this;
    this.bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    this.bgGrad.addColorStop(0, '#080418');
    this.bgGrad.addColorStop(0.5, '#0a0a26');
    this.bgGrad.addColorStop(1, '#04020c');
    this.vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    this.vignette.addColorStop(0, 'rgba(0,0,0,0)');
    this.vignette.addColorStop(1, 'rgba(2,0,12,0.72)');
    this.borderGrad = ctx.createLinearGradient(0, 0, WORLD.w, WORLD.h);
    this.borderGrad.addColorStop(0, C.cyan);
    this.borderGrad.addColorStop(0.5, C.violet);
    this.borderGrad.addColorStop(1, C.magenta);
  };

  onKeyDown = (e) => {
    const onButton = e.target instanceof HTMLElement && e.target.closest('button');
    const playing = this.mode === 'playing';
    if (playing && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'Space' && playing) this.wantDash = true;
    if (e.code === 'Escape' || e.code === 'KeyP') this.togglePause();
    if (e.code === 'Enter' && !onButton && (this.mode === 'menu' || this.mode === 'over')) this.start();
  };

  onKeyUp = (e) => {
    this.keys.delete(e.code);
  };

  onMouseMove = (e) => {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    this.touchMode = false;
  };

  onMouseDown = (e) => {
    if (e.button === 0) this.mouse.down = true;
    else if (e.button === 2 && this.mode === 'playing') this.wantDash = true;
  };

  onMouseUp = (e) => {
    if (e.button === 0) this.mouse.down = false;
  };

  onContextMenu = (e) => e.preventDefault();

  onBlur = () => {
    this.keys.clear();
    this.mouse.down = false;
    this.touch.active = false;
    if (this.mode === 'playing') this.togglePause();
  };

  onTouchStart = (e) => {
    e.preventDefault();
    this.touchMode = true;
    const t = e.changedTouches[0];
    if (!this.touch.active) {
      this.touch = { active: true, id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 };
    } else if (this.mode === 'playing') {
      this.wantDash = true; // second finger = dash
    }
  };

  onTouchMove = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== this.touch.id) continue;
      let dx = t.clientX - this.touch.ox;
      let dy = t.clientY - this.touch.oy;
      const l = Math.hypot(dx, dy);
      if (l > 60) {
        dx = (dx / l) * 60;
        dy = (dy / l) * 60;
      }
      this.touch.dx = dx;
      this.touch.dy = dy;
    }
  };

  onTouchEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === this.touch.id) this.touch.active = false;
    }
  };

  mouseWorld() {
    return {
      x: (this.mouse.x - this.W / 2) / this.zoom + this.cam.x,
      y: (this.mouse.y - this.H / 2) / this.zoom + this.cam.y,
    };
  }

  // ───────────────────────── effects ─────────────────────────

  burst(x, y, color, n, speed, life = 0.6, size = 10) {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = rand(0, TAU);
      const s = rand(0.15, 1) * speed;
      const l = rand(0.5, 1) * life;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: l,
        max: l,
        size: rand(0.5, 1) * size,
        color,
        drag: 3,
        spark: Math.random() < 0.35,
      });
    }
  }

  ring(x, y, maxR, color, life = 0.5) {
    this.rings.push({ x, y, maxR, color, life, max: life });
  }

  text(x, y, str, color) {
    this.texts.push({ x, y, str, color, life: 1, max: 1 });
  }

  mult() {
    return Math.min(8, 1 + Math.floor(this.streak / 4));
  }

  // ───────────────────────── spawning ─────────────────────────

  spawnEnemy(type, x, y, spawnT = SPAWN_TIME) {
    const d = DEFS[type];
    const w = Math.max(1, this.wave);
    const hpMul = type === 'warden' ? 1 + (w / 5 - 1) * 0.6 : 1 + (w - 1) * 0.05;
    const hp = Math.ceil(d.hp * hpMul);
    const e = {
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      r: d.r,
      hp,
      maxHp: hp,
      angle: rand(0, TAU),
      rot: rand(0, TAU),
      spin: rand(0.6, 1.4) * (Math.random() < 0.5 ? -1 : 1),
      seed: rand(0, TAU),
      spawnT,
      hit: 0,
      fireCd: rand(1.2, 2.4),
      pattern: 0,
      spiralT: 0,
      spiralCd: 0,
      spiralA: 0,
      wanderT: 0,
      wx: x,
      wy: y,
      dead: false,
    };
    this.enemies.push(e);
    return e;
  }

  spawnPoint() {
    const p = this.player;
    let x = 0;
    let y = 0;
    for (let i = 0; i < 24; i++) {
      x = rand(90, WORLD.w - 90);
      y = rand(90, WORLD.h - 90);
      if (Math.hypot(x - p.x, y - p.y) > 520) break;
    }
    return { x, y };
  }

  dropPickup(x, y, type) {
    if (!type) {
      const p = this.player;
      const pool = ['triple', 'rapid', 'shield', 'heal'];
      if (p.hp < 50) pool.push('heal', 'heal');
      type = pool[Math.floor(Math.random() * pool.length)];
    }
    const a = rand(0, TAU);
    this.pickups.push({ type, x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 12, rot: 0 });
  }

  enemyShot(x, y, angle, speed, color) {
    this.ebullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 6, r: 6, color });
  }

  startWave(n) {
    this.wave = n;
    const boss = n % 5 === 0;
    const pool = ['drone'];
    if (n >= 2) pool.push('dart');
    if (n >= 3) pool.push('orb');
    if (n >= 5) pool.push('brute');
    let budget = boss ? 4 + n * 1.5 : 5 + n * 3.2;
    const q = [];
    while (budget > 0) {
      const t = Math.random() < 0.35 ? 'drone' : pool[Math.floor(Math.random() * pool.length)];
      q.push(t);
      budget -= DEFS[t].cost;
    }
    if (boss) q.unshift('warden');
    this.queue = q;
    this.spawnT = 1.4;
    this.waveActive = true;
    this.cb.onWave?.(n, boss);
    this.audio.wave(boss);
  }

  // ───────────────────────── update ─────────────────────────

  loop = (now) => {
    // rAF timestamps can precede performance.now() taken at start/resume, so clamp at 0 too
    const rawDt = clamp((now - this.last) / 1000, 0, 0.034);
    this.last = now;
    if (this.mode !== 'paused') this.update(rawDt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  update(rawDt) {
    this.timeScale += (1 - this.timeScale) * (1 - Math.exp(-1.5 * rawDt));
    const dt = rawDt * this.timeScale;
    this.time += dt;
    const p = this.player;

    if (this.deathT > 0) {
      this.deathT -= rawDt;
      if (this.deathT <= 0) {
        this.cb.onGameOver?.({ score: this.score, wave: this.wave, kills: this.kills });
        this.setMode('over');
      }
    }

    if (this.mode === 'playing' && p.alive) {
      this.updatePlayer(dt);
      this.updateWaves(dt);
    }
    this.updateEnemies(dt);
    this.updateBullets(dt);
    if (p.alive) this.collide();
    this.updatePickups(dt);
    this.updateEffects(dt, rawDt);
    compact(this.enemies, (e) => !e.dead);
    this.updateCamera(rawDt);

    this.hudT -= rawDt;
    if (this.hudT <= 0 && this.mode === 'playing') this.emitHud();
  }

  emitHud(force = false) {
    if (!force && this.hudT > 0) return;
    this.hudT = 0.08;
    const p = this.player;
    const boss = this.enemies.find((e) => e.type === 'warden' && !e.dead);
    this.cb.onHud?.({
      score: this.score,
      hp: Math.max(0, p.hp),
      maxHp: p.maxHp,
      wave: this.wave,
      kills: this.kills,
      mult: this.mult(),
      comboT: clamp(this.comboT / COMBO_TIME, 0, 1),
      triple: clamp(p.triple / POWER_TIME.triple, 0, 1),
      rapid: clamp(p.rapid / POWER_TIME.rapid, 0, 1),
      shield: clamp(p.shield / POWER_TIME.shield, 0, 1),
      dash: 1 - clamp(p.dashCd / DASH_CD, 0, 1),
      boss: boss ? clamp(boss.hp / boss.maxHp, 0, 1) : null,
    });
  }

  nearestEnemy(x, y, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  updatePlayer(dt) {
    const p = this.player;
    const k = this.keys;
    let ix = 0;
    let iy = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) iy -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) iy += 1;
    if (this.touch.active) {
      ix = this.touch.dx / 60;
      iy = this.touch.dy / 60;
    }
    let il = Math.hypot(ix, iy);
    if (il > 1) {
      ix /= il;
      iy /= il;
      il = 1;
    }

    p.thrust = lerp(p.thrust, il, 1 - Math.exp(-10 * dt));
    p.vx += ix * 2000 * dt;
    p.vy += iy * 2000 * dt;
    const damp = Math.exp(-4.2 * dt);
    p.vx *= damp;
    p.vy *= damp;

    // aim: mouse on desktop, auto-target on touch
    let target = p.angle;
    let autoFire = false;
    if (this.touchMode) {
      const n = this.nearestEnemy(p.x, p.y, 750);
      if (n) {
        target = Math.atan2(n.y - p.y, n.x - p.x);
        autoFire = true;
      } else if (il > 0.2) {
        target = Math.atan2(iy, ix);
      }
    } else {
      const m = this.mouseWorld();
      target = Math.atan2(m.y - p.y, m.x - p.x);
    }
    p.angle += angDiff(p.angle, target) * (1 - Math.exp(-20 * dt));

    if (this.wantDash) {
      this.wantDash = false;
      if (p.dashCd <= 0) {
        let dx = Math.cos(p.angle);
        let dy = Math.sin(p.angle);
        if (il > 0.2) {
          dx = ix / il;
          dy = iy / il;
        }
        p.vx = dx * 1300;
        p.vy = dy * 1300;
        p.dashCd = DASH_CD;
        p.dashT = 0.22;
        p.invuln = Math.max(p.invuln, 0.3);
        this.ring(p.x, p.y, 90, C.magenta, 0.35);
        this.burst(p.x, p.y, C.magenta, 14, 260, 0.45, 9);
        this.audio.dash();
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < p.r) { p.x = p.r; p.vx = 0; }
    if (p.x > WORLD.w - p.r) { p.x = WORLD.w - p.r; p.vx = 0; }
    if (p.y < p.r) { p.y = p.r; p.vy = 0; }
    if (p.y > WORLD.h - p.r) { p.y = WORLD.h - p.r; p.vy = 0; }

    // engine trail
    if ((p.thrust > 0.15 || p.dashT > 0) && this.particles.length < MAX_PARTICLES) {
      const dashing = p.dashT > 0;
      const n = dashing ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const l = rand(0.25, 0.45);
        this.particles.push({
          x: p.x - Math.cos(p.angle) * 14 + rand(-3, 3),
          y: p.y - Math.sin(p.angle) * 14 + rand(-3, 3),
          vx: -Math.cos(p.angle) * rand(60, 160) + p.vx * 0.2,
          vy: -Math.sin(p.angle) * rand(60, 160) + p.vy * 0.2,
          life: l,
          max: l,
          size: dashing ? 12 : 7,
          color: dashing ? C.magenta : C.cyan,
          drag: 2,
          spark: false,
        });
      }
    }

    if ((this.mouse.down || autoFire) && p.fireCd <= 0) this.fire();

    p.invuln = Math.max(0, p.invuln - dt);
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.dashT = Math.max(0, p.dashT - dt);
    p.triple = Math.max(0, p.triple - dt);
    p.rapid = Math.max(0, p.rapid - dt);
    p.shield = Math.max(0, p.shield - dt);

    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.streak = 0;
    }
  }

  fire() {
    const p = this.player;
    p.fireCd = p.rapid > 0 ? 0.07 : 0.15;
    const spread = p.triple > 0 ? [-0.2, 0, 0.2] : [0];
    const color = p.rapid > 0 ? C.amber : C.cyan;
    const nx = p.x + Math.cos(p.angle) * 22;
    const ny = p.y + Math.sin(p.angle) * 22;
    for (const s of spread) {
      const a = p.angle + s + rand(-0.02, 0.02);
      this.bullets.push({
        x: nx,
        y: ny,
        vx: Math.cos(a) * 980 + p.vx * 0.3,
        vy: Math.sin(a) * 980 + p.vy * 0.3,
        life: 0.9,
        color,
      });
    }
    p.vx -= Math.cos(p.angle) * 14;
    p.vy -= Math.sin(p.angle) * 14;
    if (this.particles.length < MAX_PARTICLES) {
      this.particles.push({ x: nx, y: ny, vx: p.vx, vy: p.vy, life: 0.08, max: 0.08, size: 16, color, drag: 0, spark: false });
    }
    this.audio.shoot();
  }

  updateWaves(dt) {
    if (!this.waveActive) {
      this.intermission -= dt;
      if (this.intermission <= 0) this.startWave(this.wave + 1);
      return;
    }
    if (this.queue.length) {
      this.spawnT -= dt;
      const cap = 10 + this.wave * 2;
      if (this.spawnT <= 0 && this.enemies.length < cap) {
        const batch = 1 + Math.floor(Math.random() * Math.min(3, 1 + this.wave / 3));
        for (let i = 0; i < batch && this.queue.length; i++) {
          const pos = this.spawnPoint();
          this.spawnEnemy(this.queue.shift(), pos.x, pos.y);
        }
        this.spawnT = Math.max(0.4, 1.5 - this.wave * 0.07);
      }
    } else if (this.enemies.length === 0) {
      this.waveActive = false;
      this.intermission = 2.4;
      const bonus = 250 * this.wave;
      this.score += bonus;
      this.text(this.player.x, this.player.y - 54, `WAVE CLEAR  +${bonus}`, C.lime);
    }
  }

  updateEnemies(dt) {
    const p = this.player;
    const speedMul = (1 + Math.min(this.wave, 20) * 0.012) * (p.alive ? 1 : 0.45);

    for (const e of this.enemies) {
      e.rot += e.spin * dt;
      if (e.hit > 0) e.hit -= dt;
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        continue;
      }

      let tx = p.x;
      let ty = p.y;
      if (!p.alive) {
        // no player (menu / game over): drift between random points
        e.wanderT -= dt;
        if (e.wanderT <= 0) {
          e.wanderT = rand(3, 7);
          e.wx = rand(150, WORLD.w - 150);
          e.wy = rand(150, WORLD.h - 150);
        }
        tx = e.wx;
        ty = e.wy;
      }
      const dx = tx - e.x;
      const dy = ty - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      const d = DEFS[e.type];
      const sp = d.speed * speedMul;
      const steer = (rate, sx, sy) => {
        const k = 1 - Math.exp(-rate * dt);
        e.vx += (sx - e.vx) * k;
        e.vy += (sy - e.vy) * k;
      };

      switch (e.type) {
        case 'drone': {
          const w = Math.sin(this.time * 3 + e.seed) * 0.6;
          steer(3, (nx - ny * w) * sp, (ny + nx * w) * sp);
          break;
        }
        case 'dart': {
          const maxTurn = 2.4 * dt;
          e.angle += clamp(angDiff(e.angle, Math.atan2(dy, dx)), -maxTurn, maxTurn);
          e.vx = Math.cos(e.angle) * sp;
          e.vy = Math.sin(e.angle) * sp;
          if (Math.random() < 0.5 && this.particles.length < MAX_PARTICLES) {
            this.particles.push({ x: e.x - Math.cos(e.angle) * e.r, y: e.y - Math.sin(e.angle) * e.r, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 6, color: d.color, drag: 0, spark: false });
          }
          break;
        }
        case 'orb': {
          const m = dist > 430 ? 1 : dist < 300 ? -1 : 0;
          const side = e.seed > Math.PI ? 1 : -1;
          steer(2, (nx * m - ny * side * 0.7) * sp, (ny * m + nx * side * 0.7) * sp);
          if (p.alive) {
            e.fireCd -= dt;
            if (e.fireCd <= 0 && dist < 720) {
              e.fireCd = rand(1.8, 2.6);
              this.enemyShot(e.x, e.y, Math.atan2(dy, dx), 270, d.color);
            }
          }
          break;
        }
        case 'brute':
          steer(1.5, nx * sp, ny * sp);
          break;
        case 'warden': {
          // hold a firing distance, but chase hard when the player runs
          const m = dist > 600 ? 2 : dist > 340 ? 1 : dist < 240 ? -0.6 : 0;
          steer(1.5, nx * m * sp, ny * m * sp);
          if (p.alive) this.wardenAttack(e, dt, Math.atan2(dy, dx));
          break;
        }
      }
    }

    // soft separation so enemies don't stack
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      if (a.spawnT > 0) continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        if (b.spawnT > 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r + 6;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * Math.min(1, dt * 8) * 0.5;
        const wa = b.r / (a.r + b.r);
        a.x -= dx * push * wa * 2;
        a.y -= dy * push * wa * 2;
        b.x += dx * push * (1 - wa) * 2;
        b.y += dy * push * (1 - wa) * 2;
      }
    }

    for (const e of es) {
      if (e.spawnT > 0) continue;
      e.x = clamp(e.x + e.vx * dt, e.r, WORLD.w - e.r);
      e.y = clamp(e.y + e.vy * dt, e.r, WORLD.h - e.r);
    }
  }

  wardenAttack(e, dt, aim) {
    const color = DEFS.warden.color;
    if (e.spiralT > 0) {
      e.spiralT -= dt;
      e.spiralCd -= dt;
      if (e.spiralCd <= 0) {
        e.spiralCd = 0.08;
        e.spiralA += 0.34;
        this.enemyShot(e.x, e.y, e.spiralA, 230, color);
        this.enemyShot(e.x, e.y, e.spiralA + Math.PI, 230, color);
      }
      return;
    }
    e.fireCd -= dt;
    if (e.fireCd > 0) return;
    e.pattern = (e.pattern + 1) % 3;
    e.fireCd = 2.3;
    if (e.pattern === 0) {
      const n = 18;
      const off = rand(0, TAU);
      for (let i = 0; i < n; i++) this.enemyShot(e.x, e.y, off + (i / n) * TAU, 220, color);
      this.ring(e.x, e.y, 160, color, 0.4);
    } else if (e.pattern === 1) {
      e.spiralT = 1.7;
      e.spiralA = aim;
      e.fireCd = 1.2;
    } else {
      for (let i = -2; i <= 2; i++) this.enemyShot(e.x, e.y, aim + i * 0.17, 340, color);
      if (e.hp < e.maxHp * 0.5) {
        for (let i = 0; i < 2; i++) {
          const a = rand(0, TAU);
          this.spawnEnemy('dart', clamp(e.x + Math.cos(a) * 110, 40, WORLD.w - 40), clamp(e.y + Math.sin(a) * 110, 40, WORLD.h - 40), 0.5);
        }
      }
    }
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < 0 || b.x > WORLD.w || b.y < 0 || b.y > WORLD.h) {
        b.life = 0;
        this.burst(clamp(b.x, 0, WORLD.w), clamp(b.y, 0, WORLD.h), b.color, 4, 160, 0.3, 6);
        continue;
      }
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = e.r + 5;
        if (dx * dx + dy * dy > rr * rr) continue;
        b.life = 0;
        e.hp -= 1;
        e.hit = 0.09;
        // knockback scales with mass, or sustained fire would push heavies away forever
        const knock = DEFS[e.type].knock;
        e.vx += b.vx * knock;
        e.vy += b.vy * knock;
        this.burst(b.x, b.y, DEFS[e.type].color, 5, 220, 0.35, 7);
        if (e.hp <= 0) this.kill(e);
        else this.audio.hit();
        break;
      }
    }
    compact(this.bullets, (b) => b.life > 0);

    for (const b of this.ebullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.x < 0 || b.x > WORLD.w || b.y < 0 || b.y > WORLD.h) b.life = 0;
    }
    compact(this.ebullets, (b) => b.life > 0);
  }

  collide() {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > e.r + p.r * 0.75) continue;
      const heavy = e.type === 'brute' || e.type === 'warden';
      if (p.dashT > 0 && !heavy) {
        this.kill(e); // dashing slices through light enemies
        continue;
      }
      if (p.invuln > 0) continue;
      const shielded = p.shield > 0;
      this.hurt(heavy ? 30 : 20);
      if (!p.alive) return;
      if (heavy) {
        p.vx = (-dx / d) * 700;
        p.vy = (-dy / d) * 700;
      } else {
        this.kill(e, shielded);
      }
    }

    for (const b of this.ebullets) {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const rr = b.r + p.r * 0.7;
      if (dx * dx + dy * dy > rr * rr) continue;
      b.life = 0;
      this.burst(b.x, b.y, b.color, 6, 200, 0.35, 7);
      if (p.invuln <= 0) this.hurt(10);
      if (!p.alive) return;
    }
  }

  hurt(dmg) {
    const p = this.player;
    if (p.shield > 0) {
      p.invuln = 0.25;
      this.ring(p.x, p.y, 80, C.violet, 0.35);
      this.audio.hit();
      return;
    }
    p.hp -= dmg;
    p.invuln = 1.1;
    this.streak = 0;
    this.comboT = 0;
    this.shake = Math.max(this.shake, 14);
    this.flash = 0.5;
    this.flashColor = '255,60,100';
    this.burst(p.x, p.y, C.red, 16, 300, 0.5, 9);
    this.audio.hurt();
    if (p.hp <= 0) this.die();
  }

  die() {
    const p = this.player;
    p.hp = 0;
    p.alive = false;
    this.deathT = 1.7;
    this.timeScale = 0.2;
    this.shake = 28;
    this.burst(p.x, p.y, C.cyan, 60, 620, 1.2, 16);
    this.burst(p.x, p.y, C.white, 24, 320, 0.8, 10);
    this.burst(p.x, p.y, C.magenta, 30, 460, 1, 13);
    this.ring(p.x, p.y, 320, C.cyan, 0.8);
    this.ring(p.x, p.y, 180, C.white, 0.5);
    this.audio.boom(true);
    this.emitHud(true);
  }

  kill(e, byPlayer = true) {
    if (e.dead) return;
    e.dead = true;
    const d = DEFS[e.type];
    const big = e.type === 'brute' || e.type === 'warden';
    if (byPlayer) {
      this.streak++;
      this.comboT = COMBO_TIME;
      this.kills++;
      const pts = d.score * this.mult();
      this.score += pts;
      this.text(e.x, e.y - e.r, `+${pts}`, d.color);
    }
    this.burst(e.x, e.y, d.color, big ? 46 : 18, big ? 520 : 340, big ? 0.9 : 0.6, big ? 16 : 10);
    this.burst(e.x, e.y, C.white, big ? 14 : 6, 200, 0.4, 8);
    this.ring(e.x, e.y, e.r * (big ? 5 : 3.2), d.color);
    this.shake = Math.max(this.shake, big ? 12 : 4);
    this.audio.boom(big);

    if (e.type === 'brute') {
      for (let i = 0; i < 3; i++) {
        const a = e.rot + (i / 3) * TAU;
        this.spawnEnemy('drone', clamp(e.x + Math.cos(a) * 26, 30, WORLD.w - 30), clamp(e.y + Math.sin(a) * 26, 30, WORLD.h - 30), 0.3);
      }
    }

    if (e.type === 'warden') {
      this.timeScale = 0.25;
      this.shake = 26;
      this.flash = 0.6;
      this.flashColor = '255,255,255';
      this.ring(e.x, e.y, 520, C.white, 0.9);
      this.burst(e.x, e.y, C.amber, 50, 700, 1.3, 14);
      for (const b of this.ebullets) this.burst(b.x, b.y, b.color, 3, 120, 0.4, 6);
      this.ebullets.length = 0;
      this.dropPickup(e.x, e.y, 'heal');
      this.dropPickup(e.x, e.y);
    } else if (byPlayer && Math.random() < (e.type === 'brute' ? 0.6 : 0.09)) {
      this.dropPickup(e.x, e.y);
    }
  }

  updatePickups(dt) {
    const p = this.player;
    for (const k of this.pickups) {
      k.life -= dt;
      k.rot += dt * 1.6;
      const damp = Math.exp(-2.5 * dt);
      k.vx *= damp;
      k.vy *= damp;
      if (p.alive) {
        const dx = p.x - k.x;
        const dy = p.y - k.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 170) {
          const pull = (1 - d / 170) * 1400 * dt;
          k.vx += (dx / d) * pull;
          k.vy += (dy / d) * pull;
        }
        if (d < 34) {
          k.life = 0;
          const info = PICKUPS[k.type];
          if (k.type === 'heal') p.hp = Math.min(p.maxHp, p.hp + 30);
          else p[k.type] = POWER_TIME[k.type];
          this.text(p.x, p.y - 40, info.label, info.color);
          this.ring(p.x, p.y, 110, info.color, 0.45);
          this.burst(p.x, p.y, info.color, 16, 260, 0.5, 9);
          this.audio.pickup();
        }
      }
      k.x = clamp(k.x + k.vx * dt, 20, WORLD.w - 20);
      k.y = clamp(k.y + k.vy * dt, 20, WORLD.h - 20);
    }
    compact(this.pickups, (k) => k.life > 0);
  }

  updateEffects(dt, rawDt) {
    for (const q of this.particles) {
      const damp = Math.exp(-q.drag * dt);
      q.vx *= damp;
      q.vy *= damp;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.life -= dt;
    }
    compact(this.particles, (q) => q.life > 0);

    for (const r of this.rings) r.life -= dt;
    compact(this.rings, (r) => r.life > 0);

    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 38 * dt;
    }
    compact(this.texts, (t) => t.life > 0);

    this.shake *= Math.exp(-7 * rawDt);
    if (this.shake < 0.2) this.shake = 0;
    this.flash = Math.max(0, this.flash - rawDt * 1.6);
  }

  updateCamera(rawDt) {
    const { W, H, zoom, cam } = this;
    const p = this.player;
    let tx;
    let ty;
    if (this.mode === 'playing' || this.mode === 'paused') {
      tx = p.x;
      ty = p.y;
      if (p.alive && !this.touchMode) {
        tx += ((this.mouse.x - W / 2) / zoom) * 0.18;
        ty += ((this.mouse.y - H / 2) / zoom) * 0.18;
      }
    } else {
      tx = WORLD.w / 2 + Math.cos(this.time * 0.08) * 520;
      ty = WORLD.h / 2 + Math.sin(this.time * 0.11) * 330;
    }
    const k = 1 - Math.exp(-(this.mode === 'playing' ? 5 : 1.2) * rawDt);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;

    const margin = 150;
    const hw = W / 2 / zoom;
    const hh = H / 2 / zoom;
    const minX = hw - margin;
    const maxX = WORLD.w - hw + margin;
    const minY = hh - margin;
    const maxY = WORLD.h - hh + margin;
    cam.x = minX > maxX ? WORLD.w / 2 : clamp(cam.x, minX, maxX);
    cam.y = minY > maxY ? WORLD.h / 2 : clamp(cam.y, minY, maxY);
  }

  // ───────────────────────── render ─────────────────────────

  visible(x, y, m) {
    return (
      Math.abs(x - this.cam.x) < this.W / 2 / this.zoom + m &&
      Math.abs(y - this.cam.y) < this.H / 2 / this.zoom + m
    );
  }

  render() {
    const { ctx, W, H } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground();

    const sh = this.mode === 'paused' ? 0 : this.shake;
    ctx.save();
    ctx.translate(W / 2 + rand(-sh, sh), H / 2 + rand(-sh, sh));
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    this.drawArena();
    this.drawPickups();
    this.drawParticles();
    this.drawBullets();
    for (const e of this.enemies) {
      if (this.visible(e.x, e.y, e.r * 3)) this.drawEnemy(e);
    }
    if (this.player.alive) this.drawPlayer();
    this.drawRings();
    this.drawTexts();
    ctx.restore();

    this.drawOverlay();
  }

  drawBackground() {
    const { ctx, W, H, cam } = this;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.bgGrad;
    ctx.fillRect(0, 0, W, H);

    // two nebula layers at different depths
    ctx.globalCompositeOperation = 'lighter';
    const layers = [
      { T: 2048, f: 0.08, a: 0.95, ox: 0, oy: 0 },
      { T: 1400, f: 0.18, a: 0.5, ox: 700, oy: 420 },
    ];
    for (const L of layers) {
      ctx.globalAlpha = L.a;
      const sx = -((((cam.x * L.f + L.ox) % L.T) + L.T) % L.T);
      const sy = -((((cam.y * L.f + L.oy) % L.T) + L.T) % L.T);
      for (let x = sx; x < W; x += L.T) {
        for (let y = sy; y < H; y += L.T) ctx.drawImage(this.nebula, x, y, L.T, L.T);
      }
    }

    // parallax starfield
    const FW = W + 40;
    const FH = H + 40;
    for (const L of this.stars) {
      for (const s of L.list) {
        const x = ((((s.x * FW - cam.x * L.f) % FW) + FW) % FW) - 20;
        const y = ((((s.y * FH - cam.y * L.f) % FH) + FH) % FH) - 20;
        ctx.globalAlpha = s.a * (0.65 + 0.35 * Math.sin(this.time * s.tw + s.ph));
        if (L.glow) {
          const r = s.size * 3.6;
          ctx.drawImage(glow(s.color), x - r, y - r, r * 2, r * 2);
        } else {
          ctx.fillStyle = s.color;
          ctx.fillRect(x, y, s.size, s.size);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawArena() {
    const { ctx, cam, W, H, zoom } = this;
    const hw = W / 2 / zoom;
    const hh = H / 2 / zoom;
    const x0 = Math.max(0, Math.ceil((cam.x - hw) / GRID) * GRID);
    const x1 = Math.min(WORLD.w, cam.x + hw);
    const y0 = Math.max(0, Math.ceil((cam.y - hh) / GRID) * GRID);
    const y1 = Math.min(WORLD.h, cam.y + hh);
    const top = Math.max(0, cam.y - hh);
    const left = Math.max(0, cam.x - hw);

    ctx.beginPath();
    for (let x = x0; x <= x1; x += GRID) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, y1);
    }
    for (let y = y0; y <= y1; y += GRID) {
      ctx.moveTo(left, y);
      ctx.lineTo(x1, y);
    }
    ctx.strokeStyle = 'rgba(130,170,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 26;
    ctx.strokeStyle = this.borderGrad;
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, WORLD.w, WORLD.h);
    ctx.restore();
  }

  drawPickups() {
    const { ctx } = this;
    for (const k of this.pickups) {
      if (!this.visible(k.x, k.y, 60)) continue;
      if (k.life < 3 && Math.sin(k.life * 18) > 0.3) continue; // blink before expiring
      const color = PICKUPS[k.type].color;
      const bob = Math.sin(this.time * 3 + k.x) * 3;
      ctx.save();
      ctx.translate(k.x, k.y + bob);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + 0.2 * Math.sin(this.time * 5);
      ctx.drawImage(glow(color), -34, -34, 68, 68);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.rotate(k.rot);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(6,8,28,0.75)';
      poly(ctx, 6, 16);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      if (k.type === 'heal') {
        ctx.moveTo(-6, 0);
        ctx.lineTo(6, 0);
        ctx.moveTo(0, -6);
        ctx.lineTo(0, 6);
      } else if (k.type === 'triple') {
        ctx.moveTo(0, 6);
        ctx.lineTo(0, -7);
        ctx.moveTo(-2, 6);
        ctx.lineTo(-7, -4);
        ctx.moveTo(2, 6);
        ctx.lineTo(7, -4);
      } else if (k.type === 'rapid') {
        ctx.moveTo(-6, -5);
        ctx.lineTo(-1, 0);
        ctx.lineTo(-6, 5);
        ctx.moveTo(1, -5);
        ctx.lineTo(6, 0);
        ctx.lineTo(1, 5);
      } else {
        ctx.arc(0, 0, 6.5, 0, TAU);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  drawParticles() {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1.5;
    for (const q of this.particles) {
      if (!this.visible(q.x, q.y, 30)) continue;
      const t = q.life / q.max;
      ctx.globalAlpha = t;
      if (q.spark) {
        ctx.strokeStyle = q.color;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.vx * 0.045, q.y - q.vy * 0.045);
        ctx.stroke();
      } else {
        const s = q.size * (0.4 + 0.6 * t);
        ctx.drawImage(glow(q.color), q.x - s, q.y - s, s * 2, s * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawBullets() {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of this.bullets) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.drawImage(glow(b.color), b.x - 11, b.y - 11, 22, 22);
    }
    for (const b of this.ebullets) {
      if (!this.visible(b.x, b.y, 30)) continue;
      const s = 19 + Math.sin(this.time * 14 + b.x) * 3;
      ctx.drawImage(glow(b.color), b.x - s, b.y - s, s * 2, s * 2);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 7.5, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawEnemy(e) {
    const { ctx } = this;
    const d = DEFS[e.type];
    const r = e.r;
    ctx.save();
    ctx.translate(e.x, e.y);

    if (e.spawnT > 0) {
      // warp-in: a ring collapses onto the enemy as it scales up
      const s = clamp(1 - e.spawnT / SPAWN_TIME, 0.05, 1);
      ctx.globalAlpha = s;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * (3 - 2 * s), 0, TAU);
      ctx.stroke();
      ctx.scale(s, s);
      ctx.globalAlpha = s * 0.8;
    }

    const hit = e.hit > 0;
    const col = hit ? '#ffffff' : d.color;
    ctx.shadowColor = d.color;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.fillStyle = hit ? 'rgba(255,255,255,0.85)' : hexA(d.color, 0.16);

    switch (e.type) {
      case 'drone': {
        ctx.rotate(e.rot);
        poly(ctx, 4, r * 1.2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = col;
        poly(ctx, 4, r * 0.42 * (1 + 0.18 * Math.sin(this.time * 6 + e.seed)));
        ctx.fill();
        break;
      }
      case 'dart': {
        ctx.rotate(e.angle);
        ctx.beginPath();
        ctx.moveTo(r * 1.6, 0);
        ctx.lineTo(-r, -r * 0.85);
        ctx.lineTo(-r * 0.4, 0);
        ctx.lineTo(-r, r * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'orb': {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.78, 0, TAU);
        ctx.fill();
        ctx.stroke();
        const charge = clamp(1 - e.fireCd / 1.8, 0, 1);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.22 + 0.22 * charge), 0, TAU);
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.2, e.rot, e.rot + 1.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.2, e.rot + Math.PI, e.rot + Math.PI + 1.5);
        ctx.stroke();
        break;
      }
      case 'brute': {
        ctx.lineWidth = 3;
        poly(ctx, 6, r, e.rot * 0.4);
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 1.5;
        poly(ctx, 6, r * 0.62, -e.rot * 0.6);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.14 + 0.2 * (e.hp / e.maxHp)), 0, TAU);
        ctx.fill();
        break;
      }
      case 'warden': {
        ctx.lineWidth = 3.5;
        poly(ctx, 8, r, e.rot * 0.3);
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 2;
        poly(ctx, 8, r * 0.7, -e.rot * 0.5);
        ctx.stroke();
        poly(ctx, 4, r * 0.46, e.rot * 0.9);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const a = e.rot * 0.8 + (i / 4) * TAU;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3, 7, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
        const pulse = 0.24 + 0.05 * Math.sin(this.time * 5);
        const eye = ctx.createRadialGradient(0, 0, 0, 0, 0, r * pulse);
        eye.addColorStop(0, '#fff');
        eye.addColorStop(0.5, col);
        eye.addColorStop(1, hexA(d.color, 0.2));
        ctx.fillStyle = eye;
        ctx.beginPath();
        ctx.arc(0, 0, r * pulse, 0, TAU);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  drawPlayer() {
    const { ctx } = this;
    const p = this.player;
    ctx.save();
    ctx.translate(p.x, p.y);

    if (p.shield > 0) {
      const r = 34 * (1 + Math.sin(this.time * 6) * 0.05);
      const fading = p.shield < 2 && Math.sin(this.time * 20) > 0;
      ctx.globalAlpha = fading ? 0.35 : 0.9;
      const g = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r);
      g.addColorStop(0, hexA(C.violet, 0));
      g.addColorStop(1, hexA(C.violet, 0.35));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.violet;
      ctx.lineWidth = 2;
      ctx.shadowColor = C.violet;
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    if (p.invuln > 0 && p.dashT <= 0 && p.shield <= 0 && Math.sin(this.time * 40) > 0) ctx.globalAlpha = 0.35;
    ctx.rotate(p.angle);

    // engine flame
    const len = 10 + p.thrust * 22 + Math.random() * 6 + (p.dashT > 0 ? 26 : 0);
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createLinearGradient(-8, 0, -8 - len, 0);
    fg.addColorStop(0, 'rgba(255,255,255,0.95)');
    fg.addColorStop(0.3, hexA(C.cyan, 0.8));
    fg.addColorStop(1, hexA(C.magenta, 0));
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-8, -5);
    ctx.lineTo(-8 - len, 0);
    ctx.lineTo(-8, 5);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // hull
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 20;
    const hg = ctx.createLinearGradient(-14, 0, 22, 0);
    hg.addColorStop(0, '#2b5cff');
    hg.addColorStop(0.55, C.cyan);
    hg.addColorStop(1, '#f2feff');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-13, -14);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-13, 14);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // cockpit
    ctx.fillStyle = '#0a1238';
    ctx.beginPath();
    ctx.ellipse(4, 0, 6, 3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(6, -1, 2, 1, 0, 0, TAU);
    ctx.fill();

    // wing accents
    ctx.strokeStyle = C.magenta;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -10.5);
    ctx.lineTo(2, -5.5);
    ctx.moveTo(-10, 10.5);
    ctx.lineTo(2, 5.5);
    ctx.stroke();
    ctx.restore();
  }

  drawRings() {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const t = clamp(1 - r.life / r.max, 0, 1);
      const ease = 1 - (1 - t) * (1 - t);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 1 + 5 * (1 - t);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.maxR * ease, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawTexts() {
    const { ctx } = this;
    ctx.font = "700 15px Orbitron, 'Segoe UI', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      ctx.globalAlpha = clamp(t.life / t.max * 1.6, 0, 1);
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  drawOverlay() {
    const { ctx, W, H, cam, zoom } = this;
    const p = this.player;
    const playing = this.mode === 'playing' && p.alive;

    if (playing) {
      // off-screen threat arrows along the viewport edge
      const m = 26;
      for (const e of this.enemies) {
        const sx = (e.x - cam.x) * zoom + W / 2;
        const sy = (e.y - cam.y) * zoom + H / 2;
        if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
        const cx = clamp(sx, m, W - m);
        const cy = clamp(sy, m, H - m);
        const color = DEFS[e.type].color;
        const s = e.type === 'warden' ? 12 : 7;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.atan2(sy - cy, sx - cx));
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(s, 0);
        ctx.lineTo(-s * 0.7, -s * 0.7);
        ctx.lineTo(-s * 0.7, s * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, W, H);

    if (playing && p.hp <= 30) {
      const a = 0.1 + 0.08 * Math.sin(this.time * 6);
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      g.addColorStop(0, 'rgba(255,40,80,0)');
      g.addColorStop(1, `rgba(255,40,80,${a * 2.2})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flash * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (playing && !this.touchMode) {
      // aiming reticle
      const { x, y } = this.mouse;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.time * 1.2);
      ctx.strokeStyle = C.cyan;
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
        ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15);
      }
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 1.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    if (playing && this.touch.active) {
      // virtual joystick
      const t = this.touch;
      ctx.save();
      ctx.strokeStyle = 'rgba(94,242,255,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(t.ox, t.oy, 60, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(94,242,255,0.35)';
      ctx.beginPath();
      ctx.arc(t.ox + t.dx, t.oy + t.dy, 24, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}
