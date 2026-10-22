import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFFICULTIES, generatePieces, shuffledIds, hashSeed, isBorderPiece,
  canSnap, canPlace, rotatePiece, targetFor, progress, formatTime, getSaveKey, validateSavedState,
  returnPieceToTray, isDoubleClickOnPiece
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

test('grades de até 1.000 peças, com formatos variados e costuras compartilhadas', () => {
  for (const difficulty of DIFFICULTIES) {
    const pieces = generatePieces(difficulty.cols, difficulty.rows, 4582);
    assert.equal(pieces.length, difficulty.count);
    const styles = new Set();
    for (const piece of pieces) {
      if (piece.joints.right) {
        styles.add(piece.joints.right.style);
        assert.deepEqual(piece.joints.right, pieces[piece.id + 1].joints.left);
      }
      if (piece.joints.bottom) {
        assert.deepEqual(piece.joints.bottom, pieces[piece.id + difficulty.cols].joints.top);
      }
      assert.ok([0, 90, 180, 270].includes(piece.rotation));
    }
    if (difficulty.count >= 96) assert.equal(styles.size, 4);
  }
});

test('rotação em quartos de volta e encaixe apenas quando alinhada', () => {
  const p = generatePieces(8, 6, 37)[18];
  const { x, y } = targetFor(p, 8, 6);
  p.rotation = 0;
  assert.equal(canPlace(p, x, y, 8, 6), true);
  assert.equal(rotatePiece(p), 90);
  assert.equal(canPlace(p, x, y, 8, 6), false);
  assert.equal(rotatePiece(p, 3), 0);
  assert.equal(canPlace(p, x, y, 8, 6), true);
  p.state = 'solved';
  assert.equal(rotatePiece(p), 0);
});

test('valida salvamentos com rotação e rejeita rotações inválidas', () => {
  const pieces = Array.from({ length: 12 }, () => ({ state: 'tray', rotation: 270 }));
  assert.equal(validateSavedState({ pieces }, 4, 3), true);
  assert.equal(validateSavedState({ pieces: [{ ...pieces[0], rotation: 45 }, ...pieces.slice(1)] }, 4, 3), false);
  assert.equal(validateSavedState({ pieces: Array.from({length: 12}, () => ({ state: 'tray' })) }, 4, 3), true);
});

test('duplo clique na mesma peça, no mesmo local e dentro do intervalo', () => {
  const first = { id: 7, x: 420, y: 130, time: 1000 };
  assert.equal(isDoubleClickOnPiece(null, first), false);
  assert.equal(isDoubleClickOnPiece(first, { id: 7, x: 425, y: 132, time: 1220 }), true);
  assert.equal(isDoubleClickOnPiece(first, { id: 8, x: 425, y: 132, time: 1220 }), false);
  assert.equal(isDoubleClickOnPiece(first, { id: 7, x: 425, y: 132, time: 1550 }), false);
  assert.equal(isDoubleClickOnPiece(first, { id: 7, x: 480, y: 132, time: 1220 }), false);
  assert.equal(isDoubleClickOnPiece(first, { id: 7, x: 420, y: 130, time: 900 }), false);
});

test('devolver peça solta para a bandeja mantém rotação e não altera as encaixadas', () => {
  const p = generatePieces(8, 6, 7)[12];
  p.state = 'board'; p.x = 320; p.y = 190; p.rotation = 270;
  assert.equal(returnPieceToTray(p), true);
  assert.equal(p.state, 'tray');
  assert.equal(p.x, null);
  assert.equal(p.y, null);
  assert.equal(p.rotation, 270);
  assert.equal(returnPieceToTray(p), false);
  p.state = 'solved'; p.x = 5; p.y = 8;
  assert.equal(returnPieceToTray(p), false);
  assert.equal(p.state, 'solved');
  assert.equal(p.x, 5);
});
