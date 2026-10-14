// TAPETE — motor de reglas (sin DOM, sin temporizadores: se puede probar en Node).
//
// Reglas:
//  - Baraja de 52 cartas (sin comodines), repartida entera entre los jugadores.
//  - Empieza un jugador al azar y se tira de uno en uno en sentido horario.
//  - Figuras: tras A el siguiente tira 4 cartas, tras K 3, tras Q 2, tras J 1.
//    Si en esas cartas sale otra figura, el reto se corta y pasa al siguiente.
//    Si el jugador tira todas sin figura, quien lanzó el reto se lleva el montón.
//  - TAPETE: el más rápido en pulsar cuando las dos últimas cartas son del mismo
//    número (pareja) o la última y la antepenúltima (sándwich) se lleva el montón.
//    Pulsar sin que valga = pierdes cartas (se van debajo del montón).
//  - Gana quien se queda con las 52 cartas.

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['S', 'H', 'D', 'C']; // picas, corazones, diamantes, tréboles
export const CHALLENGE = { A: 4, K: 3, Q: 2, J: 1 };

export const DEFAULTS = {
  penalty: 2,        // cartas que pierdes por un TAPETE falso
  graceMs: 900,      // tras un TAPETE bueno, los que llegan tarde no se penalizan
  collectDelayMs: 1400, // pausa antes de que el retador recoja (para poder cantar TAPETE)
};

export function makeDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ id: r + s, rank: r, suit: s });
  return deck; // 52 cartas, sin comodines
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const isFace = (card) => card.rank in CHALLENGE;

export class Game {
  constructor(names, opts = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.rng = opts.rng || Math.random;
    this.players = names.map((name) => ({ name, hand: [] }));
    this.pile = [];          // el último elemento es la carta de arriba
    this.cur = 0;            // jugador al que le toca tirar
    this.challenge = null;   // { by, remaining }
    this.pending = null;     // { to } recogida en espera (el reto falló)
    this.over = false;
    this.winner = null;
    this.graceUntil = 0;
    this.lastSlap = null;
  }

  /** Reparte toda la baraja y elige quién empieza. */
  start() {
    const deck = shuffle(makeDeck(), this.rng);
    deck.forEach((card, i) => this.players[i % this.players.length].hand.push(card));
    this.cur = Math.floor(this.rng() * this.players.length);
    return this;
  }

  /** Para tests: partida con manos concretas (la mano se toma de arriba a abajo). */
  static fromHands(names, hands, cur = 0, opts = {}) {
    const g = new Game(names, opts);
    g.players.forEach((p, i) => (p.hand = hands[i].map(parse)));
    g.cur = cur;
    return g;
  }

  get n() { return this.players.length; }

  nextWithCards(from) {
    for (let k = 1; k <= this.n; k++) {
      const i = (from + k) % this.n;
      if (this.players[i].hand.length) return i;
    }
    return -1;
  }

  /** ¿Valen ahora mismo las cartas de arriba para cantar TAPETE? */
  slapKind() {
    const p = this.pile, n = p.length;
    if (n >= 2 && p[n - 1].rank === p[n - 2].rank) return 'pair';
    if (n >= 3 && p[n - 1].rank === p[n - 3].rank) return 'sandwich';
    return null;
  }

  /** El jugador i tira la carta de arriba de su mano. */
  play(i) {
    if (this.over) return { ok: false, reason: 'over' };
    if (this.pending) return { ok: false, reason: 'pending' };
    if (i !== this.cur) return { ok: false, reason: 'notturn' };
    const me = this.players[i];
    if (!me.hand.length) return { ok: false, reason: 'empty' };

    const events = [];
    const card = me.hand.shift();
    this.pile.push(card);
    events.push({ type: 'play', player: i, card });

    if (isFace(card)) {
      // Nueva figura: corta cualquier reto anterior y se lo pasa al siguiente.
      const target = this.nextWithCards(i);
      if (target === -1 || target === i) {
        // Nadie más tiene cartas: se recoge el montón directamente.
        this.pending = { to: i, cause: 'empty' };
        events.push({ type: 'pending', to: i, cause: 'empty' });
      } else {
        this.challenge = { by: i, remaining: CHALLENGE[card.rank] };
        this.cur = target;
        events.push({ type: 'challenge', by: i, target, need: CHALLENGE[card.rank] });
      }
    } else if (this.challenge) {
      this.challenge.remaining -= 1;
      events.push({ type: 'defend', player: i, remaining: this.challenge.remaining });
      if (this.challenge.remaining <= 0) {
        this.pending = { to: this.challenge.by, cause: 'challenge' };
        events.push({ type: 'pending', to: this.challenge.by, cause: 'challenge' });
      }
    } else {
      const nxt = this.nextWithCards(i);
      if (nxt === -1 || nxt === i) {
        // Soy el único con cartas: recojo el montón (los demás aún pueden cantar TAPETE)
        this.pending = { to: i, cause: 'empty' };
        events.push({ type: 'pending', to: i, cause: 'empty' });
      } else {
        this.cur = nxt;
      }
    }

    this.settle(events);
    this.checkOver(events);
    return { ok: true, events };
  }

  /** Si al que le toca ya no tiene cartas, el reto se pierde o el turno salta. */
  settle(events) {
    if (this.over || this.pending) return;
    if (this.players[this.cur].hand.length) return;
    if (this.challenge) {
      this.pending = { to: this.challenge.by, cause: 'empty' };
      events.push({ type: 'pending', to: this.challenge.by, cause: 'empty' });
    } else {
      const nxt = this.nextWithCards(this.cur);
      if (nxt !== -1) this.cur = nxt;
    }
  }

  /** El jugador i canta TAPETE. */
  slap(i, now = Date.now()) {
    if (this.over) return { ok: false, reason: 'over' };
    if (now < this.graceUntil) return { ok: false, reason: 'grace' };
    const kind = this.slapKind();
    const events = [];
    if (kind) {
      const count = this.pile.length;
      const pile = this.pile.slice();
      this.takePile(i);
      this.challenge = null;
      this.pending = null;
      this.cur = i;
      this.graceUntil = now + this.opts.graceMs;
      events.push({ type: 'collect', player: i, count, pile, cause: 'slap', kind });
    } else {
      const me = this.players[i];
      const lose = Math.min(this.opts.penalty, me.hand.length);
      const lost = me.hand.splice(0, lose);
      this.pile.unshift(...lost); // debajo del montón
      events.push({ type: 'badslap', player: i, lost: lose });
      this.settle(events);
    }
    this.checkOver(events);
    return { ok: true, events };
  }

  /** Cierra la recogida pendiente (la llama la interfaz tras una pequeña pausa). */
  resolvePending() {
    if (!this.pending || this.over) return { ok: false, reason: 'nopending' };
    const to = this.pending.to;
    const count = this.pile.length;
    const pile = this.pile.slice();
    const cause = this.pending.cause;
    this.takePile(to);
    this.challenge = null;
    this.pending = null;
    this.cur = to;
    const events = [{ type: 'collect', player: to, count, pile, cause }];
    this.checkOver(events);
    return { ok: true, events };
  }

  takePile(i) {
    this.players[i].hand.push(...this.pile);
    this.pile = [];
  }

  finish(events, winner) {
    this.over = true;
    this.winner = winner;
    events.push({ type: 'over', winner });
    return { ok: true, events };
  }

  checkOver(events) {
    if (this.over) return;
    const w = this.players.findIndex((p) => p.hand.length === 52);
    if (w !== -1) this.finish(events, w);
  }

  // ---- guardado ----
  serialize() {
    return JSON.stringify({
      names: this.players.map((p) => p.name),
      hands: this.players.map((p) => p.hand.map((c) => c.id)),
      pile: this.pile.map((c) => c.id),
      cur: this.cur, challenge: this.challenge, pending: this.pending,
      over: this.over, winner: this.winner,
    });
  }

  static restore(json, opts = {}) {
    const d = JSON.parse(json);
    const g = new Game(d.names, opts);
    g.players.forEach((p, i) => (p.hand = d.hands[i].map(parse)));
    g.pile = d.pile.map(parse);
    g.cur = d.cur; g.challenge = d.challenge; g.pending = d.pending;
    g.over = d.over; g.winner = d.winner;
    return g;
  }
}

export function parse(id) {
  const suit = id.slice(-1);
  const rank = id.slice(0, -1);
  return { id, rank, suit };
}
