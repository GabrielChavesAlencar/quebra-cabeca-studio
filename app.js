import {
  BOARD_WIDTH as W, BOARD_HEIGHT as H, DIFFICULTIES, generatePieces,
  hashSeed, shuffledIds, isBorderPiece, canPlace, rotatePiece, targetFor,
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
let trayPage = 0;
const TRAY_PAGE_SIZE = 60;
let zoom = 1;
const solvedCache = document.createElement('canvas');
solvedCache.width = W; solvedCache.height = H;
const solvedContext = solvedCache.getContext('2d');
let customFingerprint = '';
let puzzleSeed = 0;


const grid = () => DIFFICULTIES[difficulty];
const pieceWidth = () => W / grid().cols;
const pieceHeight = () => H / grid().rows;
const saveKey = () => getSaveKey(currentImage === 'custom' ? `custom-${customFingerprint}` : currentImage, grid().cols, grid().rows);

function safeRead(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeWrite(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function saveGame() {
  if (!pieces.length) return;
  const snapshot = {
    pieces: pieces.map((p) => ({ state: p.state, x: p.x, y: p.y, rotation: p.rotation })),
    elapsed, moves, started, guide, puzzleSeed
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

// Os quatro estilos e as dimensões aleatórias formam encaixes diferentes,
// mas cada costura utiliza o mesmo perfil em ambas as peças vizinhas.
function side(path, x, y, length, angle, polarity, bump, joint, reverse = false) {
  const uX = Math.cos(angle), uY = Math.sin(angle);
  const nX = uY, nY = -uX;
  const at = (fraction, outward = 0) => [x + uX * length * fraction + nX * outward, y + uY * length * fraction + nY * outward];
  const line = (fraction, outward = 0) => path.lineTo(...at(fraction, outward));
  const curve = (p1, p2, p3) => path.bezierCurveTo(...at(...p1), ...at(...p2), ...at(...p3));
  if (!polarity || !joint) { line(1); return; }
  const c = reverse ? 1 - joint.center : joint.center;
  const w = joint.width;
  const b = bump * polarity * joint.depth;
  const start = c - w / 2;
  const end = c + w / 2;
  const style = joint.style;
  const neck = [0.19, 0.12, 0.24, 0.17][style] * w;
  const crown = [0.45, 0.30, 0.60, 0.52][style] * w;
  const shoulder = [0.12, 0.08, 0.16, 0.10][style];
  const peak = [1, 1.2, 0.78, 0.90][style] * b;
  line(start);
  curve([start + w * 0.10, 0], [c - neck, -shoulder * b], [c - neck, shoulder * b]);
  curve([c - crown, 0.65 * peak], [c - crown, peak], [c, peak]);
  curve([c + crown, peak], [c + crown, 0.65 * peak], [c + neck, shoulder * b]);
  curve([c + neck, -shoulder * b], [end - w * 0.10, 0], [end, 0]);
  line(1);
}
function createPath(piece) {
  const w = pieceWidth(), h = pieceHeight();
  const b = Math.min(w, h) * 0.35;
  const path = new Path2D();
  path.moveTo(0, 0);
  side(path, 0, 0, w, 0, piece.edges.top, b, piece.joints.top);
  side(path, w, 0, h, Math.PI / 2, piece.edges.right, b, piece.joints.right);
  side(path, w, h, w, Math.PI, piece.edges.bottom, b, piece.joints.bottom, true);
  side(path, 0, h, h, -Math.PI / 2, piece.edges.left, b, piece.joints.left, true);
  path.closePath();
  return path;
}

function drawPiece(context, piece, x, y, scale = 1, style = 'loose') {
  const shape = piece.path;
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  if (style !== 'solved' && piece.rotation) {
    context.translate(pieceWidth() / 2, pieceHeight() / 2);
    context.rotate(piece.rotation * Math.PI / 180);
    context.translate(-pieceWidth() / 2, -pieceHeight() / 2);
  }
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
  ctx.drawImage(solvedCache, 0, 0);
  const loose = pieces.filter((p) => p.state === 'board' && !p.dragging);
  for (const piece of loose) drawPiece(ctx, piece, piece.x, piece.y);
  if (!pieces.some((p) => p.state === 'solved') && !loose.length) {
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
  const scale = Math.min(74 / Math.max(pieceWidth(), pieceHeight()), 74 / Math.max(pieceWidth(), pieceHeight()));
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
  const order = shuffledIds(pieces.length, hashSeed(`${currentImage}/${grid().count}/shuffle`));
  const available = order.filter((id) => {
    const piece = pieces[id];
    return piece.state === 'tray' && (filter === 'all' || (filter === 'border') === isBorderPiece(piece));
  });
  const pages = Math.max(1, Math.ceil(available.length / TRAY_PAGE_SIZE));
  trayPage = Math.min(trayPage, pages - 1);
  const visible = available.slice(trayPage * TRAY_PAGE_SIZE, (trayPage + 1) * TRAY_PAGE_SIZE);
  const fragment = document.createDocumentFragment();
  for (const id of visible) {
    const piece = pieces[id];
    const button = document.createElement('button');
    button.className = 'piece-card'; button.type = 'button';
    button.dataset.id = String(piece.id);
    button.setAttribute('aria-label', `Peça ${piece.id + 1} de ${pieces.length}, girada ${piece.rotation} graus. Botão direito para girar.`);
    button.setAttribute('aria-pressed', String(piece.id === selectedId));
    if (piece.id === selectedId) button.classList.add('selected');
    // Miniaturas são criadas sob demanda; 1.000 canvases não são carregados de uma vez.
    if (!piece.thumbnail) piece.thumbnail = makeThumb(piece);
    button.append(piece.thumbnail);
    button.addEventListener('pointerdown', (event) => beginDrag(event, piece, 'tray'));
    button.addEventListener('contextmenu', (event) => { event.preventDefault(); rotateSelected(piece); });
    button.addEventListener('click', (event) => {
      if (event.detail === 0) { selectedId = piece.id; updateTraySelection(); message('Peça selecionada. Toque no tabuleiro para encaixá-la.'); }
    });
    fragment.append(button);
  }
  if (!visible.length) {
    const empty = document.createElement('div'); empty.className = 'piece-tray-empty';
    empty.textContent = available.length ? 'Nenhuma peça nesta página.' :
      pieces.some((p) => p.state === 'tray') ? 'Nenhuma peça nesta categoria. Experimente outro filtro.' : '✨ Todas as peças foram retiradas da bandeja!';
    fragment.append(empty);
  }
  tray.replaceChildren(fragment);
  $('#tray-page-label').textContent = `Página ${trayPage + 1} de ${pages} · ${available.length} peças na bandeja`;
  $('#tray-prev').disabled = trayPage === 0;
  $('#tray-next').disabled = trayPage >= pages - 1;
  $('#rotation-status').textContent = selectedId === null || pieces[selectedId]?.state === 'solved'
    ? 'Selecione uma peça para girar' : `Peça ${selectedId + 1}: ${pieces[selectedId].rotation}°`;
}
function refreshSolvedCache() {
  solvedContext.clearRect(0, 0, W, H);
  for (const piece of pieces) {
    if (piece.state === 'solved') {
      const target = targetFor(piece, grid().cols, grid().rows);
      drawPiece(solvedContext, piece, target.x, target.y, 1, 'solved');
    }
  }
}
function rotateSelected(piece = selectedId === null ? null : pieces[selectedId]) {
  if (!piece || paused || piece.state === 'solved') return;
  selectedId = piece.id;
  rotatePiece(piece);
  piece.thumbnail = null;
  startClock();
  if (piece.state === 'board' && canPlace(piece, piece.x, piece.y, grid().cols, grid().rows)) {
    placePiece(piece, piece.x, piece.y);
    message('✦ Peça girada e encaixada!');
  } else {
    saveGame();
    message(`Peça ${piece.id + 1} girada para ${piece.rotation}°`);
  }
  renderTray();
  redrawBoard();
  updateUI();
}
function changeZoom(nextZoom) {
  zoom = Math.min(4, Math.max(1, nextZoom));
  board.style.width = `${zoom * 100}%`;
  board.style.height = 'auto';
  $('#zoom-label').textContent = `${Math.round(zoom * 100)}%`;
  $('#zoom-out').disabled = zoom <= 1;
  $('#zoom-in').disabled = zoom >= 4;
  $('#hint-spot').hidden = true;
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
  if (canPlace(piece, x, y, grid().cols, grid().rows)) {
    const goal = targetFor(piece, grid().cols, grid().rows);
    piece.state = 'solved'; piece.x = goal.x; piece.y = goal.y;
    drawPiece(solvedContext, piece, goal.x, goal.y, 1, 'solved');
    piece.thumbnail = null;
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
    if (p.state !== 'board') continue;
    const cx = p.x + pieceWidth() / 2, cy = p.y + pieceHeight() / 2;
    const angle = -(p.rotation || 0) * Math.PI / 180;
    const dx = x - cx, dy = y - cy;
    const px = dx * Math.cos(angle) - dy * Math.sin(angle) + pieceWidth() / 2;
    const py = dx * Math.sin(angle) + dy * Math.cos(angle) + pieceHeight() / 2;
    if (ctx.isPointInPath(p.path, px, py)) return p;
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
  spot.style.left = `${board.offsetLeft + (chosen.col / grid().cols) * board.clientWidth - frame.scrollLeft}px`;
  spot.style.top = `${board.offsetTop + (chosen.row / grid().rows) * board.clientHeight - frame.scrollTop}px`;
  spot.style.width = `${board.clientWidth / grid().cols}px`;
  spot.style.height = `${board.clientHeight / grid().rows}px`;
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
  customFingerprint = String(hashSeed(custom.slice(0, 3000) + custom.length));
  images.custom = { title: safeRead('puzzle-studio:custom-name') || 'Minha foto especial', source: custom };
  ensureCustomTileFrom(custom);
}
function ensureCustomTileFrom(source) {
  let button = $('#gallery .gallery-item[data-image="custom"]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button'; button.className = 'gallery-item'; button.dataset.image = 'custom';
    button.setAttribute('aria-label', 'Minha foto enviada');
    const photo = document.createElement('img'); photo.alt = 'Sua fotografia'; photo.draggable = false;
    const label = document.createElement('span'); label.textContent = 'Minha foto';
    button.append(photo, label); $('#gallery').append(button);
  }
  button.querySelector('img').src = source;
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
    elapsed = 0; moves = 0; started = false; guide = false; paused = false; selectedId = null;
    const savedText = safeRead(saveKey());
    let saved = null;
    try {
      const parsed = savedText ? JSON.parse(savedText) : null;
      if (validateSavedState(parsed, grid().cols, grid().rows)) saved = parsed;
    } catch { /* salvamento inválido: nova partida */ }
    puzzleSeed = saved?.puzzleSeed !== undefined ? saved.puzzleSeed :
      (saved ? hashSeed(`${currentImage}:${grid().count}`) : Math.floor(Math.random() * 4294967296));
    pieces = generatePieces(grid().cols, grid().rows, puzzleSeed);
    for (const p of pieces) p.path = createPath(p);
    trayPage = 0;
    if (saved) {
          for (let i = 0; i < pieces.length; i++) {
            pieces[i].state = saved.pieces[i].state;
            pieces[i].x = saved.pieces[i].x;
            pieces[i].y = saved.pieces[i].y;
            // Salvamentos antigos não tinham rotação: suas peças permanecem retas.
            pieces[i].rotation = saved.pieces[i].rotation ?? 0;
          }
          elapsed = Number.isFinite(saved.elapsed) && saved.elapsed >= 0 ? saved.elapsed : 0;
          moves = Number.isFinite(saved.moves) && saved.moves >= 0 ? saved.moves : 0;
          started = Boolean(saved.started);
          guide = Boolean(saved.guide);
    }
    lastTick = performance.now(); lastSave = performance.now();
    refreshSolvedCache();
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
board.addEventListener('contextmenu', (event) => {
  if (paused || !image) return;
  const spot = boardCoordinates(event.clientX, event.clientY);
  const piece = findLooseAt(spot.x, spot.y) || (selectedId !== null ? pieces[selectedId] : null);
  if (piece && piece.state !== 'solved') { event.preventDefault(); rotateSelected(piece); }
});
$('#rotate-button').addEventListener('click', () => rotateSelected());
$('#tray-prev').addEventListener('click', () => { trayPage--; renderTray(); });
$('#tray-next').addEventListener('click', () => { trayPage++; renderTray(); });
$('#zoom-in').addEventListener('click', () => changeZoom(zoom + 0.5));
$('#zoom-out').addEventListener('click', () => changeZoom(zoom - 0.5));
document.addEventListener('keydown', (event) => {
  if ((event.key.toLowerCase() === 'r') && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey &&
      !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    rotateSelected();
  }
});
$('#gallery').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-image]');
  if (button) loadGame(button.dataset.image, difficulty);
});
$('#difficulty').addEventListener('change', (event) => loadGame(currentImage, Number(event.target.value)));
async function useUserPhoto(file) {
  if (!file) return;
  try {
    const data = await prepareUpload(file);
    const saved = safeWrite('puzzle-studio:custom-image', data);
    customFingerprint = String(hashSeed(data.slice(0, 3000) + data.length));
    const photoName = file.name.replace(/\.[^.]+$/, '').slice(0, 40);
    images.custom = { title: `Minha foto: ${photoName}`, source: data };
    safeWrite('puzzle-studio:custom-name', images.custom.title);
    ensureCustomTileFrom(data);
    await loadGame('custom', difficulty);
    if (!saved) message('Sua foto funciona, mas o navegador não tem espaço para guardá-la após fechar.');
  } catch (err) { message(err.message); }
}
$('#image-upload').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  try { await useUserPhoto(file); }
  finally { event.target.value = ''; }
});
const uploadZone = document.querySelector('.upload-button');
uploadZone.addEventListener('dragover', (event) => { event.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', async (event) => {
  event.preventDefault();
  uploadZone.classList.remove('drag-over');
  await useUserPhoto(event.dataTransfer?.files?.[0]);
});
$('.filter-controls').addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  filter = button.dataset.filter;
  trayPage = 0;
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
changeZoom(1);
ensureCustomTile();
loadGame();
