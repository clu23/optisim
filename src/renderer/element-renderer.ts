import type { OpticalElement, LightSource, Vec2 } from '../core/types.ts'
import { MATERIALS } from '../core/dispersion.ts'
import { FlatMirror } from '../core/elements/flat-mirror.ts'
import { ThinLens } from '../core/elements/thin-lens.ts'
import { Block } from '../core/elements/block.ts'
import { Prism } from '../core/elements/prism.ts'
import { CurvedMirror } from '../core/elements/curved-mirror.ts'
import { BeamSource } from '../core/sources/beam.ts'
import { PointSource } from '../core/sources/point-source.ts'
import { rotate } from '../core/vector.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Palettes
// ─────────────────────────────────────────────────────────────────────────────

const GLASS_FILL   = 'rgba(100, 200, 255, 0.15)'
const GLASS_STROKE = 'rgba(120, 200, 255, 0.75)'
const MIRROR_COLOR = '#8bb8f8'
const LENS_COLOR   = '#60c8ff'
const SOURCE_FILL  = 'rgba(255, 255, 160, 0.18)'
const SOURCE_STROKE = 'rgba(255, 240, 80, 0.8)'

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function drawElement(
  ctx: CanvasRenderingContext2D,
  element: OpticalElement,
  selected: boolean,
): void {
  ctx.save()
  if (selected) drawSelectionHalo(ctx, element)
  if (element instanceof FlatMirror)    drawFlatMirror(ctx, element)
  else if (element instanceof ThinLens) drawThinLens(ctx, element, selected)
  else if (element instanceof Block)    drawBlock(ctx, element)
  else if (element instanceof Prism)    drawPrism(ctx, element)
  else if (element instanceof CurvedMirror) drawCurvedMirror(ctx, element, selected)
  ctx.restore()
}

export function drawSource(
  ctx: CanvasRenderingContext2D,
  source: LightSource,
  selected: boolean,
): void {
  ctx.save()
  if (selected) {
    ctx.shadowColor = 'rgba(255, 255, 0, 0.9)'
    ctx.shadowBlur = 20
  }
  if (source instanceof BeamSource)   drawBeamSource(ctx, source)
  else if (source instanceof PointSource) drawPointSource(ctx, source)
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection halo
// ─────────────────────────────────────────────────────────────────────────────

function drawSelectionHalo(ctx: CanvasRenderingContext2D, element: OpticalElement): void {
  const bb = element.getBoundingBox()
  const cx = (bb.min.x + bb.max.x) / 2
  const cy = (bb.min.y + bb.max.y) / 2
  const r  = Math.max((bb.max.x - bb.min.x), (bb.max.y - bb.min.y)) / 2 + 14

  ctx.save()
  ctx.strokeStyle = 'rgba(255, 230, 50, 0.7)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 5])
  ctx.shadowColor = 'rgba(255, 230, 50, 0.5)'
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Element-specific drawers
// ─────────────────────────────────────────────────────────────────────────────

function drawFlatMirror(ctx: CanvasRenderingContext2D, mirror: FlatMirror): void {
  const half  = mirror.length / 2
  const along = rotate({ x: 1, y: 0 }, mirror.angle)
  const a: Vec2 = { x: mirror.position.x - half * along.x, y: mirror.position.y - half * along.y }
  const b: Vec2 = { x: mirror.position.x + half * along.x, y: mirror.position.y + half * along.y }
  // Normal direction (perpendicular to mirror, for hatch)
  const normal = rotate({ x: 0, y: 1 }, mirror.angle)

  // Reflective surface
  ctx.strokeStyle = MIRROR_COLOR
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.shadowColor = MIRROR_COLOR
  ctx.shadowBlur = 6
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()

  // Back hatching indicating reflective side
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(140, 190, 250, 0.35)'
  ctx.lineWidth = 1
  const hatchCount = Math.max(3, Math.floor(mirror.length / 10))
  for (let i = 0; i <= hatchCount; i++) {
    const t = (i / hatchCount - 0.5) * mirror.length
    const p: Vec2 = { x: mirror.position.x + along.x * t, y: mirror.position.y + along.y * t }
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + normal.x * 9, p.y + normal.y * 9)
    ctx.stroke()
  }
}

function drawThinLens(ctx: CanvasRenderingContext2D, lens: ThinLens, selected: boolean): void {
  const [a, b] = lens.endpoints()
  const axisDir  = lens.axisDirection()
  const converging = lens.focalLength > 0
  const ARROW = 14

  // Axe optique en pointillés (toujours visible)
  drawOpticalAxis(ctx, lens.position, axisDir, 320)

  // Lens line
  ctx.strokeStyle = LENS_COLOR
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.shadowColor = LENS_COLOR
  ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()

  ctx.shadowBlur = 0

  // Axis arrows
  const mid: Vec2 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const tip1: Vec2 = { x: mid.x + axisDir.x * ARROW, y: mid.y + axisDir.y * ARROW }
  const tip2: Vec2 = { x: mid.x - axisDir.x * ARROW, y: mid.y - axisDir.y * ARROW }

  if (converging) {
    drawArrow(ctx, mid, tip1, LENS_COLOR)
    drawArrow(ctx, mid, tip2, LENS_COLOR)
  } else {
    drawArrow(ctx, tip1, mid, LENS_COLOR)
    drawArrow(ctx, tip2, mid, LENS_COLOR)
  }

  // Label (f value)
  ctx.fillStyle = 'rgba(96, 200, 255, 0.6)'
  ctx.font = '11px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`f=${lens.focalLength}px`, mid.x, mid.y - 18)
  ctx.textAlign = 'left'

  // Foyers F et F' — affichés à la sélection
  if (selected) {
    // F' (foyer image) = position + f·axisDir
    const Fp = lens.focalPoint()
    // F  (foyer objet) = position − f·axisDir
    const F: Vec2 = {
      x: lens.position.x - lens.focalLength * axisDir.x,
      y: lens.position.y - lens.focalLength * axisDir.y,
    }
    drawFocalCross(ctx, F,  'F',  LENS_COLOR)
    drawFocalCross(ctx, Fp, "F'", LENS_COLOR)
  }
}

function drawBlock(ctx: CanvasRenderingContext2D, block: Block): void {
  const verts = block.vertices()

  ctx.fillStyle = GLASS_FILL
  ctx.strokeStyle = GLASS_STROKE
  ctx.lineWidth = 1.5
  ctx.shadowColor = GLASS_STROKE
  ctx.shadowBlur = 5
  ctx.beginPath()
  ctx.moveTo(verts[0].x, verts[0].y)
  for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // n label
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(120, 200, 255, 0.55)'
  ctx.font = '11px monospace'
  ctx.textAlign = 'center'
  const blockLabel = block.material ? MATERIALS[block.material].label : `n=${block.n}`
  ctx.fillText(blockLabel, block.position.x, block.position.y + 4)
  ctx.textAlign = 'left'
}

function drawPrism(ctx: CanvasRenderingContext2D, prism: Prism): void {
  const [v0, v1, v2] = prism.vertices()

  ctx.fillStyle = GLASS_FILL
  ctx.strokeStyle = GLASS_STROKE
  ctx.lineWidth = 1.5
  ctx.shadowColor = GLASS_STROKE
  ctx.shadowBlur = 5
  ctx.beginPath()
  ctx.moveTo(v0.x, v0.y)
  ctx.lineTo(v1.x, v1.y)
  ctx.lineTo(v2.x, v2.y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // n label at centroid
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(120, 200, 255, 0.55)'
  ctx.font = '11px monospace'
  ctx.textAlign = 'center'
  const prismLabel = prism.material ? MATERIALS[prism.material].label : `n=${prism.n}`
  ctx.fillText(prismLabel, prism.position.x, prism.position.y + 4)
  ctx.textAlign = 'left'
}

function drawCurvedMirror(ctx: CanvasRenderingContext2D, mirror: CurvedMirror, selected: boolean): void {
  const C = mirror.curvatureCenter()
  const arcCenter = mirror.concave ? mirror.angle + Math.PI : mirror.angle
  const t0 = arcCenter - mirror.aperture
  const t1 = arcCenter + mirror.aperture

  // Axe optique en pointillés (toujours visible)
  drawOpticalAxis(ctx, mirror.position, mirror.axisDirection(), 320)

  ctx.strokeStyle = MIRROR_COLOR
  ctx.lineWidth = 3.5
  ctx.lineCap = 'round'
  ctx.shadowColor = MIRROR_COLOR
  ctx.shadowBlur = 7
  ctx.beginPath()
  ctx.arc(C.x, C.y, mirror.radius, t0, t1)
  ctx.stroke()

  // Foyer F et centre C — affichés à la sélection
  if (selected) {
    const F = mirror.focalPoint()
    drawFocalCross(ctx, F, 'F', MIRROR_COLOR)
    drawFocalCross(ctx, C, 'C', 'rgba(190, 190, 255, 0.85)')
  }
}

function drawBeamSource(ctx: CanvasRenderingContext2D, source: BeamSource): void {
  const dir: Vec2  = { x: Math.cos(source.angle), y: Math.sin(source.angle) }
  const perp: Vec2 = { x: -dir.y, y: dir.x }
  // Dimensions of the source body rectangle (in local space: x = along beam, y = perp)
  const bw = 18                               // depth of box along beam
  const bh = Math.max(source.width + 16, 28) // height of box perpendicular

  ctx.save()
  ctx.translate(source.position.x, source.position.y)
  ctx.rotate(source.angle)

  // Body
  ctx.fillStyle = SOURCE_FILL
  ctx.strokeStyle = SOURCE_STROKE
  ctx.lineWidth = 1.5
  ctx.shadowColor = 'rgba(255, 240, 50, 0.5)'
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.rect(-bw, -bh / 2, bw, bh)
  ctx.fill()
  ctx.stroke()

  // Aperture line (front face)
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(255, 255, 120, 0.9)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(0, -bh / 2)
  ctx.lineTo(0, bh / 2)
  ctx.stroke()

  // Emission arrow
  ctx.fillStyle = SOURCE_STROKE
  ctx.beginPath()
  ctx.moveTo(7, 0)
  ctx.lineTo(1, -5)
  ctx.lineTo(1, 5)
  ctx.closePath()
  ctx.fill()

  ctx.restore()

  void perp
}

function drawPointSource(ctx: CanvasRenderingContext2D, source: PointSource): void {
  const { x, y } = source.position
  const R = 10
  const SPOKES = Math.min(source.numRays, 12)

  ctx.save()

  // Glow core
  ctx.shadowColor = 'rgba(255, 240, 80, 0.8)'
  ctx.shadowBlur = 16
  ctx.fillStyle = 'rgba(255, 255, 180, 0.9)'
  ctx.beginPath()
  ctx.arc(x, y, R / 2, 0, Math.PI * 2)
  ctx.fill()

  // Spoke lines
  ctx.shadowBlur = 4
  ctx.strokeStyle = 'rgba(255, 240, 80, 0.55)'
  ctx.lineWidth = 1.2
  for (let i = 0; i < SPOKES; i++) {
    const t = source.angle + (i / SPOKES - 0.5) * source.spreadAngle
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(t) * (R + 8), y + Math.sin(t) * (R + 8))
    ctx.stroke()
  }

  // Outer ring
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(255, 240, 80, 0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(x, y, R, 0, Math.PI * 2)
  ctx.stroke()

  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Axe optique en pointillés centré sur `center`, s'étendant de ±halfLen dans la direction `dir`. */
function drawOpticalAxis(ctx: CanvasRenderingContext2D, center: Vec2, dir: Vec2, halfLen: number): void {
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
  ctx.lineWidth = 1
  ctx.setLineDash([6, 5])
  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.moveTo(center.x - dir.x * halfLen, center.y - dir.y * halfLen)
  ctx.lineTo(center.x + dir.x * halfLen, center.y + dir.y * halfLen)
  ctx.stroke()
  ctx.restore()
}

/** Croix + label au point focal ou au centre de courbure. */
function drawFocalCross(ctx: CanvasRenderingContext2D, pos: Vec2, label: string, color: string): void {
  const S = 6
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.shadowColor = color
  ctx.shadowBlur = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(pos.x - S, pos.y); ctx.lineTo(pos.x + S, pos.y)
  ctx.moveTo(pos.x, pos.y - S); ctx.lineTo(pos.x, pos.y + S)
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.fillStyle = color
  ctx.font = 'italic 11px serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, pos.x, pos.y - S - 4)
  ctx.textAlign = 'left'
  ctx.restore()
}

function drawArrow(ctx: CanvasRenderingContext2D, from: Vec2, to: Vec2, color: string): void {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return
  const ux = dx / len
  const uy = dy / len
  const HEAD = 7

  ctx.strokeStyle = color
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - HEAD * ux + HEAD * 0.45 * uy, to.y - HEAD * uy - HEAD * 0.45 * ux)
  ctx.lineTo(to.x - HEAD * ux - HEAD * 0.45 * uy, to.y - HEAD * uy + HEAD * 0.45 * ux)
  ctx.closePath()
  ctx.fill()
}
