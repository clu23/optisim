import type { Ray, Scene, TraceResult, RaySegment, OpticalSurface, OpticalElement, Vec2, HitResult, GRINMedium, BoundingBox } from './types.ts'
import { ThinLensSurface } from './elements/thin-lens.ts'
import { reflect, refract } from './optics.ts'
import { integrateGRIN, buildGRINSegment } from './tracer-grin.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

/** Nombre maximum de rebonds avant l'arrêt forcé du tracé. */
export const MAX_BOUNCES = 64

/** Longueur du segment terminal quand aucune intersection n'est trouvée (px). */
export const FREE_RAY_LENGTH = 10_000

/**
 * Distance minimale pour détecter une entrée GRIN (px).
 * Évite la re-détection immédiate après la sortie du milieu.
 */
const GRIN_ENTRY_T_MIN = 1.0

// ─────────────────────────────────────────────────────────────────────────────
// GRIN helpers — duck typing, pas d'import de GRINElement
// ─────────────────────────────────────────────────────────────────────────────

/** Détecte si un OpticalElement implémente aussi GRINMedium (duck typing). */
function isGRINMedium(el: OpticalElement): el is OpticalElement & GRINMedium {
  return 'refractiveIndexAt' in el && 'gradientAt' in el
}

/**
 * Retourne le premier milieu GRIN contenant `pos`, ou null.
 * Appelé en début de chaque rebond pour détecter si le rayon est dans un GRIN.
 */
function findGRINMediumAt(pos: Vec2, scene: Scene): (OpticalElement & GRINMedium) | null {
  for (const el of scene.elements) {
    if (isGRINMedium(el) && el.containsPoint(pos)) {
      return el as OpticalElement & GRINMedium
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// GRIN entry detection — méthode des dalles (slab method)
// ─────────────────────────────────────────────────────────────────────────────

interface GRINHit {
  /** Paramètre t le long du rayon (distance à l'origine). */
  t: number
  /** Point d'entrée sur la face du GRIN. */
  point: Vec2
  /**
   * Normale à la face d'entrée, orientée VERS le rayon incident.
   * Convention identique à HitResult.normal : dot(d, normal) < 0.
   */
  normal: Vec2
  /** Milieu GRIN touché. */
  grin: OpticalElement & GRINMedium
  /** Bounding box du milieu (pour calculer la normale de sortie). */
  bb: BoundingBox
}

/**
 * Intersection rayon–AABB par méthode des dalles.
 * Retourne la distance t d'entrée et la normale de la face d'entrée,
 * ou null si le rayon ne touche pas la boîte (ou trop proche).
 *
 * Normale renvoyée : outward normal de la face d'entrée.
 * Elle satisfait dot(d, normal) < 0 (convention refract()).
 */
function rayAABBEntry(
  origin: Vec2, dir: Vec2, bb: BoundingBox,
): { t: number; normal: Vec2 } | null {
  const invDx = dir.x !== 0 ? 1 / dir.x : Infinity
  const invDy = dir.y !== 0 ? 1 / dir.y : Infinity

  const tx1 = (bb.min.x - origin.x) * invDx
  const tx2 = (bb.max.x - origin.x) * invDx
  const ty1 = (bb.min.y - origin.y) * invDy
  const ty2 = (bb.max.y - origin.y) * invDy

  const txMin = Math.min(tx1, tx2), txMax = Math.max(tx1, tx2)
  const tyMin = Math.min(ty1, ty2), tyMax = Math.max(ty1, ty2)

  const tEntry = Math.max(txMin, tyMin)
  const tExit  = Math.min(txMax, tyMax)

  if (tEntry < GRIN_ENTRY_T_MIN || tEntry > tExit) return null

  // Détermine la face d'entrée (axe dominant) et sa normale outward.
  // La normale outward satisfait dot(d, n) < 0 car elle pointe vers le rayon.
  let normal: Vec2
  if (txMin >= tyMin) {
    // Entrée par une face verticale (axe x dominant)
    normal = dir.x > 0 ? { x: -1, y: 0 } : { x: 1, y: 0 }
  } else {
    // Entrée par une face horizontale (axe y dominant)
    normal = dir.y > 0 ? { x: 0, y: -1 } : { x: 0, y: 1 }
  }

  return { t: tEntry, normal }
}

/**
 * Cherche le milieu GRIN le plus proche sur la trajectoire du rayon,
 * parmi les milieux que le rayon ne traverse pas encore.
 */
function findGRINEntry(ray: Ray, scene: Scene): GRINHit | null {
  let closest: GRINHit | null = null

  for (const el of scene.elements) {
    if (!isGRINMedium(el)) continue
    if (el.containsPoint(ray.origin)) continue   // déjà à l'intérieur → géré par findGRINMediumAt

    const bb  = el.getBoundingBox()
    const hit = rayAABBEntry(ray.origin, ray.direction, bb)
    if (hit === null) continue

    if (closest === null || hit.t < closest.t) {
      closest = {
        t:      hit.t,
        point:  {
          x: ray.origin.x + hit.t * ray.direction.x,
          y: ray.origin.y + hit.t * ray.direction.y,
        },
        normal: hit.normal,
        grin:   el as OpticalElement & GRINMedium,
        bb,
      }
    }
  }

  return closest
}

/**
 * Normale de la face de sortie d'un milieu GRIN, orientée VERS l'intérieur
 * (convention refract() : dot(d_exit, normal) < 0).
 *
 * On identifie la face la plus proche de exitPoint, puis on renvoie
 * la normale inward (pointant vers l'intérieur du milieu).
 */
function grinExitNormal(exitPoint: Vec2, bb: BoundingBox): Vec2 {
  const dLeft   = Math.abs(exitPoint.x - bb.min.x)
  const dRight  = Math.abs(exitPoint.x - bb.max.x)
  const dTop    = Math.abs(exitPoint.y - bb.min.y)
  const dBottom = Math.abs(exitPoint.y - bb.max.y)

  const minD = Math.min(dLeft, dRight, dTop, dBottom)

  // Normale inward = pointe vers l'intérieur du milieu GRIN
  if (minD === dLeft)   return { x:  1, y: 0 }   // face gauche → inward = droite
  if (minD === dRight)  return { x: -1, y: 0 }   // face droite → inward = gauche
  if (minD === dTop)    return { x: 0,  y: 1 }   // face haute  → inward = bas
  return                       { x: 0,  y: -1 }  // face basse  → inward = haut
}

// ─────────────────────────────────────────────────────────────────────────────
// traceRay — boucle de tracé principal
//
// Algorithme par rebond :
//   0. Si l'origine est dans un milieu GRIN → intégrateur RK4 jusqu'à la sortie
//   1. Trouver l'intersection la plus proche parmi toutes les surfaces
//   1b. Trouver l'entrée GRIN la plus proche (rayon entrant dans un GRIN)
//   2a. Si entrée GRIN plus proche que toute surface (ou aucune surface) :
//         - Segment droit jusqu'à la face d'entrée
//         - Réfraction air → n_GRIN(entrée)
//         - RK4 à l'intérieur
//         - Réfraction n_GRIN(sortie) → air
//   2b. Sinon → physique habituelle à la surface (réflexion / réfraction)
//   3. Émettre un RaySegment et continuer avec le nouveau rayon
//
// Arrêt : aucune intersection (segment terminal ajouté) ou MAX_BOUNCES atteint.
// ─────────────────────────────────────────────────────────────────────────────

export function traceRay(ray: Ray, scene: Scene): TraceResult {
  // Pré-calcul : liste plate des surfaces + map surfaceId → OpticalElement
  const allSurfaces: OpticalSurface[] = []
  const surfaceOwner = new Map<string, OpticalElement>()
  for (const element of scene.elements) {
    for (const surface of element.getSurfaces()) {
      allSurfaces.push(surface)
      surfaceOwner.set(surface.id, element)
    }
  }

  const segments: RaySegment[] = []
  let totalOpticalPath = 0
  let current = ray
  // Indice du milieu dans lequel le rayon se propage (1 = air)
  let currentN = 1

  for (let bounce = 0; bounce < MAX_BOUNCES; bounce++) {
    // ── 0. Déjà dans un milieu GRIN ? ────────────────────────────────────────
    // Le rayon est à l'intérieur : on délègue à l'intégrateur RK4.
    const grinInside = findGRINMediumAt(current.origin, scene)
    if (grinInside !== null) {
      const grinResult = integrateGRIN(
        current.origin,
        current.direction,
        grinInside,
        current.wavelength,
      )
      segments.push(buildGRINSegment(grinResult, current.wavelength, current.intensity))
      totalOpticalPath += grinResult.opticalPath

      // ── Réfraction à la sortie : n_GRIN → air ─────────────────────────
      const exitPt   = grinResult.exitPoint
      const exitDir  = grinResult.exitDirection
      const bb       = grinInside.getBoundingBox()
      const exitN    = grinExitNormal(exitPt, bb)
      const nGRINExit = grinInside.refractiveIndexAt(exitPt, current.wavelength)
      const refractedExit = refract(exitDir, exitN, nGRINExit, 1)
      const finalDir = refractedExit ?? reflect(exitDir, exitN)   // TIR si null

      currentN = refractedExit !== null ? 1 : nGRINExit
      current = {
        origin:       exitPt,
        direction:    finalDir,
        wavelength:   current.wavelength,
        intensity:    current.intensity,
        polarization: current.polarization,
        opticalPath:  totalOpticalPath,
      }
      continue
    }

    // ── 1. Intersection de surface la plus proche ─────────────────────────────
    let closest: HitResult | null = null
    let closestSurface: OpticalSurface | null = null

    for (const surface of allSurfaces) {
      const hit = surface.intersect(current)
      if (hit !== null && (closest === null || hit.t < closest.t)) {
        closest = hit
        closestSurface = surface
      }
    }

    // ── 1b. Entrée dans un milieu GRIN ? ─────────────────────────────────────
    const grinEntry = findGRINEntry(current, scene)

    // ── 2a. L'entrée GRIN est-elle plus proche que toute surface ? ───────────
    if (grinEntry !== null && (closest === null || grinEntry.t < closest.t)) {
      const entryPt = grinEntry.point

      // Segment droit de l'origine jusqu'à la face d'entrée
      segments.push({
        start: current.origin,
        end:   entryPt,
        wavelength: current.wavelength,
        intensity:  current.intensity,
      })
      totalOpticalPath += currentN * grinEntry.t

      // Réfraction à l'entrée : air → n_GRIN
      const nGRINEntry  = grinEntry.grin.refractiveIndexAt(entryPt, current.wavelength)
      const refractedIn = refract(current.direction, grinEntry.normal, 1, nGRINEntry)
      // TIR à l'entrée air→verre normalement impossible (n_GRIN ≥ 1),
      // mais on gère par réflexion au cas où (profil linéaire avec n<1).
      const inDir = refractedIn ?? reflect(current.direction, grinEntry.normal)

      // Nudge de 0.5 px à l'intérieur pour que containsPoint renvoie true
      const insideStart: Vec2 = {
        x: entryPt.x + 0.5 * inDir.x,
        y: entryPt.y + 0.5 * inDir.y,
      }

      // RK4 à l'intérieur du milieu GRIN
      const grinResult = integrateGRIN(insideStart, inDir, grinEntry.grin, current.wavelength)
      segments.push(buildGRINSegment(grinResult, current.wavelength, current.intensity))
      totalOpticalPath += grinResult.opticalPath

      // Réfraction à la sortie : n_GRIN → air
      const exitPt    = grinResult.exitPoint
      const exitDir   = grinResult.exitDirection
      const exitN     = grinExitNormal(exitPt, grinEntry.bb)
      const nGRINExit = grinEntry.grin.refractiveIndexAt(exitPt, current.wavelength)
      const refractedOut = refract(exitDir, exitN, nGRINExit, 1)
      const outDir = refractedOut ?? reflect(exitDir, exitN)   // TIR interne

      currentN = refractedOut !== null ? 1 : nGRINExit
      current = {
        origin:       exitPt,
        direction:    outDir,
        wavelength:   current.wavelength,
        intensity:    current.intensity,
        polarization: current.polarization,
        opticalPath:  totalOpticalPath,
      }
      continue
    }

    // ── 2b. Aucune intersection ───────────────────────────────────────────────
    if (closest === null || closestSurface === null) {
      segments.push({
        start: current.origin,
        end: {
          x: current.origin.x + current.direction.x * FREE_RAY_LENGTH,
          y: current.origin.y + current.direction.y * FREE_RAY_LENGTH,
        },
        wavelength: current.wavelength,
        intensity:  current.intensity,
      })
      totalOpticalPath += currentN * FREE_RAY_LENGTH
      break
    }

    // ── 3. Segment courant (origine → point d'impact) ────────────────────────
    segments.push({
      start: current.origin,
      end:   closest.point,
      wavelength: current.wavelength,
      intensity:  current.intensity,
    })
    totalOpticalPath += currentN * closest.t

    // ── 4. Physique à la surface ──────────────────────────────────────────────
    const element = surfaceOwner.get(closest.surfaceId)!
    let newDir: Vec2

    if (closestSurface instanceof ThinLensSurface) {
      // Lentille mince : déflexion exacte en pentes (d·â facteur non-paraxial)
      newDir = closestSurface.deflect(current.direction, closest.point)
      // currentN inchangé (air des deux côtés)

    } else if (element.type === 'flat-mirror' || element.type === 'curved-mirror' || element.type === 'conic-mirror') {
      // Miroir : réflexion spéculaire r⃗ = d⃗ − 2(d⃗·n⃗)n⃗
      newDir = reflect(current.direction, closest.normal)
      // currentN inchangé

    } else {
      // Surface réfractante : identifier n₁ et n₂
      // On sonde légèrement EN ARRIÈRE du point de contact pour s'affranchir
      // des imprécisions numériques au bord de l'élément.
      const behindPoint: Vec2 = {
        x: closest.point.x - 1e-6 * current.direction.x,
        y: closest.point.y - 1e-6 * current.direction.y,
      }
      const isInsideElement = element.containsPoint(behindPoint)
      const nMaterial = closestSurface.getRefractiveIndex(current.wavelength)
      const n1 = isInsideElement ? nMaterial : 1
      const n2 = isInsideElement ? 1 : nMaterial

      const refracted = refract(current.direction, closest.normal, n1, n2)
      if (refracted === null) {
        // Réflexion totale interne : même milieu, direction réfléchie
        newDir = reflect(current.direction, closest.normal)
        // currentN reste n1
      } else {
        newDir = refracted
        currentN = n2
      }
    }

    // ── 5. Nouveau rayon ──────────────────────────────────────────────────────
    current = {
      origin: closest.point,
      direction: newDir,
      wavelength: current.wavelength,
      intensity: current.intensity,
      polarization: current.polarization,
      opticalPath: totalOpticalPath,
    }
  }

  return { segments, totalOpticalPath }
}
