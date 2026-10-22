import {
  BOARD_WIDTH as W, BOARD_HEIGHT as H, DIFFICULTIES, generatePieces,
  hashSeed, shuffledIds, isBorderPiece, canSnap, targetFor,
  progress, formatTime, getSaveKey, validateSavedState
} from './logic.js';

const $ = (selector) => document.querySelector(selector);
const images = {
  montanhas: { title: 'Montanhas tranquilas', source: 'assets/montanhas.svg' },
  praia: { title: 'Um dia no paraíso', source: 'assets/praia.svg' },
  cidade: { title: 'Metrópole ao entardecer', source: 'assets/cidade.svg' },
  espaco: { title: 'Viagem pelo cosmos', source: 'assets/espaco.svg' },
};
const board = $('#board');
const ctx = board.getContext('2d');
const frame = $('#board-frame');
const tray = $('#piece-tray');
const ghost = $('#drag-ghost');
let currentImage = 'montanhas';
let image = null;
let pieces = [];
let difficulty = 2;
let selectedId = null;
let filter = 'all';
let moves = 0;
let elapsed = 0;
let started = false;
let paused = false;
let guide = false;
let loadedGame = 0;
let lastTick = performance.now();
let lastSave = performance.now();
let activeDrag = null;
let hintTimeout = null;
let toastTimeout = null;
let winShown = false;

const grid = () => DIFFICULTIES[difficulty];
const pieceWidth = () => W / grid().cols;
const pieceHeight = () => H / grid().rows;
const saveKey = () => getSaveKey(currentImage, grid().cols, grid().rows);

function safeRead(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeWrite(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function saveGame() {
  if (!pieces.length) return;
  const snapshot = {
    pieces: pieces.map((p) => ({ state: p.state, x: p.x, y: p.y })),
    elapsed, moves, started, guide
  };
  const ok = safeWrite(saveKey(), JSON.stringify(snapshot));
  $('#save-indicator').textContent = ok ? '✓ Salvo automaticamente' : '⚠ Armazenamento indisponível';
  lastSave = performance.now();
}
function message(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.hidden = false;
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => { toast.hidden = true; }, 2900);
}

function side(path, x, y, length, angle, polarity, bump) {
  const uX = Math.cos(angle), uY = Math.sin(angle);
  const nX = uY, nY = -uX;
  const at = (fraction, outward = 0) => [x + uX * length * fraction + nX * outward, y + uY * length * fraction + nY * outward];
  const line = (fraction, outward = 0) => { const a = at(fraction, outward); path.lineTo(...a); };
  const bezier = (p1, p2, p3) => path.bezierCurveTo(...at(...p1), ...at(...p2), ...at(...p3));
  if (!polarity) { line(1); return; }
  const b = bump * polarity;
  line(0.29);
  bezier([0.325, 0], [0.355, -0.02 * b], [0.365, 0.14 * b]);
  bezier([0.295, 0.72 * b], [0.355, 1.0 * b], [0.5, 1.0 * b]);
  bezier([0.645, 1.0 * b], [0.705, 0.72 * b], [0.635, 0.14 * b]);
  bezier([0.645, -0.02 * b], [0.675, 0], [0.71, 0]);
  line(1);
}
function createPath(piece) {
  const w = pieceWidth(), h = pieceHeight();
  const b = Math.min(w, h) * 0.28;
  const path = new Path2D();
  path.moveTo(0, 0);
  side(path, 0, 0, w, 0, piece.edges.top, b);
  side(path, w, 0, h, Math.PI / 2, piece.edges.right, b);
  side(path, w, h, w, Math.PI, piece.edges.bottom, b);
  side(path, 0, h, h, -Math.PI / 2, piece.edges.left, b);
  path.closePath();
  return path;
}

function drawPiece(context, piece, x, y, scale = 1, style = 'loose') {
  const shape = piece.path;
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  if (style !== 'thumb') {
    context.shadowColor = style === 'solved' ? '#0003' : '#0009';
    context.shadowBlur = style === 'solved' ? 3 : 12;
    context.shadowOffsetY = style === 'solved' ? 1 : 4;
    context.fillStyle = '#182132';
    context.fill(shape);
  }
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.save();
  context.clip(shape);
  context.drawImage(image, -piece.col * pieceWidth(), -piece.row * pieceHeight(), W, H);
  context.restore();
  context.strokeStyle = style === 'solved' ? 'rgba(12,30,44,.72)' : 'rgba(255,255,255,.85)';
  context.lineWidth = (style === 'solved' ? 1.25 : 1.7) / Math.max(scale, 0.01) * (style === 'thumb' ? 0.65 : scale);
  context.lineJoin = 'round';
  context.stroke(shape);
  context.restore();
}

function redrawBoard() {
  if (!image) return;
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#253143'); bg.addColorStop(1, '#172234');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (guide) {
    ctx.save(); ctx.globalAlpha = 0.20; ctx.drawImage(image, 0, 0, W, H); ctx.restore();
  }
  ctx.strokeStyle = 'rgba(217,218,226,.13)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let col = 1; col < grid().cols; col++) { let x = col * pieceWidth(); ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let row = 1; row < grid().rows; row++) { let y = row * pieceHeight(); ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  const placed = pieces.filter((p) => p.state === 'solved');
  const loose = pieces.filter((p) => p.state === 'board' && !p.dragging);
  for (const piece of placed) {
    const target = targetFor(piece, grid().cols, grid().rows);
    drawPiece(ctx, piece, target.x, target.y, 1, 'solved');
  }
  for (const piece of loose) drawPiece(ctx, piece, piece.x, piece.y);
  if (!placed.length && !loose.length) {
    ctx.save(); ctx.textAlign = 'center';
    ctx.font = '700 23px system-ui'; ctx.fillStyle = 'rgba(239,223,211,.78)';
    ctx.fillText('Sua obra começa aqui', W / 2, H / 2 - 7);
    ctx.font = '16px system-ui'; ctx.fillStyle = 'rgba(188,199,210,.8)';
    ctx.fillText('Arraste as peças para montar a imagem', W / 2, H / 2 + 25);
    ctx.restore();
  }
}

function makeThumb(piece) {
  const thumb = document.createElement('canvas');
  thumb.width = 140; thumb.height = 110;
  const scale = Math.min(94 / pieceWidth(), 72 / pieceHeight());
  const startX = (thumb.width - pieceWidth() * scale) / 2;
  const startY = (thumb.height - pieceHeight() * scale) / 2;
  drawPiece(thumb.getContext('2d'), piece, startX, startY, scale, 'thumb');
  return thumb;
}
function updateTraySelection() {
  for (const element of tray.querySelectorAll('.piece-card')) {
    const active = Number(element.dataset.id) === selectedId;
    element.classList.toggle('selected', active);
    element.setAttribute('aria-pressed', String(active));
  }
}
function renderTray() {
  const fragment = document.createDocumentFragment();
  const order = shuffledIds(pieces.length, hashSeed(`${currentImage}/${grid().count}/shuffle`));
  let shown = 0;
  for (const id of order) {
    const piece = pieces[id];
    if (piece.state !== 'tray') continue;
    if (filter === 'border' && !isBorderPiece(piece)) continue;
    if (filter === 'center' && isBorderPiece(piece)) continue;
    const button = document.createElement('button');
    button.className = 'piece-card'; button.type = 'button';
    button.dataset.id = String(piece.id);
    button.setAttribute('aria-label', `Peça ${piece.id + 1} de ${pieces.length}${isBorderPiece(piece) ? ', peça de borda' : ', peça central'}`);
    button.setAttribute('aria-pressed', String(piece.id === selectedId));
    if (piece.id === selectedId) button.classList.add('selected');
    button.append(piece.thumbnail);
    button.addEventListener('pointerdown', (event) => beginDrag(event, piece, 'tray'));
    button.addEventListener('click', (event) => {
      if (event.detail === 0) { selectedId = piece.id; updateTraySelection(); message('Peça selecionada. Toque no lugar onde deseja colocá-la.'); }
    });
    fragment.append(button); shown++;
  }
  if (!shown) {
    const empty = document.createElement('div'); empty.className = 'piece-tray-empty';
    empty.textContent = pieces.some((p) => p.state === 'tray') ? 'Nenhuma peça nesta categoria. Experimente outro filtro.' : '✨ Todas as peças foram retiradas da bandeja!';
    fragment.append(empty);
  }
  tray.replaceChildren(fragment);
}
function updateUI() {
  const p = progress(pieces);
  $('#timer').textContent = formatTime(elapsed);
  $('#moves').textContent = String(moves);
  $('#progress-copy').textContent = `${p.solved} de ${p.total} peças`;
  $('#progress-percent').textContent = `${p.percentage}%`;
  $('#progress-fill').style.width = `${p.percentage}%`;
  $('#progress-track').setAttribute('aria-valuenow', p.percentage);
  $('#remaining-count').textContent = String(p.total - p.solved);
  $('#board-difficulty').textContent = `${p.total} peças`;
  $('#ghost-button').setAttribute('aria-pressed', String(guide));
  $('#pause-button').setAttribute('aria-pressed', String(paused));
  $('#pause-button').innerHTML = paused ? '<span>▶</span> Continuar' : '<span>Ⅱ</span> Pausar';
  $('#pause-overlay').hidden = !paused;
}
function startClock() { if (!started) { started = true; lastTick = performance.now(); } }
function tick() {
  const now = performance.now();
  if (image && started && !paused && progress(pieces).solved < pieces.length && document.visibilityState === 'visible') {
    elapsed += Math.min(now - lastTick, 1200);
    $('#timer').textContent = formatTime(elapsed);
    if (now - lastSave > 12000) saveGame();
  }
  lastTick = now;
}

function cleanDrag() {
  if (activeDrag) { const piece = pieces[activeDrag.id]; if (piece) piece.dragging = false; }
  activeDrag = null;
  ghost.hidden = true;
  window.removeEventListener('pointermove', moveDrag);
  window.removeEventListener('pointerup', endDrag);
  window.removeEventListener('pointercancel', cancelDrag);
}
function boardCoordinates(clientX, clientY) {
  const rect = board.getBoundingClientRect();
  return { x: (clientX - rect.left) * W / rect.width, y: (clientY - rect.top) * H / rect.height,
    inBoard: clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom };
}
function drawDragGhost(piece) {
  ghost.replaceChildren(makeThumb(piece));
}
function beginDrag(event, piece, from) {
  if (!image || paused || event.button !== 0 || piece.state === 'solved') return;
  event.preventDefault();
  if (activeDrag) cleanDrag();
  const at = boardCoordinates(event.clientX, event.clientY);
  const offsetX = from === 'board' ? at.x - piece.x : pieceWidth() / 2;
  const offsetY = from === 'board' ? at.y - piece.y : pieceHeight() / 2;
  selectedId = piece.id;
  updateTraySelection();
  activeDrag = { id: piece.id, from, startX: event.clientX, startY: event.clientY, offsetX, offsetY, moved: false };
  drawDragGhost(piece);
  ghost.style.left = `${event.clientX}px`; ghost.style.top = `${event.clientY}px`;
  window.addEventListener('pointermove', moveDrag, { passive: false });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', cancelDrag);
}
function moveDrag(event) {
  if (!activeDrag) return;
  event.preventDefault();
  const drag = activeDrag;
  if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) {
    if (!drag.moved) { drag.moved = true; if (drag.from === 'board') { pieces[drag.id].dragging = true; redrawBoard(); } }
    ghost.hidden = false;
    ghost.style.left = `${event.clientX}px`; ghost.style.top = `${event.clientY}px`;
  }
}
function cancelDrag() { cleanDrag(); redrawBoard(); }
function endDrag(event) {
  if (!activeDrag) return;
  const drag = activeDrag;
  const p = pieces[drag.id];
  const at = boardCoordinates(event.clientX, event.clientY);
  const didMove = drag.moved;
  cleanDrag();
  if (didMove) {
    if (at.inBoard) placePiece(p, at.x - drag.offsetX, at.y - drag.offsetY);
    else if (drag.from === 'board') { p.state = 'tray'; p.x = null; p.y = null; moves++; startClock(); saveGame(); }
  } else if (drag.from === 'tray') {
    message('Peça selecionada. Toque no tabuleiro para colocá-la.');
  }
  redrawBoard(); renderTray(); updateUI();
}
function placePiece(piece, x, y) {
  if (paused || piece.state === 'solved') return;
  startClock(); moves++;
  if (canSnap(piece, x, y, grid().cols, grid().rows)) {
    const goal = targetFor(piece, grid().cols, grid().rows);
    piece.state = 'solved'; piece.x = goal.x; piece.y = goal.y;
    message('✦ Encaixe perfeito!');
  } else {
    piece.state = 'board';
    piece.x = Math.max(-pieceWidth() * 0.35, Math.min(W - pieceWidth() * 0.65, x));
    piece.y = Math.max(-pieceHeight() * 0.35, Math.min(H - pieceHeight() * 0.65, y));
  }
  selectedId = null;
  saveGame();
  if (pieces.every((p) => p.state === 'solved')) complete();
}
function findLooseAt(x, y) {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i];
    if (p.state === 'board' && ctx.isPointInPath(p.path, x - p.x, y - p.y)) return p;
  }
  return null;
}
function onBoardPointerDown(event) {
  if (!image || paused || event.button !== 0) return;
  const where = boardCoordinates(event.clientX, event.clientY);
  const existing = findLooseAt(where.x, where.y);
  if (existing) { beginDrag(event, existing, 'board'); return; }
  const selected = selectedId === null ? null : pieces[selectedId];
  if (selected && selected.state === 'tray') {
    placePiece(selected, where.x - pieceWidth() / 2, where.y - pieceHeight() / 2);
    redrawBoard(); renderTray(); updateUI();
  }
}
function complete() {
  saveGame();
  if (winShown) return;
  winShown = true;
  $('#finish-time').textContent = formatTime(elapsed);
  $('#finish-moves').textContent = String(moves);
  $('#finish-pieces').textContent = String(pieces.length);
  window.setTimeout(() => { if (!$('#finish-dialog').open) $('#finish-dialog').showModal(); }, 350);
}

function setHint() {
  if (!image || paused) return;
  const chosen = selectedId != null && pieces[selectedId].state !== 'solved'
    ? pieces[selectedId]
    : pieces.find((p) => p.state === 'tray') || pieces.find((p) => p.state === 'board');
  if (!chosen) return message('O quebra-cabeça já está completo!');
  const spot = $('#hint-spot');
  spot.style.left = `${chosen.col * 100 / grid().cols}%`;
  spot.style.top = `${chosen.row * 100 / grid().rows}%`;
  spot.style.width = `${100 / grid().cols}%`;
  spot.style.height = `${100 / grid().rows}%`;
  spot.hidden = false;
  window.clearTimeout(hintTimeout);
  hintTimeout = window.setTimeout(() => { spot.hidden = true; }, 4200);
  message('A área iluminada mostra onde a peça deve encaixar.');
}
function setPaused(value) { paused = value; lastTick = performance.now(); updateUI(); saveGame(); }
function setGallerySelection() {
  $('#gallery').querySelectorAll('.gallery-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.image === currentImage);
  });
}
function ensureCustomTile() {
  const custom = safeRead('puzzle-studio:custom-image');
  if (!custom) return;
  images.custom = { title: 'Minha foto especial', source: custom };
  let button = $('#gallery .gallery-item[data-image="custom"]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button'; button.className = 'gallery-item'; button.dataset.image = 'custom';
    button.setAttribute('aria-label', 'Minha foto enviada');
    const preview = document.createElement('img'); preview.alt = 'Sua fotografia'; preview.draggable = false;
    const text = document.createElement('span'); text.textContent = 'Minha foto';
    button.append(preview, text); $('#gallery').append(button);
  }
  button.querySelector('img').src = custom;
}
function loadImage(source) {
  return new Promise((resolve, reject) => {
    const candidate = new Image();
    candidate.onload = () => resolve(candidate);
    candidate.onerror = () => reject(new Error('Não foi possível carregar esta imagem.'));
    candidate.src = source;
  });
}
async function loadGame(imageId = currentImage, chosenDifficulty = difficulty) {
  if (!images[imageId]) return message('Imagem indisponível.');
  if (activeDrag) cleanDrag();
  const token = ++loadedGame;
  try {
    const loadedImage = await loadImage(images[imageId].source);
    if (token !== loadedGame) return;
    image = loadedImage;
    currentImage = imageId;
    difficulty = chosenDifficulty;
    $('#difficulty').value = String(difficulty);
    $('#puzzle-title').textContent = images[imageId].title;
    $('#hint-spot').hidden = true;
    $('#finish-dialog').close?.();
    winShown = false;
    pieces = generatePieces(grid().cols, grid().rows, hashSeed(`${currentImage}:${grid().count}`));
    for (const p of pieces) p.path = createPath(p);
    for (const p of pieces) p.thumbnail = makeThumb(p);
    elapsed = 0; moves = 0; started = false; guide = false; paused = false; selectedId = null;
    const savedText = safeRead(saveKey());
    if (savedText) {
      try {
        const saved = JSON.parse(savedText);
        if (validateSavedState(saved, grid().cols, grid().rows)) {
          for (let i = 0; i < pieces.length; i++) {
            pieces[i].state = saved.pieces[i].state;
            pieces[i].x = saved.pieces[i].x;
            pieces[i].y = saved.pieces[i].y;
          }
          elapsed = Number.isFinite(saved.elapsed) && saved.elapsed >= 0 ? saved.elapsed : 0;
          moves = Number.isFinite(saved.moves) && saved.moves >= 0 ? saved.moves : 0;
          started = Boolean(saved.started);
          guide = Boolean(saved.guide);
        }
      } catch { /* dados antigos ou inválidos: começar um novo jogo */ }
    }
    lastTick = performance.now(); lastSave = performance.now();
    setGallerySelection();
    renderTray(); redrawBoard(); updateUI();
  } catch (err) { message(err.message || 'Não foi possível abrir a imagem.'); }
}

function prepareUpload(file) {
  return new Promise((resolve, reject) => {
    if (!file || file.size > 12 * 1024 * 1024) return reject(new Error('Escolha uma imagem de até 12 MB.'));
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return reject(new Error('Formato inválido: use JPG, PNG ou WEBP.'));
    const url = URL.createObjectURL(file);
    const temp = new Image();
    temp.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
        const c = canvas.getContext('2d');
        const sw = Math.min(temp.naturalWidth, temp.naturalHeight * 1.5);
        const sh = sw / 1.5;
        c.drawImage(temp, (temp.naturalWidth - sw) / 2, (temp.naturalHeight - sh) / 2, sw, sh, 0, 0, 1200, 800);
        resolve(canvas.toDataURL('image/jpeg', .84));
      } catch { reject(new Error('Não foi possível preparar a fotografia.')); }
      finally { URL.revokeObjectURL(url); }
    };
    temp.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a imagem enviada.')); };
    temp.src = url;
  });
}

$('#board').addEventListener('pointerdown', onBoardPointerDown);
$('#gallery').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-image]');
  if (button) loadGame(button.dataset.image, difficulty);
});
$('#difficulty').addEventListener('change', (event) => loadGame(currentImage, Number(event.target.value)));
$('#image-upload').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = await prepareUpload(file);
    const saved = safeWrite('puzzle-studio:custom-image', data);
    images.custom = { title: 'Minha foto especial', source: data };
    if (saved) ensureCustomTile();
    await loadGame('custom', difficulty);
    if (!saved) message('Sua foto pode ser usada, mas não há espaço para salvá-la no navegador.');
  } catch (err) { message(err.message); }
  finally { event.target.value = ''; }
});
$('.filter-controls').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  filter = button.dataset.filter;
  document.querySelectorAll('.filter').forEach((item) => {
    const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active));
  });
  renderTray();
});
$('#hint-button').addEventListener('click', setHint);
$('#ghost-button').addEventListener('click', () => { guide = !guide; redrawBoard(); updateUI(); saveGame(); });
$('#pause-button').addEventListener('click', () => setPaused(!paused));
$('#resume-button').addEventListener('click', () => setPaused(false));
$('#preview-button').addEventListener('click', () => { $('#preview-image').src = images[currentImage].source; $('#preview-dialog').showModal(); });
$('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
$('#fullscreen-button').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else $('#board-shell').requestFullscreen?.().catch(() => message('Tela cheia não disponível neste navegador.'));
});
$('#restart-button').addEventListener('click', async () => {
  const played = moves > 0 || elapsed > 0;
  if (played && !window.confirm('Reiniciar este quebra-cabeça? O progresso desta imagem e dificuldade será apagado.')) return;
  try { localStorage.removeItem(saveKey()); } catch { /* armazenamento bloqueado */ }
  await loadGame(currentImage, difficulty);
  message('Uma nova montagem começou!');
});
$('#play-again').addEventListener('click', async () => {
  $('#finish-dialog').close();
  try { localStorage.removeItem(saveKey()); } catch { /* armazenamento bloqueado */ }
  await loadGame(currentImage, difficulty);
});
$('#finish-close').addEventListener('click', () => $('#finish-dialog').close());
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog).close()));
document.querySelectorAll('.dialog:not(.finish-dialog)').forEach((dialog) => dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
}));
document.addEventListener('visibilitychange', () => { lastTick = performance.now(); saveGame(); });
window.addEventListener('pagehide', saveGame);
window.setInterval(tick, 250);
ensureCustomTile();
loadGame();
