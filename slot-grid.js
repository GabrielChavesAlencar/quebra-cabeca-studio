import { targetFor } from './logic.js';

/**
 * Desenha as cavidades do tabuleiro usando exatamente o mesmo Path2D que
 * recorta cada peça. A tela desenha esta camada em cache; nenhum contorno
 * precisa ser reconstruído enquanto o jogador arrasta ou gira peças.
 *
 * O preenchimento discreto revela a silhueta de cada encaixe. Uma sombra
 * escura e uma borda clara o tornam visível mesmo com a imagem-guia ligada.
 */
export function renderPieceSlots(context, pieces, cols, rows, width, height) {
  context.clearRect(0, 0, width, height);
  if (!pieces.length) return;

  const cellSize = Math.min(width / cols, height / rows);
  const strokeWidth = Math.max(0.7, Math.min(1.65, cellSize * 0.035));
  context.save();
  context.lineJoin = 'round';
  context.lineCap = 'round';

  // Primeiro, preenche todos os nichos no formato das peças (sem quadrados).
  for (const piece of pieces) {
    const target = targetFor(piece, cols, rows, width, height);
    context.save();
    context.translate(target.x, target.y);
    context.fillStyle = (piece.col + piece.row) % 2
      ? 'rgba(9, 17, 31, 0.18)' : 'rgba(9, 17, 31, 0.28)';
    context.fill(piece.path);
    context.restore();
  }

  // A cavidade usa o contorno original da peça, sem aproximação retangular.
  for (const piece of pieces) {
    const target = targetFor(piece, cols, rows, width, height);
    context.save();
    context.translate(target.x, target.y);
    context.lineWidth = strokeWidth * 2.4;
    context.strokeStyle = 'rgba(7, 13, 24, 0.65)';
    context.stroke(piece.path);
    context.lineWidth = strokeWidth;
    context.strokeStyle = 'rgba(202, 220, 239, 0.58)';
    context.stroke(piece.path);
    context.restore();
  }
  context.restore();
}
