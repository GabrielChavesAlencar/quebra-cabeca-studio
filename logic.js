export const BOARD_WIDTH = 960;
export const BOARD_HEIGHT = 640;

export const DIFFICULTIES = Object.freeze([
  { label: 'Iniciante', cols: 4, rows: 3, count: 12 },
  { label: 'Tranquilo', cols: 6, rows: 4, count: 24 },
  { label: 'Intermediário', cols: 8, rows: 6, count: 48 },
  { label: 'Avançado', cols: 12, rows: 8, count: 96 },
  { label: 'Especialista', cols: 15, rows: 10, count: 150 },
  { label: 'Mestre', cols: 20, rows: 15, count: 300 },
]);

export function hashSeed(text) {
  let h = 2166136261;
  for (const char of String(text)) {
    h ^= char.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomFromSeed(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generatePieces(cols, rows, seed = 1) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) {
    throw new Error('A grade precisa ter pelo menos 2 colunas e 2 linhas.');
  }
  const rand = randomFromSeed(seed);
  const pieces = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const above = row > 0 ? pieces[(row - 1) * cols + col] : null;
      const before = col > 0 ? pieces[row * cols + col - 1] : null;
      const edges = {
        top: above ? -above.edges.bottom : 0,
        right: col === cols - 1 ? 0 : rand() < 0.5 ? 1 : -1,
        bottom: row === rows - 1 ? 0 : rand() < 0.5 ? 1 : -1,
        left: before ? -before.edges.right : 0,
      };
      pieces.push({ id: row * cols + col, row, col, edges, state: 'tray', x: null, y: null });
    }
  }
  return pieces;
}

export function shuffledIds(count, seed) {
  const arr = Array.from({ length: count }, (_, i) => i);
  const rand = randomFromSeed(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function isBorderPiece(piece) {
  return Object.values(piece.edges).some((edge) => edge === 0);
}

export function targetFor(piece, cols, rows, width = BOARD_WIDTH, height = BOARD_HEIGHT) {
  return { x: piece.col * width / cols, y: piece.row * height / rows };
}

export function canSnap(piece, x, y, cols, rows, width = BOARD_WIDTH, height = BOARD_HEIGHT) {
  const target = targetFor(piece, cols, rows, width, height);
  const cellW = width / cols;
  const cellH = height / rows;
  const rx = Math.max(11, cellW * 0.39);
  const ry = Math.max(11, cellH * 0.39);
  return ((x - target.x) / rx) ** 2 + ((y - target.y) / ry) ** 2 <= 1;
}

export function progress(pieces) {
  const solved = pieces.filter((p) => p.state === 'solved').length;
  return { solved, total: pieces.length, percentage: pieces.length ? Math.round(solved * 100 / pieces.length) : 0 };
}

export function formatTime(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = seconds % 60;
  return (hours ? String(hours).padStart(2, '0') + ':' : '') +
    String(minutes).padStart(2, '0') + ':' + String(remainder).padStart(2, '0');
}

export function getSaveKey(imageId, cols, rows) {
  return `puzzle-studio:v1:${imageId}:${cols}x${rows}`;
}

export function validateSavedState(value, cols, rows) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.pieces)) return false;
  if (value.pieces.length !== cols * rows) return false;
  const valid = ['tray', 'board', 'solved'];
  return value.pieces.every((piece) =>
    piece && valid.includes(piece.state) &&
    (piece.state !== 'board' ||
      (Number.isFinite(piece.x) && Number.isFinite(piece.y) &&
        piece.x >= -BOARD_WIDTH && piece.x <= BOARD_WIDTH * 2 &&
        piece.y >= -BOARD_HEIGHT && piece.y <= BOARD_HEIGHT * 2))
  );
}
