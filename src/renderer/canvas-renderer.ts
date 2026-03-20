import type { Scene, TraceResult } from '../core/types.ts'
import { drawElement, drawSource, isGRINElement } from './element-renderer.ts'

// ─────────────────────────────────────────────────────────────────────────────
// ViewTransform — transformation de vue (zoom + pan)
// ─────────────────────────────────────────────────────────────────────────────

export interface ViewTransform {
  offsetX: number
  offsetY: number
  scale: number
}

export function defaultView(): ViewTransform {
  return { offsetX: 0, offsetY: 0, scale: 1 }
}

/** Convertit des coordonnées écran → monde. */
export function screenToWorld(sx: number, sy: number, v: ViewTransform): { x: number; y: number } {
  return { x: (sx - v.offsetX) / v.scale, y: (sy - v.offsetY) / v.scale }
}

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
// drawGrid — grille de fond adaptative (espace monde)
//
// Appelé sous ctx.setTransform — dessine uniquement la région visible.
// lineWidth compensé pour rester constant en pixels écran.
// ─────────────────────────────────────────────────────────────────────────────

function drawGrid(
  ctx: CanvasRenderingContext2D,
  left: number, top: number, right: number, bottom: number,
  scale: number,
): void {
  const MINOR = 25
  const MAJOR = 100
  const lw = 1 / scale   // largeur constante en pixels écran

  ctx.save()

  // Lignes mineures
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
  ctx.lineWidth = lw * 0.5
  const mx0 = Math.floor(left / MINOR) * MINOR
  const my0 = Math.floor(top  / MINOR) * MINOR
  for (let x = mx0; x <= right;  x += MINOR) {
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke()
  }
  for (let y = my0; y <= bottom; y += MINOR) {
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke()
  }

  // Lignes majeures
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)'
  ctx.lineWidth = lw
  const Mx0 = Math.floor(left / MAJOR) * MAJOR
  const My0 = Math.floor(top  / MAJOR) * MAJOR
  for (let x = Mx0; x <= right;  x += MAJOR) {
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke()
  }
  for (let y = My0; y <= bottom; y += MAJOR) {
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke()
  }

  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// drawRays — segments de rayons colorés par longueur d'onde, avec halo
// ─────────────────────────────────────────────────────────────────────────────

function drawRays(ctx: CanvasRenderingContext2D, results: TraceResult[], scale: number): void {
  const lwBase = 1.5 / scale

  for (const result of results) {
    for (const seg of result.segments) {
      const intensity = Math.max(0, Math.min(1, seg.intensity))
      const color = wavelengthToColor(seg.wavelength, intensity * 0.9)

      ctx.save()
      ctx.strokeStyle = color
      // Épaisseur proportionnelle à l'intensité (min 30% pour rester visible)
      ctx.lineWidth = lwBase * Math.max(0.3, intensity)
      ctx.shadowColor = color
      ctx.shadowBlur = (4 * intensity + 1) / scale
      ctx.globalAlpha = Math.max(0.05, intensity)

      if (seg.curvePoints && seg.curvePoints.length > 1) {
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
// drawHUD — overlay écran (hors transformation monde)
// ─────────────────────────────────────────────────────────────────────────────

export function drawHUD(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
): void {
  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.font = '11px monospace'
  ctx.fillText(
    'Clic : sélectionner  ·  Glisser : déplacer  ·  Molette sélection : pivoter  ·  Molette fond : zoom  ·  Drag fond / clic milieu : pan',
    12, height - 12,
  )
  // Niveau de zoom — coin supérieur droit
  const zoomPct = `${Math.round(scale * 100)}%`
  ctx.font = '12px monospace'
  ctx.textAlign = 'right'
  ctx.fillText(zoomPct, width - 10, 20)
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// drawScene — contenu monde (appelé sous ctx.setTransform)
//
// Ne fait PAS le clear de fond ni le HUD — la boucle RAF s'en charge.
// ─────────────────────────────────────────────────────────────────────────────

export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  results: TraceResult[],
  selectedId: string | null,
  worldBounds: { left: number; top: number; right: number; bottom: number },
  scale: number,
): void {
  // 1. Grille
  drawGrid(ctx, worldBounds.left, worldBounds.top, worldBounds.right, worldBounds.bottom, scale)

  // 2. Milieux GRIN en fond (avant les rayons pour que les trajectoires soient visibles par-dessus)
  for (const element of scene.elements) {
    if (isGRINElement(element)) drawElement(ctx, element, element.id === selectedId)
  }

  // 3. Rayons (sur les GRIN, sous les éléments optiques)
  drawRays(ctx, results, scale)

  // 4. Éléments optiques (hors GRIN)
  for (const element of scene.elements) {
    if (!isGRINElement(element)) drawElement(ctx, element, element.id === selectedId)
  }

  // 5. Sources
  for (const source of scene.sources) {
    drawSource(ctx, source, source.id === selectedId)
  }
}
