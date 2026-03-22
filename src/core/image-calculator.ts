import type { Ray, Scene } from './types.ts'
import { traceRay } from './tracer.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Image Calculator — Phase 7C
//
// Calcule la position et le grandissement de l'image d'un point objet,
// en utilisant la méthode des deux rayons :
//   1. Rayon paraxial bas (h = ε, parallèle à l'axe) → dévié vers le foyer image.
//   2. Rayon paraxial haut (h = −ε, sens opposé) → idem.
//
// L'intersection de leurs prolongements donne le point image.
//
// Convention : propagation gauche → droite (+x), axe optique y = objectY.
// ─────────────────────────────────────────────────────────────────────────────

export interface ImageResult {
  /** x du point image (px). null si rayons parallèles (foyer à l'infini). */
  imageX:        number | null
  /** y du point image (px). */
  imageY:        number | null
  /** Grandissement transversal m = imageHeight / objectHeight. */
  magnification: number | null
  /** Vrai si l'image est réelle (rayons convergent après le système). */
  isReal:        boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne le dernier segment d'un TraceResult qui progresse vers +x
 * (segment de sortie du système).
 */
function lastForwardSegment(
  result: ReturnType<typeof traceRay>,
): { ox: number; oy: number; dx: number; dy: number } | null {
  for (let i = result.segments.length - 1; i >= 0; i--) {
    const seg = result.segments[i]
    const sdx = seg.end.x - seg.start.x
    const sdy = seg.end.y - seg.start.y
    if (sdx > 1e-10) {
      const len = Math.hypot(sdx, sdy)
      return { ox: seg.start.x, oy: seg.start.y, dx: sdx / len, dy: sdy / len }
    }
  }
  return null
}

/**
 * Intersection de deux droites paramétriques :
 *   P1 + t1·D1  et  P2 + t2·D2
 * Retourne (x, y) ou null si parallèles / quasi-parallèles.
 * `t1` est positif si l'intersection est en avant de P1.
 */
function lineIntersect(
  ox1: number, oy1: number, dx1: number, dy1: number,
  ox2: number, oy2: number, dx2: number, dy2: number,
): { x: number; y: number; t1: number } | null {
  // D1 × D2 (z-component du produit vectoriel 2D)
  const cross = dx1 * dy2 - dy1 * dx2
  if (Math.abs(cross) < 1e-12) return null   // parallèles

  const t1 = ((ox2 - ox1) * dy2 - (oy2 - oy1) * dx2) / cross
  return {
    x:  ox1 + t1 * dx1,
    y:  oy1 + t1 * dy1,
    t1,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// computeImage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule l'image d'un point objet à travers le système optique de `scene`.
 *
 * Méthode : deux rayons partant du même point objet avec des directions
 * légèrement différentes.  L'intersection de leurs segments de sortie
 * donne le point image.
 *
 * @param scene        Scène optique (sans plan image nécessaire).
 * @param objectX      Position axiale de l'objet (px).
 * @param objectY      Hauteur de l'objet par rapport à l'axe (px).
 *                     L'axe optique est y = 0 (convention de la scène).
 * @param wavelength   Longueur d'onde (nm). Défaut : 550 nm.
 * @param angleStep    Demi-angle entre les deux rayons (rad). Défaut : 0.005 rad.
 */
export function computeImage(
  scene:       Scene,
  objectX:     number,
  objectY:     number,
  wavelength = 550,
  angleStep  = 0.005,
  /** y de l'axe optique (défaut 0). Nécessaire pour les scènes dont l'axe n'est pas à y=0. */
  axisY      = 0,
): ImageResult {
  // ── Rayon 1 : depuis le point objet, légèrement au-dessus de l'axe ──────────
  const ray1: Ray = {
    origin:    { x: objectX, y: objectY },
    direction: { x: Math.cos(angleStep), y: Math.sin(angleStep) },
    wavelength,
    intensity: 1,
  }
  const seg1 = lastForwardSegment(traceRay(ray1, scene))

  // ── Rayon 2 : depuis le point objet, légèrement en-dessous de l'axe ─────────
  const ray2: Ray = {
    origin:    { x: objectX, y: objectY },
    direction: { x: Math.cos(-angleStep), y: Math.sin(-angleStep) },
    wavelength,
    intensity: 1,
  }
  const seg2 = lastForwardSegment(traceRay(ray2, scene))

  if (!seg1 || !seg2) return { imageX: null, imageY: null, magnification: null, isReal: false }

  const inter = lineIntersect(
    seg1.ox, seg1.oy, seg1.dx, seg1.dy,
    seg2.ox, seg2.oy, seg2.dx, seg2.dy,
  )
  if (!inter) return { imageX: null, imageY: null, magnification: null, isReal: false }

  const isReal = inter.t1 > 0   // intersection en avant du dernier segment

  // ── Grandissement : m = (imageY − axisY) / (objectY − axisY) ────────────
  // Pour objectY=axisY (axe), calculer l'image d'un point décalé de 10 px
  // au-dessus de l'axe et utiliser m = (imageY_décalé − axisY) / 10.
  let magnification: number | null = null
  if (objectY !== axisY) {
    magnification = (inter.y - axisY) / (objectY - axisY)
  } else {
    const refH = axisY + 10
    const ray3: Ray = {
      origin:    { x: objectX, y: refH },
      direction: { x: Math.cos(angleStep), y: Math.sin(angleStep) },
      wavelength,
      intensity: 1,
    }
    const seg3 = lastForwardSegment(traceRay(ray3, scene))
    const ray4: Ray = {
      origin:    { x: objectX, y: refH },
      direction: { x: Math.cos(-angleStep), y: Math.sin(-angleStep) },
      wavelength,
      intensity: 1,
    }
    const seg4 = lastForwardSegment(traceRay(ray4, scene))
    if (seg3 && seg4) {
      const inter2 = lineIntersect(seg3.ox, seg3.oy, seg3.dx, seg3.dy, seg4.ox, seg4.oy, seg4.dx, seg4.dy)
      if (inter2) magnification = (inter2.y - axisY) / (refH - axisY)
    }
  }

  return {
    imageX:        inter.x,
    imageY:        inter.y,
    magnification,
    isReal,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// computeEffectiveFocalLength — longueur focale effective du système (px)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estime la longueur focale effective (EFL) du système optique en traçant
 * un rayon paraxial parallèle à l'axe depuis la gauche.
 *
 * EFL = -y / tan(θ_out)  où y = hauteur d'entrée, θ_out = angle de sortie.
 *
 * @returns EFL en px, ou null si le rayon ne traverse pas le système.
 */
export function computeEFL(
  scene:       Scene,
  wavelength = 550,
  inputX     = -1000,
  inputY     = 10,
): number | null {
  const ray: Ray = {
    origin:    { x: inputX, y: inputY },
    direction: { x: 1, y: 0 },
    wavelength,
    intensity: 1,
  }
  const seg = lastForwardSegment(traceRay(ray, scene))
  if (!seg) return null
  if (Math.abs(seg.dy) < 1e-12) return null   // rayon reste parallèle → foyer à l'infini

  // EFL = −y_in / tan(θ_out) = −y_in × (dx_out / dy_out)
  // Pour un rayon entrant horizontal, dx ≈ 1
  return -inputY * (seg.dx / seg.dy)
}
