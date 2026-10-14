import { Game } from './game.js';
import { cardEl, preloadFaces } from './cards.js';

/* ============ utilidades ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
};

// Sitios en la mesa, en sentido horario viendo el móvil desde arriba
const POS = { 2: ['bottom', 'top'], 3: ['bottom', 'left', 'right'], 4: ['bottom', 'left', 'top', 'right'] };
const SEAT_LABEL = { bottom: ['↓', 'Abajo'], left: ['←', 'Izquierda'], top: ['↑', 'Arriba'], right: ['→', 'Derecha'] };
const ROT = { bottom: 0, left: 90, top: 180, right: -90 };
const FROM = { bottom: [0, 1], top: [0, -1], left: [-1, 0], right: [1, 0] };

/* ============ ranking guardado en el móvil ============ */
const STATS_KEY = 'tapete.stats.v1';
const loadStats = () => store.get(STATS_KEY, { players: {} });
const saveStats = (s) => store.set(STATS_KEY, s);

function canonicalName(name) {
  const st = loadStats();
  const hit = Object.keys(st.players).find((n) => n.toLowerCase() === name.toLowerCase());
  return hit || name;
}

function recordResult(names, winner) {
  const st = loadStats();
  names.forEach((n) => {
    const e = st.players[n] || (st.players[n] = { w: 0, g: 0, t: 0 });
    e.g += 1;
    if (n === winner) e.w += 1;
    e.t = Date.now();
  });
  saveStats(st);
  return st.players[winner];
}

/* ============ sonido (WebAudio, sin archivos) ============ */
let ac = null;
let muted = store.get('tapete.muted', false);
function unlockAudio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* sin audio */ } }
  if (ac && ac.state === 'suspended') ac.resume();
}
function tone(freq, dur = 0.12, type = 'sine', gain = 0.12, delay = 0, slide = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur = 0.06, gain = 0.2, hp = 1500) {
  if (!ac || muted) return;
  const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = gain;
  s.connect(f).connect(g).connect(ac.destination); s.start();
}
const vibrate = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* iOS no lo soporta */ } };
const sfx = {
  card: () => noise(0.07, 0.25, 1800),
  slap: () => { tone(130, 0.2, 'triangle', 0.45, 0, -70); noise(0.14, 0.4, 500); vibrate(25); },
  collect: () => { tone(440, 0.1, 'sine', 0.12); tone(660, 0.16, 'sine', 0.12, 0.09); },
  bad: () => { tone(160, 0.28, 'sawtooth', 0.1, 0, -60); vibrate([30, 40, 30]); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.18, i * 0.13)),
};

/* ============ pantallas ============ */
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  if (id === 'home') refreshHome();
  if (id === 'setup') buildSetup();
  if (id === 'ranking') renderRanking();
  if (id === 'game') requestAnimationFrame(layout);
  id === 'game' ? keepAwake(true) : keepAwake(false);
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* opcional */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && $('#game').classList.contains('active')) keepAwake(true);
  if (document.visibilityState === 'hidden') save();
});

function refreshHome() {
  $('#btn-continue').hidden = !store.get('tapete.save', null);
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) show(go.dataset.go);
});
$('#btn-play').onclick = () => show('setup');
$('#btn-ranking').onclick = () => show('ranking');
$('#btn-rules').onclick = () => openModal(rulesHtml(), { close: 'Entendido' });
$('#btn-continue').onclick = () => {
  const saved = store.get('tapete.save', null);
  if (!saved) return;
  try {
    game = Game.restore(saved.json);
    names = saved.names;
    beginBoard();
    schedulePending();
  } catch { store.del('tapete.save'); refreshHome(); }
};

/* ============ nueva partida ============ */
let setupN = store.get('tapete.n', 2);
let names = [];

function buildSetup() {
  const last = store.get('tapete.last', []);
  $$('#count-seg button').forEach((b) => b.classList.toggle('on', +b.dataset.n === setupN));
  const box = $('#name-fields');
  const old = $$('input', box).map((i) => i.value);
  box.innerHTML = '';
  POS[setupN].forEach((pos, i) => {
    const [arrow, label] = SEAT_LABEL[pos];
    const row = document.createElement('div');
    row.className = 'name-row';
    row.innerHTML = `<div class="seat-tag"><b>Jugador ${i + 1}</b>${arrow} ${label}</div>
      <input type="text" maxlength="14" autocomplete="off" autocapitalize="words" enterkeyhint="done" placeholder="Nombre" aria-label="Nombre del jugador ${i + 1}">`;
    const input = $('input', row);
    input.value = old[i] ?? last[i] ?? '';
    input.addEventListener('input', paintChips);
    box.appendChild(row);
  });
  $('#setup-error').textContent = '';
  paintChips();
}

function paintChips() {
  const st = loadStats();
  const saved = Object.entries(st.players).sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).map(([n]) => n);
  $('#saved-wrap').hidden = saved.length === 0;
  const used = $$('#name-fields input').map((i) => i.value.trim().toLowerCase());
  const chips = $('#saved-chips');
  chips.innerHTML = '';
  saved.forEach((n) => {
    const b = document.createElement('button');
    b.className = 'chip' + (used.includes(n.toLowerCase()) ? ' used' : '');
    b.textContent = n;
    b.onclick = () => {
      if (used.includes(n.toLowerCase())) return;
      const empty = $$('#name-fields input').find((i) => !i.value.trim());
      if (empty) { empty.value = n; paintChips(); }
    };
    chips.appendChild(b);
  });
}

$$('#count-seg button').forEach((b) => (b.onclick = () => {
  setupN = +b.dataset.n;
  store.set('tapete.n', setupN);
  buildSetup();
}));

$('#btn-start').onclick = () => {
  unlockAudio();
  const inputs = $$('#name-fields input');
  const list = inputs.map((inp, i) => canonicalName(inp.value.trim() || `Jugador ${i + 1}`));
  const dup = new Set(list.map((n) => n.toLowerCase())).size !== list.length;
  if (dup) { $('#setup-error').textContent = 'Dos jugadores tienen el mismo nombre. Cambiad alguno.'; return; }
  store.set('tapete.last', list);
  startGame(list);
};

/* ============ ranking ============ */
function renderRanking() {
  const st = loadStats();
  const rows = Object.entries(st.players)
    .map(([n, e]) => ({ n, ...e, rate: e.g ? e.w / e.g : 0 }))
    .sort((a, b) => b.w - a.w || b.rate - a.rate || a.g - b.g || a.n.localeCompare(b.n));
  const list = $('#rank-list');
  list.innerHTML = rows.map((r, i) => `
    <div class="rank-row${i === 0 && r.w > 0 ? ' first' : ''}">
      <div class="rank-pos">${i + 1}</div>
      <div class="rank-name">${esc(r.n)}</div>
      <div class="rank-wins">${r.w}<small>${r.w === 1 ? 'victoria' : 'victorias'}</small></div>
      <div class="rank-meta">${r.g} ${r.g === 1 ? 'partida' : 'partidas'}<br>${Math.round(r.rate * 100)}%</div>
    </div>`).join('');
  $('#rank-empty').hidden = rows.length > 0;
  $('#btn-reset-rank').hidden = rows.length === 0;
}
$('#btn-reset-rank').onclick = () => {
  if (confirm('¿Borrar todo el ranking y los nombres guardados?')) { saveStats({ players: {} }); renderRanking(); }
};

/* ============ ventanas ============ */
const modal = $('#modal'), modalCard = $('#modal-card');
function openModal(html, { close } = {}) {
  modalCard.innerHTML = html + (close ? `<button class="btn" data-act="close">${close}</button>` : '');
  modal.hidden = false;
}
function closeModal() { modal.hidden = true; modalCard.innerHTML = ''; }
modal.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act) modalAction(act);
});

function rulesHtml() {
  return `<h2>Cómo se juega</h2><ul>
    <li>Se reparten <b>las 52 cartas</b> entre todos. Empieza uno al azar y se tira una carta por turno.</li>
    <li><b>Figuras</b>: tras un <b>A</b> el siguiente tira 4 cartas seguidas, tras un <b>K</b> 3, tras una <b>Q</b> 2 y tras una <b>J</b> 1.</li>
    <li>Si en esas cartas sale otra figura, el reto pasa al siguiente. Si no sale ninguna, <b>quien lanzó el reto se lleva el montón</b>.</li>
    <li><b>TAPETE</b>: si las dos últimas cartas son iguales (o la primera y la tercera, tipo A-5-A), el más rápido en pulsar <b>TAPETE</b> se lleva todo el montón.</li>
    <li>Si pulsas sin que valga, <b>pierdes 2 cartas</b> (van debajo del montón).</li>
    <li>Gana quien se queda con todas las cartas.</li></ul>`;
}

function modalAction(act) {
  if (act === 'close') { closeModal(); schedulePending(); }
  if (act === 'rules') openModal(rulesHtml(), { close: 'Volver' }), $('[data-act=close]').dataset.act = 'pause';
  if (act === 'pause') openPause();
  if (act === 'sound') { muted = !muted; store.set('tapete.muted', muted); openPause(); }
  if (act === 'menu') { closeModal(); save(); show('home'); }
  if (act === 'again') { closeModal(); startGame(names); }
  if (act === 'rank') { closeModal(); show('ranking'); }
}

function openPause() {
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
  openModal(`<h2>Pausa</h2>
    <div class="toggle"><span>Sonido</span><button data-act="sound">${muted ? 'Desactivado' : 'Activado'}</button></div>
    <button class="btn" data-act="close">Seguir jugando</button>
    <button class="btn ghost" data-act="rules">Ver reglas</button>
    <button class="btn ghost" data-act="again">Repartir de nuevo</button>
    <button class="btn ghost" data-act="menu">Salir al menú (se guarda)</button>`);
}
$('#btn-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); openPause(); });

/* ============ partida ============ */
let game = null;
let seats = [];
let pendingTimer = null;
let lastPileKey = '';
const pileEl = $('#pile'), centerEl = $('#center');
let flyEl = null;

function startGame(list) {
  names = list;
  game = new Game(list).start();
  store.del('tapete.save');
  beginBoard();
}

function beginBoard() {
  lastPileKey = '';
  buildBoard();
  show('game');
  render(null);
  save();
}

function save() {
  if (game && !game.over) store.set('tapete.save', { json: game.serialize(), names });
}

function buildBoard() {
  $$('.seat').forEach((n) => n.remove());
  if (!flyEl) { flyEl = document.createElement('div'); flyEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5'; centerEl.appendChild(flyEl); }
  flyEl.innerHTML = '';
  pileEl.innerHTML = '';
  seats = [];
  const positions = POS[game.n];
  game.players.forEach((p, i) => {
    const pos = positions[i];
    const seat = document.createElement('div');
    seat.className = `seat pos-${pos}`;
    seat.innerHTML = `<div class="seat-inner">
      <div class="seat-info"><div class="seat-name"></div><div class="seat-count"></div><div class="seat-msg"></div></div>
      <button class="hand-btn" aria-label="Tirar carta"><span class="hand-num"></span></button>
      <button class="slap-btn">TAPETE</button></div>`;
    $('#board').appendChild(seat);
    const s = {
      i, pos, el: seat, inner: $('.seat-inner', seat), name: $('.seat-name', seat), count: $('.seat-count', seat),
      msg: $('.seat-msg', seat), hand: $('.hand-btn', seat), num: $('.hand-num', seat), slap: $('.slap-btn', seat), flash: null,
    };
    s.hand.insertBefore(cardEl(null), s.num);
    s.name.textContent = p.name;
    const play = (e) => { e.preventDefault(); unlockAudio(); onPlay(i); };
    const slap = (e) => { e.preventDefault(); unlockAudio(); onSlap(i); };
    s.hand.addEventListener('pointerdown', play);
    s.slap.addEventListener('pointerdown', slap);
    // teclado / lector de pantalla (click sin puntero)
    s.hand.addEventListener('click', (e) => { if (e.detail === 0) play(e); });
    s.slap.addEventListener('click', (e) => { if (e.detail === 0) slap(e); });
    seats.push(s);
  });
  layout();
}

function safeInsets() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const r = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return r;
}

function layout() {
  if (!game || !seats.length) return;
  const board = $('#board');
  const W = board.clientWidth, H = board.clientHeight;
  if (!W || !H) return;
  const sf = safeInsets();
  const x0 = sf.l, x1 = W - sf.r, y0 = sf.t, y1 = H - sf.b;
  const positions = POS[game.n];
  const has = (p) => positions.includes(p);
  const tb = clamp(H * 0.19, 104, 150);
  const sd = clamp(Math.min(W, H) * 0.21, 96, 120);
  const pad = 8;
  const sideTop = has('top') ? y0 + tb : y0;
  const sideBot = has('bottom') ? y1 - tb : y1;
  const cx0 = has('left') ? x0 + sd : x0, cx1 = has('right') ? x1 - sd : x1;

  seats.forEach((s) => {
    const horizontal = s.pos === 'top' || s.pos === 'bottom';
    let rect;
    if (s.pos === 'bottom') rect = { l: x0, t: y1 - tb, w: x1 - x0, h: tb };
    else if (s.pos === 'top') rect = { l: x0, t: y0, w: x1 - x0, h: tb };
    else if (s.pos === 'left') rect = { l: x0, t: sideTop, w: sd, h: sideBot - sideTop };
    else rect = { l: x1 - sd, t: sideTop, w: sd, h: sideBot - sideTop };
    Object.assign(s.el.style, { left: rect.l + 'px', top: rect.t + 'px', width: rect.w + 'px', height: rect.h + 'px' });
    const length = Math.min((horizontal ? rect.w : rect.h) - pad * 2, horizontal ? 520 : 380);
    const thick = (horizontal ? rect.h : rect.w) - pad * 2;
    Object.assign(s.inner.style, { width: length + 'px', height: thick + 'px', transform: `translate(-50%, -50%) rotate(${ROT[s.pos]}deg)` });
    const cardW = (thick - 18) / 1.6;
    s.hand.style.setProperty('--cw', cardW.toFixed(1));
    s.slap.style.height = clamp(thick - 18, 44, 72) + 'px';
    s.name.style.fontSize = thick < 112 ? '16px' : '18px';
  });

  const cw = cx1 - cx0, ch = sideBot - sideTop;
  Object.assign(centerEl.style, { left: cx0 + 'px', top: sideTop + 'px', width: cw + 'px', height: ch + 'px' });
  const pw = clamp(Math.min(cw / 1.75, ch / 1.95, 170), 44, 170);
  pileEl.style.setProperty('--cw', pw.toFixed(1));
  lastPileKey = ''; // forzar redibujado con el tamaño nuevo
  if (game) render(null);
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 120));

/* ---- acciones ---- */
function onPlay(i) {
  if (!game) return;
  const r = game.play(i);
  if (!r.ok) {
    if (r.reason === 'notturn') { const h = seats[i].hand; h.classList.remove('shake'); void h.offsetWidth; h.classList.add('shake'); }
    return;
  }
  act(r);
}

function onSlap(i) {
  if (!game) return;
  const s = seats[i];
  const r = game.slap(i, Date.now());
  if (!r.ok) { return; }
  s.slap.classList.add('hit'); setTimeout(() => s.slap.classList.remove('hit'), 140);
  act(r);
}

let dropPos = null;
function act(res) {
  dropPos = null;
  for (const ev of res.events) handle(ev);
  render(dropPos);
  save();
  schedulePending();
}

function schedulePending() {
  if (!game) return;
  if (game.pending && !pendingTimer && modal.hidden && !game.over) {
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      const r = game.resolvePending();
      if (r.ok) act(r);
    }, game.opts.collectDelayMs);
  } else if (!game.pending && pendingTimer) {
    clearTimeout(pendingTimer); pendingTimer = null;
  }
}

function handle(ev) {
  const nameOf = (i) => game.players[i].name;
  switch (ev.type) {
    case 'play':
      dropPos = seats[ev.player].pos;
      sfx.card();
      break;
    case 'collect': {
      flyPile(seats[ev.player].pos);
      if (ev.cause === 'slap') {
        burst(); sfx.slap();
        flashAll((i) => (i === ev.player ? `¡TAPETE! +${ev.count}` : `¡TAPETE de ${nameOf(ev.player)}! +${ev.count}`), false, 2200);
      } else {
        sfx.collect();
        flashAll((i) => (i === ev.player ? `¡Te llevas ${ev.count}!` : `${nameOf(ev.player)} se lleva ${ev.count}`), false, 2000);
      }
      break;
    }
    case 'badslap':
      sfx.bad();
      flashAll((i) => (i === ev.player ? `¡No valía! −${ev.lost}` : `${nameOf(ev.player)} se equivoca (−${ev.lost})`), true, 2000);
      break;
    case 'over':
      setTimeout(() => showWin(ev.winner), 650);
      break;
    default:
  }
}

function flashAll(textFor, alert, ms) {
  seats.forEach((s) => { s.flash = { text: textFor(s.i), alert }; });
  clearTimeout(flashAll.t);
  flashAll.t = setTimeout(() => { seats.forEach((s) => (s.flash = null)); render(null); }, ms);
}

function burst() {
  const b = document.createElement('div');
  b.className = 'burst';
  flyEl.appendChild(b);
  setTimeout(() => b.remove(), 700);
}

function flyPile(pos) {
  const kids = [...pileEl.children];
  const [fx, fy] = FROM[pos];
  const dist = Math.max(centerEl.clientWidth, centerEl.clientHeight) * 0.75 + 120;
  kids.forEach((k) => {
    k.classList.remove('drop');
    k.style.animation = 'none';
    k.style.transform = getComputedStyle(k).transform;
    flyEl.appendChild(k);
    k.classList.add('fly');
  });
  void flyEl.offsetWidth;
  kids.forEach((k) => { k.style.transform = `translate(${fx * dist}px, ${fy * dist}px) scale(0.55)`; k.style.opacity = '0'; });
  setTimeout(() => kids.forEach((k) => k.remove()), 480);
  lastPileKey = '';
}

/* ---- dibujar ---- */
function statusFor(i) {
  if (game.over) return '';
  if (game.pending) return `Recoge ${game.players[game.pending.to].name}…`;
  if (i === game.cur) {
    const r = game.challenge ? game.challenge.remaining : 0;
    return r ? `Tira ${r} carta${r > 1 ? 's' : ''}` : 'Tu turno';
  }
  if (game.challenge && game.challenge.by === i) return 'Ha lanzado el reto';
  return '';
}

function render(drop) {
  if (!game) return;
  seats.forEach((s) => {
    const p = game.players[s.i];
    const turn = !game.over && !game.pending && s.i === game.cur;
    s.el.classList.toggle('active', turn);
    s.count.textContent = `${p.hand.length} ${p.hand.length === 1 ? 'carta' : 'cartas'}`;
    s.num.textContent = p.hand.length;
    s.hand.classList.toggle('wait', !turn);
    s.hand.classList.toggle('empty', p.hand.length === 0);
    const f = s.flash;
    s.msg.textContent = f ? f.text : statusFor(s.i);
    s.msg.classList.toggle('alert', !!(f && f.alert));
  });
  renderPile(drop);
}

function renderPile(drop) {
  const show = game.pile.slice(-3);
  const key = game.pile.length + ':' + show.map((c) => c.id).join(',');
  if (key === lastPileKey && !drop) return;
  lastPileKey = key;
  pileEl.querySelectorAll('.pile-card').forEach((n) => n.remove());
  const n = show.length;
  const offs = n === 1 ? [0] : n === 2 ? [-0.2, 0.2] : [-0.4, 0, 0.4];
  show.forEach((c, k) => {
    const e = cardEl(c);
    e.classList.add('pile-card');
    let h = 0; for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) % 997;
    e.style.setProperty('--tx', offs[k]);
    e.style.setProperty('--ty', k === 1 ? -0.02 : 0.02);
    e.style.setProperty('--rot', (h % 11) - 5);
    if (drop && k === n - 1) {
      const [fx, fy] = FROM[drop];
      e.classList.add('drop');
      e.style.setProperty('--dx', fx * 240 + 'px');
      e.style.setProperty('--dy', fy * 240 + 'px');
      e.style.setProperty('--spin', (h % 2 ? 1 : -1) * 18 + 'deg');
    }
    pileEl.appendChild(e);
  });
  $('#pile-count').textContent = game.pile.length ? String(game.pile.length) : '';
}

/* ---- fin de partida ---- */
function showWin(winner) {
  if (!game || !game.over) return;
  const name = game.players[winner].name;
  const entry = recordResult(names, name);
  store.del('tapete.save');
  sfx.win();
  openModal(`<p style="margin:0;color:#4b6b58;font-size:14px;letter-spacing:.08em;text-transform:uppercase">Fin de la partida</p>
    <div class="big">¡${esc(name)} gana!</div>
    <p>${esc(name)} lleva <b>${entry.w}</b> ${entry.w === 1 ? 'victoria' : 'victorias'} en ${entry.g} ${entry.g === 1 ? 'partida' : 'partidas'}.</p>
    <button class="btn" data-act="again">Revancha</button>
    <button class="btn ghost" data-act="rank">Ver ranking</button>
    <button class="btn ghost" data-act="menu">Menú</button>`);
}

/* ============ arranque ============ */
// Evitar zoom y rebotes en iOS
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault()));
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('.panel, .modal-card')) e.preventDefault();
}, { passive: false });
document.addEventListener('contextmenu', (e) => { if (e.target.closest('#game')) e.preventDefault(); });

preloadFaces().then(() => {
  if (game) { lastPileKey = ''; render(null); }
});

function offlineNote() {
  const note = $('#offline-note');
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!standalone && ios) note.textContent = 'Para tenerlo siempre: Compartir ▸ Añadir a pantalla de inicio';
  else if (navigator.serviceWorker && navigator.serviceWorker.controller) note.textContent = 'Listo para jugar sin conexión';
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(offlineNote).catch(() => {});
}
offlineNote();
refreshHome();

// para depuración y pruebas automáticas
window.__tapete = { get game() { return game; }, startGame };
