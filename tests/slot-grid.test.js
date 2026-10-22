import test from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTIES, generatePieces, targetFor } from '../logic.js';
import { renderPieceSlots } from '../slot-grid.js';

function makeFakeContext() {
  let point = { x: 0, y: 0 };
  const stack = [];
  const fills = [];
  const strokes = [];
  const clear = [];
  return {
    fills, strokes, clear,
    clearRect: (...args) => clear.push(args),
    save() { stack.push({ ...point }); },
    restore() { point = stack.pop(); },
    translate(x, y) { point.x += x; point.y += y; },
    fill(path) { fills.push({ path, ...point }); },
    stroke(path) { strokes.push({ path, ...point }); },
  };
}

test('cada encaixe do tabuleiro usa o contorno exato de sua peça, sem grade quadrada', () => {
  const cols = 6, rows = 4;
  const pieces = generatePieces(cols, rows, 927);
  for (const p of pieces) p.path = { id: p.id, samePiecePath: true };
  const ctx = makeFakeContext();
  renderPieceSlots(ctx, pieces, cols, rows, 960, 640);
  assert.deepEqual(ctx.clear, [[0, 0, 960, 640]]);
  assert.equal(ctx.fills.length, pieces.length);
  assert.equal(ctx.strokes.length, pieces.length * 2);
  for (const [i, piece] of pieces.entries()) {
    const goal = targetFor(piece, cols, rows);
    assert.deepEqual(ctx.fills[i], { path: piece.path, ...goal });
    assert.deepEqual(ctx.strokes[i * 2], { path: piece.path, ...goal });
    assert.deepEqual(ctx.strokes[i * 2 + 1], { path: piece.path, ...goal });
  }
});

test('1.000 encaixes são desenhados só no cache com um contorno por peça', () => {
  const { cols, rows } = DIFFICULTIES.at(-1);
  const pieces = generatePieces(cols, rows, 771);
  for (const p of pieces) p.path = p.id;
  const ctx = makeFakeContext();
  renderPieceSlots(ctx, pieces, cols, rows, 960, 640);
  assert.equal(ctx.fills.length, 1000);
  assert.equal(ctx.strokes.length, 2000);
  assert.deepEqual(ctx.fills[999], { path: 999, x: (cols - 1) * 960 / cols, y: (rows - 1) * 640 / rows });
});

test('um tabuleiro vazio limpa o cache sem tentar desenhar silhuetas', () => {
  const ctx = makeFakeContext();
  renderPieceSlots(ctx, [], 4, 3, 960, 640);
  assert.deepEqual(ctx.clear, [[0, 0, 960, 640]]);
  assert.equal(ctx.fills.length, 0);
});
