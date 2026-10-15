import assert from 'node:assert/strict';
import { Game, makeDeck, shuffle, CHALLENGE } from '../js/game.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

// Mulberry32: generador con semilla para que las partidas simuladas sean repetibles
const seeded = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

test('la baraja tiene 52 cartas únicas y sin comodines', () => {
  const d = makeDeck();
  assert.equal(d.length, 52);
  assert.equal(new Set(d.map((c) => c.id)).size, 52);
  assert.ok(d.every((c) => !/joker|jk/i.test(c.id)));
});

test('se reparten las 52 cartas entre 2, 3, 4 jugadores', () => {
  for (const n of [2, 3, 4]) {
    const g = new Game(Array.from({ length: n }, (_, i) => 'P' + i), { rng: seeded(n) }).start();
    assert.equal(g.players.reduce((s, p) => s + p.hand.length, 0), 52);
    assert.ok(g.cur >= 0 && g.cur < n);
  }
});

test('turno normal: se pasa al siguiente y no se puede tirar fuera de turno', () => {
  const g = Game.fromHands(['A', 'B'], [['2S', '3S'], ['4S', '5S']], 0);
  assert.equal(g.play(1).reason, 'notturn');
  g.play(0);
  assert.equal(g.cur, 1);
});

test('tras una A el siguiente tira 4 cartas y, sin figura, el retador recoge', () => {
  const g = Game.fromHands(['A', 'B'], [['AS', '2D', '3D'], ['4C', '6H', '8C', '9D', '10S']], 0);
  g.play(0);
  assert.equal(g.cur, 1);
  assert.deepEqual(g.challenge, { by: 0, remaining: 4 });
  for (let k = 0; k < 3; k++) { g.play(1); assert.equal(g.cur, 1); assert.equal(g.pending, null); }
  const r = g.play(1);
  assert.ok(r.events.some((e) => e.type === 'pending' && e.to === 0));
  assert.equal(g.play(1).reason, 'pending');
  const done = g.resolvePending();
  assert.equal(done.events[0].count, 5);
  assert.equal(g.players[0].hand.length, 2 + 5);
  assert.equal(g.cur, 0);
  assert.equal(g.challenge, null);
});

test('K=3, Q=2, J=1 cartas', () => {
  for (const [r, n] of [['K', 3], ['Q', 2], ['J', 1]]) {
    const g = Game.fromHands(['A', 'B'], [[r + 'S', '2D'], ['3C', '5H', '7C', '9D']], 0);
    g.play(0);
    assert.equal(g.challenge.remaining, n);
    assert.equal(CHALLENGE[r], n);
  }
});

test('una figura durante el reto lo corta y se lo pasa al siguiente', () => {
  const g = Game.fromHands(['A', 'B', 'C'], [['AS', '2D'], ['3C', 'KH', '5C'], ['6D', '7D', '9C', '8S']], 0);
  g.play(0);                      // A → B debe tirar 4
  g.play(1);                      // 3C (quedan 3)
  g.play(1);                      // KH: corta, ahora C debe tirar 3
  assert.equal(g.cur, 2);
  assert.deepEqual(g.challenge, { by: 1, remaining: 3 });
  g.play(2); g.play(2);
  const r = g.play(2);
  assert.ok(r.events.some((e) => e.type === 'pending' && e.to === 1)); // recoge B, no A
});

test('si el que debe defenderse se queda sin cartas, recoge el retador', () => {
  const g = Game.fromHands(['A', 'B'], [['AS', '2D'], ['3C']], 0);
  const r = g.play(0);
  assert.ok(r.events.some((e) => e.type === 'defend') === false);
  const r2 = g.play(1);
  assert.ok(g.pending && g.pending.to === 0);
  g.resolvePending();
  assert.equal(g.players[1].hand.length, 0);
});

test('TAPETE con pareja: se lleva el montón el primero y le toca tirar', () => {
  const g = Game.fromHands(['A', 'B', 'C'], [['5S', '9S'], ['5H', '2C'], ['4D', '8D']], 0);
  g.play(0); g.play(1);
  assert.equal(g.slapKind(), 'pair');
  const r = g.slap(2, 1000);
  assert.equal(r.events[0].type, 'collect');
  assert.equal(r.events[0].kind, 'pair');
  assert.equal(g.players[2].hand.length, 4);
  assert.equal(g.cur, 2);
  assert.equal(g.pile.length, 0);
});

test('TAPETE con sándwich (A-x-A)', () => {
  const g = Game.fromHands(['A', 'B'], [['7S', '9S'], ['4H', '2C']], 0);
  g.play(0); g.play(1); g.play(0);
  assert.equal(g.pile.map((c) => c.rank).join(), '7,4,9'.replace('9', '9'));
  const g2 = Game.fromHands(['A', 'B'], [['7S', '7D'], ['4H', '2C']], 0);
  g2.play(0); g2.play(1); g2.play(0);
  assert.equal(g2.slapKind(), 'sandwich');
});

test('el TAPETE vale aunque haya un reto en marcha, y lo anula', () => {
  const g = Game.fromHands(['A', 'B'], [['QS', '2D'], ['QH', '3C', '4C']], 0);
  g.play(0); g.play(1);              // Q y Q
  assert.equal(g.slapKind(), 'pair');
  g.slap(0, 5000);
  assert.equal(g.challenge, null);
  assert.equal(g.cur, 0);
});

test('TAPETE falso: pierdes 2 cartas debajo del montón', () => {
  const g = Game.fromHands(['A', 'B'], [['5S', '9S', '2S'], ['6H', 'JC', '8C']], 0);
  g.play(0); g.play(1);
  const r = g.slap(0, 100);
  assert.equal(r.events[0].type, 'badslap');
  assert.equal(r.events[0].lost, 2);
  assert.equal(g.players[0].hand.length, 0);
  assert.equal(g.pile.length, 4);
  assert.equal(g.pile[g.pile.length - 1].id, '6H'); // la carta de arriba no cambia
});

test('quien llega tarde a un TAPETE no es penalizado (periodo de gracia)', () => {
  const g = Game.fromHands(['A', 'B'], [['5S', '9S', '2S'], ['5H', 'JC', '8C']], 0);
  g.play(0); g.play(1);
  g.slap(0, 1000);
  const late = g.slap(1, 1300);
  assert.equal(late.ok, false);
  assert.equal(late.reason, 'grace');
  assert.equal(g.players[1].hand.length, 2);
});

test('un jugador sin cartas puede volver con un TAPETE', () => {
  const g = Game.fromHands(['A', 'B', 'C'], [['5S', '9S'], ['5H', '2C'], []], 0);
  g.play(0); g.play(1);
  g.slap(2, 1000);
  assert.equal(g.players[2].hand.length, 2);
});

test('gana quien se queda con las 52 cartas', () => {
  const g = new Game(['A', 'B'], { rng: seeded(1) }).start();
  g.players[0].hand.push(...g.players[1].hand.splice(0));
  const ev = [];
  g.checkOver(ev);
  assert.equal(g.over, true);
  assert.equal(g.winner, 0);
});

test('el último jugador con cartas recoge el montón y gana', () => {
  const g = Game.fromHands(['A', 'B'], [['3S', '4D'], []], 0);
  g.pile = [{ id: '2C', rank: '2', suit: 'C' }];
  const r = g.play(0);
  assert.ok(g.pending && g.pending.to === 0);
  g.resolvePending();
  assert.equal(g.players[0].hand.length, 3);
  const g2 = Game.fromHands(['A', 'B'], [['3S'], []], 0);
  g2.pile = [...Array(51)].map((_, k) => ({ id: 'x' + k, rank: String(k), suit: 'S' }));
  g2.play(0); g2.resolvePending();
  assert.equal(g2.over, true);
  assert.equal(g2.winner, 0);
});

test('guardar y restaurar una partida', () => {
  const g = new Game(['A', 'B', 'C'], { rng: seeded(7) }).start();
  g.play(g.cur);
  const r = Game.restore(g.serialize());
  assert.deepEqual(r.players.map((p) => p.hand.length), g.players.map((p) => p.hand.length));
  assert.equal(r.pile.length, g.pile.length);
  assert.equal(r.cur, g.cur);
});

test('partidas simuladas: siempre terminan y siempre suman 52 cartas', () => {
  for (const n of [2, 3, 4]) {
    for (let seed = 1; seed <= 25; seed++) {
      const rng = seeded(seed * 31 + n);
      const g = new Game(Array.from({ length: n }, (_, i) => 'P' + i), { rng }).start();
      let t = 1000, steps = 0;
      while (!g.over && steps++ < 200000) {
        // los jugadores cantan TAPETE cuando vale, con un poco de suerte
        if (g.slapKind() && rng() < 0.7) { g.slap(Math.floor(rng() * n), (t += 2000)); }
        else if (g.pending) g.resolvePending();
        else g.play(g.cur);
        const total = g.players.reduce((s, p) => s + p.hand.length, 0) + g.pile.length;
        assert.equal(total, 52);
      }
      assert.ok(g.over, `partida ${n} jugadores, semilla ${seed} no terminó`);
    }
  }
});

console.log(`\n${passed} tests OK`);
