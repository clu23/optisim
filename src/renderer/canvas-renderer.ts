import type { Scene, TraceResult } from '../core/types.ts'
import { drawElement, drawSource } from './element-renderer.ts'

// ─────────────────────────────────────────────────────────────────────────────
// wavelengthToColor — CIE approximation pour le spectre visible
//
// Entrée : longueur d'onde λ en nm (380–780)
// Sortie : chaîne CSS `rgba(r, g, b, alpha)`
// ─────────────────────────────────────────────────────────────────────────────

export function wavelengthToColor(wavelength: number, alpha = 1): string {
  let r = 0, g = 0, b = 0

  if      (wavelength >= 380 && wavelength < 440) { r = -(wavelength - 440) / 60; b = 1 }
  else if (wavelength >= 440 && wavelength < 490) { g = (wavelength - 440) / 50;  b = 1 }
  else if (wavelength >= 490 && wavelength < 510) { g = 1; b = -(wavelength - 510) / 20 }
  else if (wavelength >= 510 && wavelength < 580) { r = (wavelength - 510) / 70; g = 1 }
  else if (wavelength >= 580 && wavelength < 645) { r = 1; g = -(wavelength - 645) / 65 }
  else if (wavelength >= 645 && wavelength <= 780) { r = 1 }

  // Atténuation aux extrémités (UV et IR proche)
  let factor = 1
  if      (wavelength < 420)  factor = 0.3 + 0.7 * (wavelength - 380) / 40
  else if (wavelength > 700)  factor = 0.3 + 0.7 * (780 - wavelength) / 80

  const ri = Math.round(255 * r * factor)
  const gi = Math.round(255 * g * factor)
  const bi = Math.round(255 * b * factor)
  return `rgba(${ri}, ${gi}, ${bi}, ${alpha})`
}

// ─────────────────────────────────────────────────────────────────────────────
// drawGrid — grille de fond (mineure + majeure)
// ─────────────────────────────────────────────────────────────────────────────

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const MINOR = 25
  const MAJOR = 100

  ctx.save()

  // Lignes mineures
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
  ctx.lineWidth = 0.5
  for (let x = 0; x <= width; x += MINOR) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke()
  }
  for (let y = 0; y <= height; y += MINOR) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
  }

  // Lignes majeures
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)'
  ctx.lineWidth = 1
  for (let x = 0; x <= width; x += MAJOR) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke()
  }
  for (let y = 0; y <= height; y += MAJOR) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
  }

  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// drawRays — segments de rayons colorés par longueur d'onde, avec halo
// ─────────────────────────────────────────────────────────────────────────────

function drawRays(ctx: CanvasRenderingContext2D, results: TraceResult[]): void {
  for (const result of results) {
    for (const seg of result.segments) {
      const color = wavelengthToColor(seg.wavelength, seg.intensity * 0.9)

      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.shadowColor = color
      ctx.shadowBlur = 5
      ctx.globalAlpha = Math.max(0.1, seg.intensity)

      if (seg.curvePoints && seg.curvePoints.length > 1) {
        // Tracé courbe (phase 4 GRIN)
        ctx.beginPath()
        ctx.moveTo(seg.curvePoints[0].x, seg.curvePoints[0].y)
        for (let i = 1; i < seg.curvePoints.length; i++) {
          ctx.lineTo(seg.curvePoints[i].x, seg.curvePoints[i].y)
        }
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.moveTo(seg.start.x, seg.start.y)
        ctx.lineTo(seg.end.x, seg.end.y)
        ctx.stroke()
      }

      ctx.restore()
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// drawHUD — overlay d'aide minimaliste
// ─────────────────────────────────────────────────────────────────────────────

function drawHUD(ctx: CanvasRenderingContext2D, _width: number, height: number): void {
  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.font = '11px monospace'
  ctx.fillText('Clic : sélectionner   ·   Glisser : déplacer   ·   Molette : pivoter', 12, height - 12)
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// drawScene — point d'entrée principal du renderer
// ─────────────────────────────────────────────────────────────────────────────

export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  results: TraceResult[],
  selectedId: string | null,
): void {
  const { width, height } = ctx.canvas

  // 1. Fond sombre
  ctx.fillStyle = '#080c14'
  ctx.fillRect(0, 0, width, height)

  // 2. Grille
  drawGrid(ctx, width, height)

  // 3. Rayons (sous les éléments — visibles par transparence du verre)
  drawRays(ctx, results)

  // 4. Éléments optiques
  for (const element of scene.elements) {
    drawElement(ctx, element, element.id === selectedId)
  }

  // 5. Sources
  for (const source of scene.sources) {
    drawSource(ctx, source, source.id === selectedId)
  }

  // 6. HUD
  drawHUD(ctx, width, height)
}
