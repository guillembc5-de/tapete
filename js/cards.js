// Cartas de madera grabada con láser, dibujadas con HTML/CSS (funciona offline).
// Las figuras J, Q, K y el medallón del As salen de img/faces/<J|Q|K|A>.png:
// son máscaras (solo importa la transparencia) que se pintan con el color de la carta.

export const SUIT_SYMBOL = { S: '♠︎', H: '♥︎', D: '♦︎', C: '♣︎' };
const isRed = (s) => s === 'H' || s === 'D';

export const FACE_RANKS = ['A', 'K', 'Q', 'J'];
export const faceSrc = (r) => `img/faces/${r}.png`;

// Calienta la caché de imágenes (las figuras y la madera)
export function preloadFaces() {
  const urls = [...FACE_RANKS.map(faceSrc), 'img/wood.jpg'];
  return Promise.all(urls.map((u) => new Promise((res) => { const i = new Image(); i.onload = i.onerror = () => res(); i.src = u; })));
}

// Posiciones (x,y en %) de los símbolos de las cartas numéricas
const L = 30, R = 70, C = 50;
const PIPS = {
  '2': [[C, 18], [C, 82]],
  '3': [[C, 18], [C, 50], [C, 82]],
  '4': [[L, 18], [R, 18], [L, 82], [R, 82]],
  '5': [[L, 18], [R, 18], [C, 50], [L, 82], [R, 82]],
  '6': [[L, 18], [R, 18], [L, 50], [R, 50], [L, 82], [R, 82]],
  '7': [[L, 18], [R, 18], [C, 34], [L, 50], [R, 50], [L, 82], [R, 82]],
  '8': [[L, 18], [R, 18], [C, 34], [L, 50], [R, 50], [C, 66], [L, 82], [R, 82]],
  '9': [[L, 17], [R, 17], [L, 39], [R, 39], [C, 50], [L, 61], [R, 61], [L, 83], [R, 83]],
  '10': [[L, 17], [R, 17], [C, 28], [L, 39], [R, 39], [L, 61], [R, 61], [C, 72], [L, 83], [R, 83]],
};

function hash(id) { let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h; }

export function cardEl(card) {
  const el = document.createElement('div');
  if (!card) {
    el.className = 'card back';
    el.style.setProperty('--wx', '30%'); el.style.setProperty('--wy', '65%');
    el.innerHTML = '<div class="back-art"><span class="back-mark">T</span></div>';
    return el;
  }
  const { rank, suit } = card;
  const sym = SUIT_SYMBOL[suit];
  const h = hash(card.id);
  el.className = `card ${isRed(suit) ? 'red' : 'black'}`;
  el.dataset.id = card.id;
  // cada carta es un trozo distinto de tablero
  el.style.setProperty('--wx', (h % 100) + '%');
  el.style.setProperty('--wy', ((h * 7) % 100) + '%');
  const corner = (cls) => `<div class="corner ${cls}"><b>${rank}</b><i>${sym}</i></div>`;
  let center;
  if (rank === 'A') {
    center = `<div class="ace"><i class="ace-pip">${sym}</i><div class="medal" style="--mx:${(h * 3) % 100}%;--my:${(h * 5) % 100}%"></div></div>`;
  } else if (FACE_RANKS.includes(rank)) {
    center = `<div class="face"><div class="face-art ${rank}"></div></div>`;
  } else {
    center =
      '<div class="pips">' +
      PIPS[rank]
        .map(([x, y]) => `<i class="pip${y > 50 ? ' flip' : ''}" style="left:${x}%;top:${y}%">${sym}</i>`)
        .join('') +
      '</div>';
  }
  el.innerHTML = corner('tl') + corner('br') + center;
  return el;
}
