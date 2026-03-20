import type { Ray, Scene, TraceResult, RaySegment, OpticalSurface, OpticalElement, Vec2, HitResult, GRINMedium, BoundingBox } from './types.ts'
import { ThinLensSurface } from './elements/thin-lens.ts'
import { reflect, refract } from './optics.ts'
import { dot } from './vector.ts'
import { fresnelCoefficients } from './fresnel.ts'
import { integrateGRIN, buildGRINSegment } from './tracer-grin.ts'
import { beerLambert, getAbsorptionCoeff } from './absorption.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

/** Nombre maximum de rebonds avant l'arrêt forcé du tracé. */
export const MAX_BOUNCES = 64

/** Longueur du segment terminal quand aucune intersection n'est trouvée (px). */
export const FREE_RAY_LENGTH = 10_000

/** Profondeur maximale de ray splitting (réflexions partielles). */
const MAX_SPLIT_DEPTH = 2

/**
 * Intensité minimale en dessous de laquelle un rayon splitté n'est pas tracé.
 * 0.001 = 0.1% — permet de voir R_p sur toute la plage angulaire avant Brewster.
 */
const MIN_SPLIT_INTENSITY = 0.001

/**
 * Distance minimale pour détecter une entrée GRIN (px).
 * Évite la re-détection immédiate après la sortie du milieu.
 */
const GRIN_ENTRY_T_MIN = 1.0

// ─────────────────────────────────────────────────────────────────────────────
// GRIN helpers — duck typing, pas d'import de GRINElement
// ─────────────────────────────────────────────────────────────────────────────

function isGRINMedium(el: OpticalElement): el is OpticalElement & GRINMedium {
  return 'refractiveIndexAt' in el && 'gradientAt' in el
}

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
  t: number
  point: Vec2
  /** Normale outward de la face d'entrée : dot(d, normal) < 0. */
  normal: Vec2
  grin: OpticalElement & GRINMedium
  bb: BoundingBox
}

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

  let normal: Vec2
  if (txMin >= tyMin) {
    normal = dir.x > 0 ? { x: -1, y: 0 } : { x: 1, y: 0 }
  } else {
    normal = dir.y > 0 ? { x: 0, y: -1 } : { x: 0, y: 1 }
  }
  return { t: tEntry, normal }
}

function findGRINEntry(ray: Ray, scene: Scene): GRINHit | null {
  let closest: GRINHit | null = null
  for (const el of scene.elements) {
    if (!isGRINMedium(el)) continue
    if (el.containsPoint(ray.origin)) continue
    const bb  = el.getBoundingBox()
    const hit = rayAABBEntry(ray.origin, ray.direction, bb)
    if (hit === null) continue
    if (closest === null || hit.t < closest.t) {
      closest = {
        t:      hit.t,
        point:  { x: ray.origin.x + hit.t * ray.direction.x, y: ray.origin.y + hit.t * ray.direction.y },
        normal: hit.normal,
        grin:   el as OpticalElement & GRINMedium,
        bb,
      }
    }
  }
  return closest
}

/** Normale inward à la face de sortie GRIN (convention : dot(d_exit, normal) < 0). */
function grinExitNormal(exitPoint: Vec2, bb: BoundingBox): Vec2 {
  const dLeft   = Math.abs(exitPoint.x - bb.min.x)
  const dRight  = Math.abs(exitPoint.x - bb.max.x)
  const dTop    = Math.abs(exitPoint.y - bb.min.y)
  const dBottom = Math.abs(exitPoint.y - bb.max.y)
  const minD = Math.min(dLeft, dRight, dTop, dBottom)
  if (minD === dLeft)  return { x:  1, y: 0 }
  if (minD === dRight) return { x: -1, y: 0 }
  if (minD === dTop)   return { x: 0,  y: 1 }
  return                      { x: 0,  y: -1 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers Fresnel
// ─────────────────────────────────────────────────────────────────────────────

/** cosI à partir de la direction du rayon et de la normale (convention dot(d,n)<0). */
function cosIncidence(d: Vec2, n: Vec2): number {
  return Math.min(1, Math.max(0, -dot(d, n)))
}

/** Réflectance scalaire selon la polarisation du rayon. */
function reflectance(n1: number, n2: number, cosI: number, pol: Ray['polarization']): number {
  const f = fresnelCoefficients(n1, n2, cosI)
  if (pol === 's') return f.Rs
  if (pol === 'p') return f.Rp
  return f.Runpol   // 'unpolarized' ou undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// traceRay — boucle de tracé principal
//
// splitDepth : profondeur maximale de splitting (rayons réfléchis partiels).
//   0 = pas de splitting (rayon unique jusqu'au bout)
//   MAX_SPLIT_DEPTH (2) = deux niveaux de reflets partiels
//
// Algorithme par rebond :
//   0. Si dans un GRIN → RK4 + réfraction sortie
//   1. Trouver l'intersection la plus proche (surfaces OU entrée GRIN)
//   2a. Entrée GRIN plus proche : straight → réfraction → RK4 → réfraction sortie
//   2b. Sinon, physique habituelle à la surface :
//         - ThinLens : déflexion, pas de Fresnel
//         - Miroir   : réflexion, pas de Fresnel
//         - Réfracteur : Snell + Fresnel
//             * Intensité transmise = intensity × T
//             * Si splitDepth > 0 et R×intensity > MIN_SPLIT_INTENSITY :
//               → rayon réfléchi tracé récursivement avec splitDepth−1
//   3. Émettre un RaySegment et continuer avec le nouveau rayon
// ─────────────────────────────────────────────────────────────────────────────

export function traceRay(ray: Ray, scene: Scene, splitDepth = MAX_SPLIT_DEPTH): TraceResult {
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
  let currentN = 1

  for (let bounce = 0; bounce < MAX_BOUNCES; bounce++) {
    // ── 0. Déjà dans un milieu GRIN ? ────────────────────────────────────────
    const grinInside = findGRINMediumAt(current.origin, scene)
    if (grinInside !== null) {
      const grinResult = integrateGRIN(current.origin, current.direction, grinInside, current.wavelength)
      segments.push(buildGRINSegment(grinResult, current.wavelength, current.intensity))
      totalOpticalPath += grinResult.opticalPath

      // Réfraction sortie n_GRIN → air (avec Fresnel pour l'intensité)
      const exitPt    = grinResult.exitPoint
      const exitDir   = grinResult.exitDirection
      const bb        = grinInside.getBoundingBox()
      const exitN     = grinExitNormal(exitPt, bb)
      const nGRINExit = grinInside.refractiveIndexAt(exitPt, current.wavelength)
      const cosIExit  = cosIncidence(exitDir, exitN)
      const R         = reflectance(nGRINExit, 1, cosIExit, current.polarization)
      const T         = 1 - R

      const refractedExit = refract(exitDir, exitN, nGRINExit, 1)
      const finalDir  = refractedExit ?? reflect(exitDir, exitN)
      currentN = refractedExit !== null ? 1 : nGRINExit

      current = {
        origin:       exitPt,
        direction:    finalDir,
        wavelength:   current.wavelength,
        intensity:    current.intensity * (refractedExit !== null ? T : 1),
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

    // ── 2a. Entrée GRIN plus proche ──────────────────────────────────────────
    if (grinEntry !== null && (closest === null || grinEntry.t < closest.t)) {
      const entryPt = grinEntry.point

      segments.push({ start: current.origin, end: entryPt, wavelength: current.wavelength, intensity: current.intensity })
      totalOpticalPath += currentN * grinEntry.t

      // Réfraction entrée air → n_GRIN (avec Fresnel)
      const nGRINEntry  = grinEntry.grin.refractiveIndexAt(entryPt, current.wavelength)
      const cosIEntry   = cosIncidence(current.direction, grinEntry.normal)
      const R           = reflectance(1, nGRINEntry, cosIEntry, current.polarization)
      const T           = 1 - R
      const refractedIn = refract(current.direction, grinEntry.normal, 1, nGRINEntry)
      const inDir       = refractedIn ?? reflect(current.direction, grinEntry.normal)

      const insideStart: Vec2 = { x: entryPt.x + 0.5 * inDir.x, y: entryPt.y + 0.5 * inDir.y }

      const grinResult = integrateGRIN(insideStart, inDir, grinEntry.grin, current.wavelength)
      segments.push(buildGRINSegment(grinResult, current.wavelength, current.intensity * T))
      totalOpticalPath += grinResult.opticalPath

      // Réfraction sortie n_GRIN → air
      const exitPt    = grinResult.exitPoint
      const exitDir   = grinResult.exitDirection
      const exitN     = grinExitNormal(exitPt, grinEntry.bb)
      const nGRINExit = grinEntry.grin.refractiveIndexAt(exitPt, current.wavelength)
      const cosIExit  = cosIncidence(exitDir, exitN)
      const Rout      = reflectance(nGRINExit, 1, cosIExit, current.polarization)
      const Tout      = 1 - Rout
      const refractedOut = refract(exitDir, exitN, nGRINExit, 1)
      const outDir    = refractedOut ?? reflect(exitDir, exitN)
      currentN = refractedOut !== null ? 1 : nGRINExit

      current = {
        origin:       exitPt,
        direction:    outDir,
        wavelength:   current.wavelength,
        intensity:    current.intensity * T * (refractedOut !== null ? Tout : 1),
        polarization: current.polarization,
        opticalPath:  totalOpticalPath,
      }
      continue
    }

    // ── 2b. Aucune intersection ───────────────────────────────────────────────
    if (closest === null || closestSurface === null) {
      segments.push({
        start: current.origin,
        end:   { x: current.origin.x + current.direction.x * FREE_RAY_LENGTH, y: current.origin.y + current.direction.y * FREE_RAY_LENGTH },
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
      // Lentille mince : déflexion exacte, pas de Fresnel (idéalisé)
      newDir = closestSurface.deflect(current.direction, closest.point)

    } else if (element.type === 'flat-mirror' || element.type === 'curved-mirror' || element.type === 'conic-mirror') {
      // Miroir parfait : réflexion totale, intensité inchangée
      newDir = reflect(current.direction, closest.normal)

    } else {
      // Surface réfractante : Snell + Fresnel
      const behindPoint: Vec2 = {
        x: closest.point.x - 1e-6 * current.direction.x,
        y: closest.point.y - 1e-6 * current.direction.y,
      }
      const isInsideElement = element.containsPoint(behindPoint)

      // ── Beer-Lambert : atténuation dans le milieu traversé ─────────────────
      // On applique l'absorption quand on est en train de QUITTER le milieu
      // (isInsideElement = true). La distance est closest.t = distance parcourue
      // depuis la dernière surface (entrée dans l'élément).
      if (isInsideElement) {
        const alpha = getAbsorptionCoeff(element)
        if (alpha > 0) {
          const attenuated = beerLambert(current.intensity, alpha, closest.t)
          // Mise à jour rétroactive du dernier segment poussé (intensité en sortie)
          segments[segments.length - 1].intensity = attenuated
          current = { ...current, intensity: attenuated }
        }
      }

      const nMaterial = closestSurface.getRefractiveIndex(current.wavelength)
      const n1 = isInsideElement ? nMaterial : 1
      const n2 = isInsideElement ? 1 : nMaterial

      const cosI = cosIncidence(current.direction, closest.normal)
      const R    = reflectance(n1, n2, cosI, current.polarization)
      const T    = 1 - R

      const refracted = refract(current.direction, closest.normal, n1, n2)

      if (refracted === null) {
        // Réflexion totale interne : toute l'énergie réfléchie, pas de split
        newDir = reflect(current.direction, closest.normal)
        // currentN inchangé (on reste dans le même milieu)
      } else {
        // ── Ray splitting : reflet partiel ──────────────────────────────────
        // On émet un rayon réfléchi avec R×intensity si l'intensité est significative.
        if (splitDepth > 0 && R * current.intensity >= MIN_SPLIT_INTENSITY) {
          const reflectedRay: Ray = {
            origin:       closest.point,
            direction:    reflect(current.direction, closest.normal),
            wavelength:   current.wavelength,
            intensity:    current.intensity * R,
            polarization: current.polarization,
            opticalPath:  totalOpticalPath,
          }
          const reflectedResult = traceRay(reflectedRay, scene, splitDepth - 1)
          // Fusionne les segments du rayon réfléchi dans le résultat courant
          for (const s of reflectedResult.segments) segments.push(s)
        }

        // Le rayon principal continue avec T×intensity
        newDir   = refracted
        currentN = n2
        current  = {
          ...current,
          intensity: current.intensity * T,
        }
      }
    }

    // ── 5. Nouveau rayon ──────────────────────────────────────────────────────
    current = {
      origin:       closest.point,
      direction:    newDir,
      wavelength:   current.wavelength,
      intensity:    current.intensity,
      polarization: current.polarization,
      opticalPath:  totalOpticalPath,
    }
  }

  return { segments, totalOpticalPath }
}
