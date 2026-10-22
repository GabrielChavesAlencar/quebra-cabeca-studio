import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFFICULTIES, generatePieces, shuffledIds, hashSeed, isBorderPiece,
  canSnap, targetFor, progress, formatTime, getSaveKey, validateSavedState
} from '../logic.js';

test('todas as dificuldades têm exatamente a quantidade de peças indicada', () => {
  for (const difficulty of DIFFICULTIES) {
    const pieces = generatePieces(difficulty.cols, difficulty.rows, hashSeed('paisagem'));
    assert.equal(pieces.length, difficulty.count);
    assert.equal(new Set(pieces.map((p) => p.id)).size, difficulty.count);
  }
});

test('as peças adjacentes têm encaixes complementares', () => {
  for (const difficulty of DIFFICULTIES) {
    const { cols, rows } = difficulty;
    const pieces = generatePieces(cols, rows, 1358);
    for (const piece of pieces) {
      if (piece.col + 1 < cols) assert.equal(piece.edges.right, -pieces[piece.id + 1].edges.left);
      else assert.equal(piece.edges.right, 0);
      if (piece.row + 1 < rows) assert.equal(piece.edges.bottom, -pieces[piece.id + cols].edges.top);
      else assert.equal(piece.edges.bottom, 0);
      if (!piece.col) assert.equal(piece.edges.left, 0);
      if (!piece.row) assert.equal(piece.edges.top, 0);
    }
  }
});

test('bordas são detectadas e cada grade é determinística', () => {
  assert.deepEqual(generatePieces(6, 4, 111), generatePieces(6, 4, 111));
  const pieces = generatePieces(6, 4, 111);
  assert.equal(pieces.filter(isBorderPiece).length, 2 * 6 + 2 * 4 - 4);
  assert.equal(isBorderPiece(pieces[7]), false);
});

test('embaralhamento é determinístico e sem duplicatas', () => {
  const a = shuffledIds(150, 137);
  assert.deepEqual(a, shuffledIds(150, 137));
  assert.equal(new Set(a).size, 150);
  assert.notDeepEqual(a, Array.from({length: 150}, (_, i) => i));
});

test('encaixa apenas perto da posição correta', () => {
  const piece = generatePieces(8, 6)[19];
  const target = targetFor(piece, 8, 6);
  assert.equal(canSnap(piece, target.x, target.y, 8, 6), true);
  assert.equal(canSnap(piece, target.x + 15, target.y + 10, 8, 6), true);
  assert.equal(canSnap(piece, target.x + 75, target.y + 50, 8, 6), false);
});

test('progresso, relógio e chave de salvamento', () => {
  const pieces = generatePieces(4, 3);
  pieces[0].state = 'solved';
  pieces[2].state = 'solved';
  assert.deepEqual(progress(pieces), { solved: 2, total: 12, percentage: 17 });
  assert.equal(formatTime(125000), '02:05');
  assert.equal(formatTime(3672000), '01:01:12');
  assert.equal(getSaveKey('montanhas', 4, 3), 'puzzle-studio:v1:montanhas:4x3');
});

test('não restaura autosaves corrompidos', () => {
  const value = {pieces: Array.from({length:12}, () => ({state:'tray'}))};
  assert.equal(validateSavedState(value, 4, 3), true);
  assert.equal(validateSavedState({pieces: []}, 4, 3), false);
  assert.equal(validateSavedState({pieces: [{state:'board',x:NaN,y:2}]}, 1, 1), false);
  assert.equal(validateSavedState({...value, pieces:[...value.pieces.slice(0,11), {state:'cheat'}]}, 4, 3), false);
});
