import type { OpticalElement, LightSource, Vec2 } from '../core/types.ts'
import { FlatMirror } from '../core/elements/flat-mirror.ts'
import { ThinLens } from '../core/elements/thin-lens.ts'
import { Block } from '../core/elements/block.ts'
import { Prism } from '../core/elements/prism.ts'
import { CurvedMirror } from '../core/elements/curved-mirror.ts'
import { BeamSource } from '../core/sources/beam.ts'
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
  else if (element instanceof ThinLens) drawThinLens(ctx, element)
  else if (element instanceof Block)    drawBlock(ctx, element)
  else if (element instanceof Prism)    drawPrism(ctx, element)
  else if (element instanceof CurvedMirror) drawCurvedMirror(ctx, element)
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
  if (source instanceof BeamSource) drawBeamSource(ctx, source)
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

function drawThinLens(ctx: CanvasRenderingContext2D, lens: ThinLens): void {
  const [a, b] = lens.endpoints()
  const axisDir  = lens.axisDirection()
  const converging = lens.focalLength > 0
  const ARROW = 14

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
  ctx.fillText(`n=${block.n}`, block.position.x, block.position.y + 4)
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
  ctx.fillText(`n=${prism.n}`, prism.position.x, prism.position.y + 4)
  ctx.textAlign = 'left'
}

function drawCurvedMirror(ctx: CanvasRenderingContext2D, mirror: CurvedMirror): void {
  const axisDir = rotate({ x: 1, y: 0 }, mirror.angle)
  const sign    = mirror.concave ? 1 : -1
  const C: Vec2 = {
    x: mirror.position.x + sign * axisDir.x * mirror.radius,
    y: mirror.position.y + sign * axisDir.y * mirror.radius,
  }
  const arcCenter = mirror.concave ? mirror.angle + Math.PI : mirror.angle
  const t0 = arcCenter - mirror.aperture
  const t1 = arcCenter + mirror.aperture

  ctx.strokeStyle = MIRROR_COLOR
  ctx.lineWidth = 3.5
  ctx.lineCap = 'round'
  ctx.shadowColor = MIRROR_COLOR
  ctx.shadowBlur = 7
  ctx.beginPath()
  ctx.arc(C.x, C.y, mirror.radius, t0, t1)
  ctx.stroke()
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

  // Beam direction label
  void perp // suppress unused warning
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
