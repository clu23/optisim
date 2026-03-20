import type { Scene, TraceResult, Vec2, WorldUnits } from '../core/types.ts'
import { DEFAULT_WORLD_UNITS } from '../core/types.ts'
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
      // Couleur pure (alpha=1) : l'opacité est contrôlée uniquement par globalAlpha.
      // On évite de multiplier l'intensité deux fois (une fois dans rgba, une dans globalAlpha).
      const color = wavelengthToColor(seg.wavelength, 1)

      ctx.save()
      ctx.strokeStyle = color
      // Épaisseur proportionnelle à l'intensité (min 30% pour rester visible)
      ctx.lineWidth = lwBase * Math.max(0.3, intensity)
      ctx.shadowColor = color
      ctx.shadowBlur = (4 * intensity + 1) / scale
      ctx.globalAlpha = Math.max(0.05, intensity * 0.9)

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
// Helpers géométriques pour le hover OPL et le mode mesure
// ─────────────────────────────────────────────────────────────────────────────

/** Distance d'un point p au segment [a, b]. */
function pointToSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Trouve le TraceResult dont un segment est le plus proche du point monde.
 * Retourne null si aucun segment n'est dans le seuil (threshold px monde).
 */
export function findNearestResult(
  mouseWorld: Vec2,
  results: TraceResult[],
  threshold: number,
): TraceResult | null {
  let minDist = threshold
  let nearest: TraceResult | null = null

  for (const result of results) {
    for (const seg of result.segments) {
      const a = seg.curvePoints ? seg.curvePoints[0]                            : seg.start
      const b = seg.curvePoints ? seg.curvePoints[seg.curvePoints.length - 1]   : seg.end
      const d = pointToSegmentDist(mouseWorld, a, b)
      if (d < minDist) { minDist = d; nearest = result }
    }
  }
  return nearest
}

// ─────────────────────────────────────────────────────────────────────────────
// drawOPLOverlay — tooltip OPL au survol d'un rayon
// Appelé en coordonnées écran (après ctx.restore du world-transform).
// ─────────────────────────────────────────────────────────────────────────────

export function drawOPLOverlay(
  ctx: CanvasRenderingContext2D,
  mouseScreen: Vec2 | null,
  mouseWorld: Vec2 | null,
  results: TraceResult[],
  scale: number,
): void {
  if (!mouseWorld || !mouseScreen || results.length === 0) return

  const threshold = 10 / scale   // 10 px écran → monde
  const nearest = findNearestResult(mouseWorld, results, threshold)
  if (!nearest) return

  const opl = nearest.totalOpticalPath
  // On ne montre pas l'OPL pour les rayons infinis (non terminés)
  if (!isFinite(opl) || opl <= 0) return

  const text = `OPL = ${opl.toFixed(1)} px`
  const PADX = 8
  const W = ctx.measureText(text).width + PADX * 2
  const H = 18

  let tx = mouseScreen.x + 14
  let ty = mouseScreen.y - 22
  // Reste dans l'écran
  const cw = ctx.canvas.width
  if (tx + W > cw - 6) tx = mouseScreen.x - W - 10
  if (ty < 4) ty = mouseScreen.y + 10

  ctx.save()
  ctx.fillStyle = 'rgba(20, 30, 50, 0.88)'
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(tx, ty, W, H, 4)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = 'rgba(180, 230, 255, 0.95)'
  ctx.font = '11px monospace'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, tx + PADX, ty + H / 2)
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// drawMeasureOverlay — mode mesure : points + distance + angle
// Appelé en coordonnées écran.
// ─────────────────────────────────────────────────────────────────────────────

export function drawMeasureOverlay(
  ctx: CanvasRenderingContext2D,
  points: Vec2[],                    // points MONDE (0, 1 ou 2)
  view: ViewTransform,
  measureMode: boolean,
): void {
  if (!measureMode && points.length === 0) return

  // Conversion monde → écran
  function toScreen(p: Vec2): Vec2 {
    return { x: p.x * view.scale + view.offsetX, y: p.y * view.scale + view.offsetY }
  }

  const CROSS_S = 7

  ctx.save()

  if (measureMode && points.length === 0) {
    // Indicateur mode actif
    ctx.fillStyle = 'rgba(255, 200, 50, 0.85)'
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('📏 Mode mesure — cliquez deux points', 12, ctx.canvas.height - 30)
  }

  // Dessiner les points de mesure
  for (const pt of points) {
    const sp = toScreen(pt)
    ctx.strokeStyle = 'rgba(255, 200, 50, 0.9)'
    ctx.lineWidth = 1.5
    ctx.shadowColor = 'rgba(255, 200, 50, 0.7)'
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.moveTo(sp.x - CROSS_S, sp.y); ctx.lineTo(sp.x + CROSS_S, sp.y)
    ctx.moveTo(sp.x, sp.y - CROSS_S); ctx.lineTo(sp.x, sp.y + CROSS_S)
    ctx.stroke()
  }
  ctx.shadowBlur = 0

  // Ligne + mesures entre deux points
  if (points.length === 2) {
    const sp0 = toScreen(points[0])
    const sp1 = toScreen(points[1])
    const dx = points[1].x - points[0].x
    const dy = points[1].y - points[0].y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI

    // Ligne de mesure
    ctx.strokeStyle = 'rgba(255, 200, 50, 0.65)'
    ctx.lineWidth = 1
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(sp0.x, sp0.y)
    ctx.lineTo(sp1.x, sp1.y)
    ctx.stroke()
    ctx.setLineDash([])

    // Texte au milieu
    const mx = (sp0.x + sp1.x) / 2
    const my = (sp0.y + sp1.y) / 2
    const label = `${dist.toFixed(1)} px  |  ${angleDeg.toFixed(1)}°`
    const W = ctx.measureText(label).width + 14
    const H = 18

    ctx.fillStyle = 'rgba(20, 30, 50, 0.88)'
    ctx.strokeStyle = 'rgba(255, 200, 50, 0.6)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(mx - W / 2, my - H - 4, W, H, 4)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = 'rgba(255, 220, 100, 0.95)'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, mx, my - 4 - H / 2)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'

    // Rappel en bas de l'écran
    ctx.fillStyle = 'rgba(255, 200, 50, 0.75)'
    ctx.font = '11px monospace'
    ctx.fillText(`📏  ${dist.toFixed(1)} px  ·  ${angleDeg.toFixed(1)}°  —  cliquez pour réinitialiser`, 12, ctx.canvas.height - 30)
  } else if (points.length === 1 && measureMode) {
    ctx.fillStyle = 'rgba(255, 200, 50, 0.75)'
    ctx.font = '11px monospace'
    ctx.fillText('📏 Mode mesure — cliquez le second point', 12, ctx.canvas.height - 30)
  }

  ctx.restore()
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
// drawRuler — règle graduée en unités physiques (phase 7A)
//
// Dessine deux règles (horizontale en haut, verticale à gauche) calibrées en mm
// (ou µm / cm selon WorldUnits.displayUnit). Les tick-marks sont en espace monde
// converti en écran, et les labels tiennent compte du scale mm/px.
// ─────────────────────────────────────────────────────────────────────────────

export function drawRuler(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: ViewTransform,
  worldUnits: WorldUnits = DEFAULT_WORLD_UNITS,
): void {
  const { offsetX, offsetY, scale } = view
  // screen pixels per mm
  const pxPerMm = scale / worldUnits.scale

  // Choisir un pas de graduation "agréable" (en mm) pour ~60-100 px entre ticks
  const targetPxBetweenTicks = 80
  const rawMmStep = targetPxBetweenTicks / pxPerMm
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMmStep)))
  const normalized = rawMmStep / magnitude
  const niceFactor = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10
  const mmStep = niceFactor * magnitude

  // Unité d'affichage et facteur de conversion depuis mm
  let unitLabel: string
  let mmToUnit: number
  switch (worldUnits.displayUnit) {
    case 'µm': unitLabel = 'µm'; mmToUnit = 1000; break
    case 'cm': unitLabel = 'cm'; mmToUnit = 0.1;  break
    default:   unitLabel = 'mm'; mmToUnit = 1;    break
  }

  const RULER_SIZE = 18  // largeur de la règle en px écran

  ctx.save()

  // ── Fond des règles ───────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(13, 20, 28, 0.85)'
  ctx.fillRect(0, 0, width, RULER_SIZE)          // horizontale
  ctx.fillRect(0, 0, RULER_SIZE, height)          // verticale
  // Coin supérieur gauche
  ctx.fillStyle = '#0d141c'
  ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE)

  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, RULER_SIZE); ctx.lineTo(width, RULER_SIZE); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(RULER_SIZE, 0); ctx.lineTo(RULER_SIZE, height); ctx.stroke()

  // ── Ticks et labels ───────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(180, 200, 220, 0.7)'
  ctx.font = '9px monospace'

  // Origine monde en pixels écran
  const ox = offsetX  // screen px at world x=0
  const oy = offsetY  // screen px at world y=0

  // Pas en px écran
  const stepPx = mmStep / worldUnits.scale * scale

  // Ruler horizontale (en haut)
  const xStart = Math.floor((-ox) / stepPx) - 1
  const xEnd   = Math.ceil((width - ox) / stepPx) + 1
  for (let i = xStart; i <= xEnd; i++) {
    const sx = ox + i * stepPx
    if (sx < RULER_SIZE || sx > width) continue
    const isMajor = (i % 5 === 0)
    ctx.strokeStyle = isMajor ? 'rgba(180,200,220,0.5)' : 'rgba(180,200,220,0.2)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(sx, RULER_SIZE)
    ctx.lineTo(sx, RULER_SIZE - (isMajor ? 8 : 4))
    ctx.stroke()
    if (isMajor) {
      const valMm = i * mmStep
      const valDisplay = valMm * mmToUnit
      ctx.fillStyle = 'rgba(160,185,210,0.8)'
      ctx.textAlign = 'center'
      ctx.fillText(valDisplay % 1 === 0 ? String(Math.round(valDisplay)) : valDisplay.toFixed(1), sx, 8)
    }
  }

  // Ruler verticale (à gauche)
  const yStart = Math.floor((-oy) / stepPx) - 1
  const yEnd   = Math.ceil((height - oy) / stepPx) + 1
  for (let i = yStart; i <= yEnd; i++) {
    const sy = oy + i * stepPx
    if (sy < RULER_SIZE || sy > height) continue
    const isMajor = (i % 5 === 0)
    ctx.strokeStyle = isMajor ? 'rgba(180,200,220,0.5)' : 'rgba(180,200,220,0.2)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(RULER_SIZE, sy)
    ctx.lineTo(RULER_SIZE - (isMajor ? 8 : 4), sy)
    ctx.stroke()
    if (isMajor) {
      const valMm = i * mmStep
      const valDisplay = valMm * mmToUnit
      ctx.save()
      ctx.translate(8, sy)
      ctx.rotate(-Math.PI / 2)
      ctx.fillStyle = 'rgba(160,185,210,0.8)'
      ctx.textAlign = 'center'
      ctx.fillText(valDisplay % 1 === 0 ? String(Math.round(valDisplay)) : valDisplay.toFixed(1), 0, 3)
      ctx.restore()
    }
  }

  // Unité dans le coin
  ctx.fillStyle = 'rgba(100,140,160,0.9)'
  ctx.font = '8px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(unitLabel, RULER_SIZE / 2, RULER_SIZE / 2 + 3)

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
