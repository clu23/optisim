import type { Vec2, Ray } from './types.ts'
import { sub, dot, normalize, length } from './vector.ts'

// Résultat d'intersection brut (sans surfaceId — fourni par OpticalSurface)
export interface RawHit {
  point: Vec2;
  normal: Vec2; // Orientée vers le rayon incident : dot(ray.direction, normal) < 0
  t: number;    // Paramètre le long du rayon, t > T_MIN
}

// Seuil minimal pour t : évite les auto-intersections à l'origine du rayon
const T_MIN = 1e-9

// Contrainte d'arc pour les surfaces sphériques partielles
export interface ArcConstraint {
  center: number;    // Angle central de l'arc (radians)
  halfAngle: number; // Demi-ouverture de l'arc (radians)
}

// Vérifie si un angle est dans un arc, avec gestion du recouvrement ±π
function withinArc(angle: number, arc: ArcConstraint): boolean {
  let diff = angle - arc.center
  // Normalise diff dans [-π, π]
  diff = diff - 2 * Math.PI * Math.round(diff / (2 * Math.PI))
  return Math.abs(diff) <= arc.halfAngle
}

// ─────────────────────────────────────────────────────────────────────────────
// Intersection rayon / segment
//
// Rayon  : P = O + t·D, t > 0
// Segment: Q = A + u·(B−A), u ∈ [0, 1]
//
// Résolution par règle de Cramer :
//   cross(D, S) · t = cross(A−O, S)
//   cross(D, S) · u = cross(A−O, D)
// où S = B−A et cross(A, B) = A.x·B.y − A.y·B.x
// ─────────────────────────────────────────────────────────────────────────────
export function intersectRaySegment(
  ray: Ray,
  a: Vec2,
  b: Vec2,
): RawHit | null {
  const d = ray.direction
  const s = sub(b, a)

  // cross(D, S) = D.x·S.y − D.y·S.x
  const denom = d.x * s.y - d.y * s.x

  // Rayon parallèle au segment (ou segment dégénéré)
  if (Math.abs(denom) < 1e-12) return null

  const ao = sub(a, ray.origin)

  // cross(AO, S)
  const t = (ao.x * s.y - ao.y * s.x) / denom
  // cross(AO, D)
  const u = (ao.x * d.y - ao.y * d.x) / denom

  if (t <= T_MIN || u < 0 || u > 1) return null

  const point: Vec2 = {
    x: ray.origin.x + t * d.x,
    y: ray.origin.y + t * d.y,
  }

  // Normale perpendiculaire à S, orientée vers le rayon incident
  // Les deux candidats sont (-S.y, S.x) et (S.y, -S.x)
  let normal: Vec2 = normalize({ x: -s.y, y: s.x })
  if (dot(d, normal) > 0) {
    normal = { x: -normal.x, y: -normal.y }
  }

  return { point, normal, t }
}

// ─────────────────────────────────────────────────────────────────────────────
// Intersection rayon / cercle (avec support d'arc partiel)
//
// Rayon : P = O + t·D
// Cercle: |P − C|² = R²
//
// Équation quadratique : a·t² + b·t + c = 0
//   a = D·D (= 1 si D normalisé)
//   b = 2·(O−C)·D
//   c = |O−C|² − R²
//
// On retient le plus petit t > T_MIN, si le point est dans l'arc (optionnel).
// Si t1 < T_MIN mais t2 > T_MIN, on prend t2 (rayon parti de l'intérieur).
// ─────────────────────────────────────────────────────────────────────────────
export function intersectRayCircle(
  ray: Ray,
  center: Vec2,
  radius: number,
  arc?: ArcConstraint,
): RawHit | null {
  const d = ray.direction
  const oc = sub(ray.origin, center)

  const a = dot(d, d)
  const b = 2 * dot(oc, d)
  const c = dot(oc, oc) - radius * radius

  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return null

  const sqrtDisc = Math.sqrt(discriminant)
  const t1 = (-b - sqrtDisc) / (2 * a)
  const t2 = (-b + sqrtDisc) / (2 * a)

  // Candidats positifs par ordre croissant
  const candidates = [t1, t2].filter(t => t > T_MIN).sort((x, y) => x - y)

  for (const t of candidates) {
    const point: Vec2 = {
      x: ray.origin.x + t * d.x,
      y: ray.origin.y + t * d.y,
    }

    // Vérification de l'arc si fourni
    if (arc !== undefined) {
      const angle = Math.atan2(point.y - center.y, point.x - center.x)
      if (!withinArc(angle, arc)) continue
    }

    // Normale radiale sortante du cercle, orientée vers le rayon incident
    let normal = normalize(sub(point, center))
    if (dot(d, normal) > 0) {
      normal = { x: -normal.x, y: -normal.y }
    }

    return { point, normal, t }
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitaire : longueur du vecteur (réexportée pour commodité des tests)
// ─────────────────────────────────────────────────────────────────────────────
export { length }
