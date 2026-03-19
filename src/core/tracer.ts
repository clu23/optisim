import type { Ray, Scene, TraceResult, RaySegment, OpticalSurface, OpticalElement, Vec2, HitResult, GRINMedium } from './types.ts'
import { ThinLensSurface } from './elements/thin-lens.ts'
import { reflect, refract } from './optics.ts'
import { integrateGRIN, buildGRINSegment, exitRay as grinExitRay } from './tracer-grin.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

/** Nombre maximum de rebonds avant l'arrêt forcé du tracé. */
export const MAX_BOUNCES = 64

/** Longueur du segment terminal quand aucune intersection n'est trouvée (px). */
export const FREE_RAY_LENGTH = 10_000

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
// traceRay — boucle de tracé principal
//
// Algorithme par rebond :
//   0. Si l'origine est dans un milieu GRIN → intégrateur RK4 jusqu'à la sortie
//   1. Trouver l'intersection la plus proche parmi toutes les surfaces
//   2. Appliquer la physique :
//        - ThinLensSurface   → déflexion (formule lentille mince exacte)
//        - flat/curved/conic-mirror → réflexion spéculaire
//        - surface réfractante → Snell-Descartes ; TIR → réflexion totale
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
    // ── 0. Milieu GRIN ? ─────────────────────────────────────────────────────
    // Si le rayon se trouve à l'intérieur d'un milieu GRIN, on délègue
    // la propagation à l'intégrateur RK4 jusqu'à la sortie du milieu.
    const grin = findGRINMediumAt(current.origin, scene)
    if (grin !== null) {
      const grinResult = integrateGRIN(
        current.origin,
        current.direction,
        grin,
        current.wavelength,
      )
      segments.push(buildGRINSegment(grinResult, current.wavelength, current.intensity))
      totalOpticalPath += grinResult.opticalPath
      current = grinExitRay(current, grinResult)
      continue
    }

    // ── 1. Intersection la plus proche ──────────────────────────────────────
    let closest: HitResult | null = null
    let closestSurface: OpticalSurface | null = null

    for (const surface of allSurfaces) {
      const hit = surface.intersect(current)
      if (hit !== null && (closest === null || hit.t < closest.t)) {
        closest = hit
        closestSurface = surface
      }
    }

    if (closest === null || closestSurface === null) {
      // Aucune intersection : segment terminal « libre »
      segments.push({
        start: current.origin,
        end: {
          x: current.origin.x + current.direction.x * FREE_RAY_LENGTH,
          y: current.origin.y + current.direction.y * FREE_RAY_LENGTH,
        },
        wavelength: current.wavelength,
        intensity: current.intensity,
      })
      totalOpticalPath += currentN * FREE_RAY_LENGTH
      break
    }

    // ── 2. Segment courant (origine → point d'impact) ────────────────────────
    segments.push({
      start: current.origin,
      end: closest.point,
      wavelength: current.wavelength,
      intensity: current.intensity,
    })
    // t = distance parcourue (direction normalisée)
    totalOpticalPath += currentN * closest.t

    // ── 3. Physique à la surface ─────────────────────────────────────────────
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

    // ── 4. Nouveau rayon ─────────────────────────────────────────────────────
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
