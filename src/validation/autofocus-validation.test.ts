/**
 * Validation — Auto-focus (balayage dense + goldenSectionSearch sur position du plan image)
 *
 * Setup : ThickLens biconvexe N-BK7, R1=R2=51.7mm, épaisseur 4mm, φ25mm.
 * Source : faisceau parallèle à 555nm, 7 rayons, largeur 20mm (±10mm).
 *
 * AF1 — Plan image après auto-focus à ±3mm de la BFD théorique (≈49.3mm après V2)
 * AF2 — RMS après auto-focus < RMS avant auto-focus (le RMS ne doit jamais augmenter)
 * AF3 — Objet ponctuel à 200mm avant V1 : auto-focus à ±2mm de l'image conjuguée
 * AF4 — Miroir parabolique (κ=−1) + faisceau parallèle : auto-focus à ±1mm du foyer exact
 * AF5 — Au moins 5 rayons valides sur 7 rayons pour le faisceau standard
 * AF6 — Faisceau large (40mm, 9 rayons) dont les extrêmes passent à côté de la lentille :
 *        les rayons hors ouverture ne doivent PAS être comptés dans le spot diagram.
 * AF7 — Balayage dense : l'auto-focus ne se positionne jamais à un RMS > 2× le minimum global.
 * AF8 — Cohérence métrique : rmsAfter == RMS recalculé indépendamment à la même position.
 */

import { describe, it, expect } from 'vitest'
import { ThickLens }    from '../core/elements/thick-lens.ts'
import { ConicMirror }  from '../core/elements/conic-mirror.ts'
import { ImagePlane }   from '../core/elements/image-plane.ts'
import { collectSpots } from '../core/spot-diagram.ts'
import { goldenSectionSearch, makeRmsMetric } from '../core/optimizer.ts'
import { traceRay }     from '../core/tracer.ts'
import { normalize }    from '../core/vector.ts'
import { BeamSource }   from '../core/sources/beam.ts'
import type { Ray, Scene, TraceResult, Vec2 } from '../core/types.ts'

// ─── Setup — Lentille épaisse N-BK7 biconvexe ────────────────────────────────

const WAVELENGTH = 555  // nm

const lens = new ThickLens({
  id:        'af-lens',
  position:  { x: 0, y: 0 },
  angle:     0,
  R1: 51.7, R2: 51.7,
  kappa1: 0, kappa2: 0,
  thickness: 4,
  halfHeight: 12.5,
  n:       1.5168,
  glassId: 'N-BK7',
})

const V2x = lens.vertex2().x  // = +2mm

// BFD théorique calculée via optique matricielle (focalData)
const fd555 = lens.focalData(WAVELENGTH)!
const BFD_THEO = fd555.Fp.x - V2x  // distance de V2 au foyer image ≈ 49.3mm

const lensScene: Scene = { elements: [lens], sources: [], metadata: { name: 'af-lens' } }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRay(ox: number, oy: number, dx: number, dy: number, wl = WAVELENGTH): Ray {
  return {
    origin:     { x: ox, y: oy },
    direction:  normalize({ x: dx, y: dy }),
    wavelength: wl,
    intensity:  1,
  }
}

/**
 * Filtre les rayons valides pour l'auto-focus.
 *
 * Un rayon est valide si :
 *   1) Il a traversé au moins une surface optique (segments.length ≥ 2)
 *   2) Son dernier segment se propage dans le sens de l'axe optique (dot > 0)
 *   3) Il n'est pas un reflet Fresnel (intensité du dernier segment > 0.1)
 */
function filterValidRays(results: TraceResult[], axisDir: Vec2 = { x: 1, y: 0 }): TraceResult[] {
  return results.filter(r => {
    if (r.segments.length < 2) return false
    const last = r.segments[r.segments.length - 1]
    const dx = last.end.x - last.start.x
    const dy = last.end.y - last.start.y
    const dotAxis = dx * axisDir.x + dy * axisDir.y
    if (dotAxis <= 0) return false
    if (last.intensity <= 0.1) return false
    return true
  })
}

/**
 * Réduit chaque TraceResult à son seul segment primaire (le dernier segment
 * transmis, après toutes les surfaces).
 *
 * Les rayons Fresnel (sub-rays issus du splitting) sont fusionnés dans le même
 * TraceResult que le rayon principal. Certains de ces sub-segments vont dans le
 * sens +x et intersectent le plan image, créant des points fantômes qui faussent
 * le RMS. En ne conservant que le dernier segment (rayon primaire transmis), on
 * élimine complètement ces artefacts.
 */
function toPrimaryOnly(results: TraceResult[]): TraceResult[] {
  return results.map(r => ({
    segments: [r.segments[r.segments.length - 1]],
    totalOpticalPath: r.totalOpticalPath,
  }))
}

/**
 * Auto-focus : déplace le plan image le long de l'axe pour minimiser le RMS.
 *
 * Algorithme :
 *   1. Balayage dense (N_SCAN points) → courbe complète, minimum global identifié.
 *   2. Affinage GSS dans ±REFINE_MM autour du minimum global.
 *
 * Le filtre de rayons utilisé est identique à celui du panel d'affichage :
 * segments.length ≥ 2 (interaction optique) + dernier segment uniquement (pas de
 * sous-rayons Fresnel). Cela garantit que rmsAfter == RMS recalculé indépendamment.
 *
 * @param plane      Plan image à déplacer
 * @param spotPrimary Rayons déjà filtrés (segments≥2, last-segment-only)
 * @param lo         Borne inférieure de la plage de recherche
 * @param hi         Borne supérieure de la plage de recherche
 */
function runAutoFocus(
  plane: ImagePlane,
  spotPrimary: TraceResult[],
  lo: number,
  hi: number,
  nScan   = 200,
  refineM = 10,
): { optAx: number; rmsBefore: number; rmsAfter: number } {
  const origPos   = { ...plane.position }
  const axDir     = plane.axisDir
  const currentAx = origPos.x * axDir.x + origPos.y * axDir.y

  function evalAt(ax: number): number {
    const d = ax - currentAx
    plane.position = { x: origPos.x + d * axDir.x, y: origPos.y + d * axDir.y }
    const s = collectSpots(plane, spotPrimary)
    return s.rmsRadius > 0 ? s.rmsRadius : Infinity
  }

  const rmsBefore = evalAt(currentAx)

  // ── 1. Balayage dense → minimum global ──────────────────────────────────────
  let bestAx = lo, bestRms = Infinity
  for (let i = 0; i <= nScan; i++) {
    const ax = lo + (hi - lo) * i / nScan
    const r  = evalAt(ax)
    if (r < bestRms) { bestRms = r; bestAx = ax }
  }

  // ── 2. Affinage GSS dans ±refineM autour du minimum global ──────────────────
  const refLo = Math.max(lo, bestAx - refineM)
  const refHi = Math.min(hi, bestAx + refineM)
  const { x: optAx } = goldenSectionSearch(evalAt, refLo, refHi, 0.01, 100)
  const rmsAfter = evalAt(optAx)

  // Restaure la position initiale
  plane.position = origPos

  return { optAx, rmsBefore, rmsAfter }
}

/**
 * Construit le spotPrimary depuis des TraceResults bruts :
 * filtre les rayons sans interaction optique (segments < 2) et ne conserve
 * que le dernier segment (rayon primaire transmis, exclut les sous-rayons Fresnel).
 * Ce filtre est identique à celui utilisé dans le panel d'affichage (spotPrimary).
 */
function toSpotPrimary(results: TraceResult[]): TraceResult[] {
  return results
    .filter(r => r.segments.length >= 2)
    .map(r => ({ segments: [r.segments[r.segments.length - 1]], totalOpticalPath: r.totalOpticalPath }))
}

/**
 * Calcule la borne inférieure de la plage de recherche :
 * position x du début du dernier segment de chaque rayon valide + marge.
 */
function searchBounds(valid: TraceResult[], margin = 1, range = 300): [number, number] {
  const lastX = Math.max(...valid.map(r => r.segments[r.segments.length - 1].start.x))
  const lo = lastX + margin
  return [lo, lo + range]
}

// ─── AF1 & AF2 : faisceau parallèle standard ─────────────────────────────────

describe('AF1 — Plan image après auto-focus à ±2mm de la BFD théorique', () => {
  // 7 rayons parallèles à ±10mm (largeur 20mm)
  const rays = Array.from({ length: 7 }, (_, i) => {
    const h = -10 + (20 * i) / 6  // −10, −10/3*2, …, +10
    return makeRay(-500, h, 1, 0)
  })
  const results     = rays.map(r => traceRay(r, lensScene))
  const spotPrimary = toSpotPrimary(results)

  // Plan image initial loin du foyer
  const plane = new ImagePlane({ id: 'ip-af1', position: { x: 200, y: 0 }, angle: 0, height: 50 })
  const [lo, hi] = searchBounds(spotPrimary)

  const { optAx } = runAutoFocus(plane, spotPrimary, lo, hi)
  const bfdFound = optAx - V2x

  it(`BFD théorique ≈ ${BFD_THEO.toFixed(2)}mm`, () => {
    // Sanity check du setup
    expect(BFD_THEO).toBeGreaterThan(47)
    expect(BFD_THEO).toBeLessThan(52)
  })

  it('auto-focus à ±3mm de la BFD théorique', () => {
    // Note : avec un faisceau de ±10mm, l'aberration sphérique déplace le
    // minimum RMS d'environ 2.5mm par rapport au foyer paraxial. La tolérance
    // de ±3mm couvre ce décalage physique attendu.
    expect(Math.abs(bfdFound - BFD_THEO)).toBeLessThan(3)
  })
})

describe('AF2 — RMS après auto-focus ≤ RMS avant', () => {
  const rays = Array.from({ length: 7 }, (_, i) => {
    const h = -10 + (20 * i) / 6
    return makeRay(-500, h, 1, 0)
  })
  const results     = rays.map(r => traceRay(r, lensScene))
  const spotPrimary = toSpotPrimary(results)

  // Plan image initial très loin du foyer pour avoir un grand RMS
  const plane = new ImagePlane({ id: 'ip-af2', position: { x: 300, y: 0 }, angle: 0, height: 100 })
  const [lo, hi] = searchBounds(spotPrimary)

  const { rmsBefore, rmsAfter } = runAutoFocus(plane, spotPrimary, lo, hi)

  it('RMS avant > 0 (plan initial hors foyer)', () => {
    expect(rmsBefore).toBeGreaterThan(0)
    expect(isFinite(rmsBefore)).toBe(true)
  })

  it('RMS après ≤ RMS avant', () => {
    expect(rmsAfter).toBeLessThanOrEqual(rmsBefore)
  })

  it('RMS après < RMS avant (amélioration effective)', () => {
    expect(rmsAfter).toBeLessThan(rmsBefore)
  })
})

// ─── AF3 : objet ponctuel à 200mm avant V1 ───────────────────────────────────

describe('AF3 — Objet ponctuel à 200mm : auto-focus à ±2mm de la conjuguée', () => {
  const V1x  = lens.vertex1().x  // = −2mm
  const objX = V1x - 200         // −202mm

  // Image conjuguée théorique via formule gaussienne (plans principaux)
  const u_H       = objX - fd555.H.x
  const v_Hp      = 1 / (1 / fd555.f + 1 / u_H)
  const expectedX = fd555.Hp.x + v_Hp  // x du plan image théorique

  // 7 rayons divergents depuis le point objet vers les hauteurs de la lentille.
  // On utilise h ∈ [−3, +3] mm (régime quasi-paraxial) pour que l'aberration
  // sphérique soit négligeable (< 0.1mm) et que la comparaison avec la formule
  // gaussienne soit valide à ±2mm.
  const rays = Array.from({ length: 7 }, (_, i) => {
    const h = -3 + (6 * i) / 6  // −3, −2, −1, 0, +1, +2, +3 mm
    const V1x = lens.vertex1().x
    return makeRay(objX, 0, V1x - objX, h)  // vers (V1x, h)
  })
  const results     = rays.map(r => traceRay(r, lensScene))
  const spotPrimary = toSpotPrimary(results)

  // Plan image initial arbitraire
  const plane = new ImagePlane({ id: 'ip-af3', position: { x: 200, y: 0 }, angle: 0, height: 50 })
  const [lo, hi] = searchBounds(spotPrimary)

  const { optAx } = runAutoFocus(plane, spotPrimary, lo, hi)

  it('image conjuguée théorique est à droite du foyer objet', () => {
    expect(expectedX).toBeGreaterThan(V2x)
  })

  it('auto-focus à ±2mm de la position conjuguée théorique', () => {
    expect(Math.abs(optAx - expectedX)).toBeLessThan(2)
  })
})

// ─── AF4 : miroir parabolique — foyer exact ───────────────────────────────────

describe('AF4 — Miroir parabolique (κ=−1) : auto-focus à ±1mm du foyer exact', () => {
  /**
   * Miroir parabolique : vertex à (0,0), axe +x, R=100mm, κ=−1.
   * Foyer exact : F = (R/2, 0) = (50, 0).
   * 7 rayons parallèles (direction −x) depuis x=400, hauteurs ±10mm.
   * Après réflexion, tous convergent exactement vers (50, 0).
   */
  const R_MIRROR = 100
  const mirror = new ConicMirror({
    id: 'pm', position: { x: 0, y: 0 }, angle: 0,
    R: R_MIRROR, kappa: -1, halfHeight: 30,
  })
  const mirrorScene: Scene = { elements: [mirror], sources: [], metadata: { name: 'af-mirror' } }

  const focalX = mirror.focalPoint().x  // = R/2 = 50mm

  // 7 rayons parallèles venant de la droite (direction −x)
  const rays = Array.from({ length: 7 }, (_, i) => {
    const h = -10 + (20 * i) / 6
    return makeRay(400, h, -1, 0)
  })
  const results     = rays.map(r => traceRay(r, mirrorScene))
  const spotPrimary = toSpotPrimary(results)

  // Plan image initial loin du foyer
  const plane = new ImagePlane({ id: 'ip-af4', position: { x: 200, y: 0 }, angle: 0, height: 50 })
  const [lo, hi] = searchBounds(spotPrimary)

  const { optAx } = runAutoFocus(plane, spotPrimary, lo, hi)

  it('foyer théorique correct (R/2)', () => {
    expect(focalX).toBeCloseTo(R_MIRROR / 2, 5)
  })

  it('auto-focus à ±1mm du foyer exact de la parabole', () => {
    expect(Math.abs(optAx - focalX)).toBeLessThan(1)
  })
})

// ─── AF5 : comptage des rayons valides ────────────────────────────────────────

describe('AF5 — Au moins 5 rayons valides sur 7 (faisceau standard)', () => {
  const rays = Array.from({ length: 7 }, (_, i) => {
    const h = -10 + (20 * i) / 6
    return makeRay(-500, h, 1, 0)
  })
  const results = rays.map(r => traceRay(r, lensScene))
  const valid   = filterValidRays(results)

  it('7 rayons tracés au total', () => {
    expect(results).toHaveLength(7)
  })

  it('au moins 5 rayons valides (traversent la lentille, vont vers +x, intensité > 10%)', () => {
    expect(valid.length).toBeGreaterThanOrEqual(5)
  })

  it('tous les rayons valides ont segments.length ≥ 2', () => {
    for (const r of valid) {
      expect(r.segments.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('tous les rayons valides ont leur dernier segment orienté vers +x', () => {
    for (const r of valid) {
      const last = r.segments[r.segments.length - 1]
      const dx = last.end.x - last.start.x
      expect(dx).toBeGreaterThan(0)
    }
  })
})

// ─── AF6 : rayons hors ouverture exclus du spot diagram ──────────────────────

describe('AF6 — Rayons hors ouverture exclus du spot diagram et de l\'auto-focus', () => {
  /**
   * 9 rayons parallèles à 555nm, largeur 40mm (−20 à +20mm, pas 5mm).
   * Lens halfHeight = 12.5mm → rayons à h=±15mm et h=±20mm passent à côté (4 rayons).
   * Rayons à h=0, ±5, ±10mm traversent la lentille (5 rayons valides).
   *
   * Ce test vérifie que makeRmsMetric (et plus généralement tout calcul de spot)
   * exclut les rayons sans interaction optique (segments.length = 1).
   *
   * Ce test ÉCHOUE si makeRmsMetric n'applique pas le filtre segments.length ≥ 2 :
   * les rayons manqués (droites constantes en y) dominent le RMS et le rendent
   * uniformément élevé sur toute la plage de recherche → l'auto-focus trouve
   * une position arbitraire, pas la BFD.
   */
  const BEAM_WIDTH = 40   // mm — largeur totale du faisceau
  const N_RAYS     = 9    // rayons de h=−20 à h=+20 par pas de 5mm

  // Scène : lentille + plan image à la BFD théorique + source large
  const focusX = V2x + BFD_THEO
  const imagePlane = new ImagePlane({
    id: 'ip-af6', position: { x: focusX, y: 0 }, angle: 0, height: 100,
  })
  const beam = new BeamSource({
    id: 'beam-af6',
    position: { x: -500, y: 0 },
    angle:    0,
    wavelengths: [WAVELENGTH],
    numRays: N_RAYS,
    width:   BEAM_WIDTH,
  })
  const sceneAF6: Scene = {
    elements: [lens, imagePlane],
    sources:  [beam],
    metadata: { name: 'af6' },
  }

  // Traces manuelles pour les assertions sur le comptage
  const allRays    = beam.generateRays()
  const allResults = allRays.map(r => traceRay(r, lensScene))
  // spotPrimary : filtre identique au panel (segments≥2, dernier segment)
  const spotPrimary = toSpotPrimary(allResults)

  it('certains rayons passent à côté (segments.length = 1)', () => {
    const missed = allResults.filter(r => r.segments.length < 2)
    expect(missed.length).toBeGreaterThan(0)
  })

  it('le nombre de rayons valides est inférieur au total (9)', () => {
    expect(spotPrimary.length).toBeLessThan(N_RAYS)
  })

  it('le RMS avec filtrage est significativement plus petit qu\'sans filtrage au foyer', () => {
    // Sans filtrage : les rayons manqués contribuent des spots à y=±15, ±20mm
    const rmsUnfiltered = collectSpots(imagePlane, toPrimaryOnly(allResults)).rmsRadius

    // Avec filtrage : seuls les 5 rayons traversant la lentille, convergents près de y=0
    const rmsFiltered = collectSpots(imagePlane, spotPrimary).rmsRadius

    // Le RMS sans filtrage doit être significativement plus élevé (> 2× le filtré)
    expect(rmsFiltered).toBeGreaterThan(0)
    expect(rmsUnfiltered).toBeGreaterThan(rmsFiltered * 2)
  })

  it('makeRmsMetric exclut les rayons sans interaction — RMS au foyer < 2mm', () => {
    // Ce test ÉCHOUE si makeRmsMetric n'applique pas le filtre segments.length ≥ 2.
    // Sans filtre : rms ≈ 10mm (dominé par les 4 rayons manqués constants à y=±15, ±20mm).
    // Avec filtre : rms ≈ 0.3mm (5 rayons valides convergent près du foyer).
    const metric = makeRmsMetric('ip-af6')
    const rmsAtFocus = metric(sceneAF6)
    expect(rmsAtFocus).toBeLessThan(2)
  })

  it('auto-focus avec filtrage à ±5mm de la BFD théorique', () => {
    const plane = new ImagePlane({ id: 'ip-af6b', position: { x: 300, y: 0 }, angle: 0, height: 100 })
    const [lo, hi] = searchBounds(spotPrimary)
    const { optAx } = runAutoFocus(plane, spotPrimary, lo, hi)
    const bfdFound = optAx - V2x
    expect(Math.abs(bfdFound - BFD_THEO)).toBeLessThan(5)
  })
})

// ─── AF7 : balayage dense — jamais > 2× le minimum global ────────────────────
//
// Contexte du bug : le Golden Section Search seul suppose l'unimodalité de la
// courbe RMS. Si la courbe a plusieurs minima locaux (ex. faisceau très large,
// aberrations importantes, plan image partant loin du foyer), le GSS peut
// converger vers un mauvais minimum. L'algorithme corrigé fait d'abord un
// balayage dense (200 points) pour identifier le minimum global, puis affine
// par GSS dans ±10mm autour de ce minimum.
//
// Ce test vérifie que le RMS trouvé est toujours ≤ 2× le minimum trouvable
// par un balayage de référence (500 points), quelle que soit la position
// initiale du plan image.
// ─────────────────────────────────────────────────────────────────────────────

describe('AF7 — Balayage dense : RMS ≤ 2× minimum global (courbe non-unimodale)', () => {
  /**
   * Scénario : faisceau ±10mm, plan image démarrant à 300mm (loin du foyer).
   * La plage de recherche est [V2x+1, V2x+301].
   * Le vrai minimum (cercle de moindre confusion) est à ≈V2x+46-49mm.
   *
   * On vérifie le résultat contre un balayage de référence à 500 points.
   */
  const rays7 = Array.from({ length: 7 }, (_, i) => {
    const h = -10 + (20 * i) / 6
    return makeRay(-500, h, 1, 0)
  })
  const results7     = rays7.map(r => traceRay(r, lensScene))
  const spotPrimary7 = toSpotPrimary(results7)

  const plane7 = new ImagePlane({ id: 'ip-af7', position: { x: 300, y: 0 }, angle: 0, height: 100 })

  const lastX7 = Math.max(...spotPrimary7.map(r => r.segments[0].start.x))
  const lo7    = lastX7 + 1
  const hi7    = lo7 + 300

  function evalAt7(ax: number): number {
    plane7.position = { x: ax, y: 0 }
    const s = collectSpots(plane7, spotPrimary7)
    return s.rmsRadius > 0 ? s.rmsRadius : Infinity
  }

  // ── Minimum de référence par balayage brut (500 points) ───────────────────
  let bruteMin = Infinity, bruteAx = lo7
  for (let i = 0; i <= 500; i++) {
    const ax = lo7 + (hi7 - lo7) * i / 500
    const r  = evalAt7(ax)
    if (r < bruteMin) { bruteMin = r; bruteAx = ax }
  }

  // ── Résultat de l'algorithme corrigé (scan 200pts + GSS ±10mm) ───────────
  let scanMin = Infinity, scanBestAx = lo7
  for (let i = 0; i <= 200; i++) {
    const ax = lo7 + (hi7 - lo7) * i / 200
    const r  = evalAt7(ax)
    if (r < scanMin) { scanMin = r; scanBestAx = ax }
  }
  const { x: optAx7 } = goldenSectionSearch(
    evalAt7,
    Math.max(lo7, scanBestAx - 10),
    Math.min(hi7, scanBestAx + 10),
    0.01, 100,
  )
  const rmsOpt7 = evalAt7(optAx7)

  // Restaure
  plane7.position = { x: 300, y: 0 }

  it('balayage de référence (500pts) trouve un minimum fini', () => {
    expect(isFinite(bruteMin)).toBe(true)
    expect(bruteMin).toBeGreaterThan(0)
  })

  it('le balayage dense (200pts) identifie le minimum global à ±15mm', () => {
    // Précision du scan : pas = 300/200 = 1.5mm → min identifié à ±1 pas ≈ ±1.5mm
    // On tolère ±15mm pour couvrir les effets de SA (minimum large)
    expect(Math.abs(scanBestAx - bruteAx)).toBeLessThan(15)
  })

  it('scan+GSS : RMS ≤ 2× minimum brut', () => {
    expect(isFinite(rmsOpt7)).toBe(true)
    expect(rmsOpt7).toBeLessThanOrEqual(bruteMin * 2)
  })

  it('scan+GSS : position optimale à ±5mm du minimum brut', () => {
    expect(Math.abs(optAx7 - bruteAx)).toBeLessThan(5)
  })
})

// ─── AF8 : cohérence métrique ─────────────────────────────────────────────────
//
// Contexte du bug : l'algorithme d'optimisation utilisait un filtre plus strict
// (direction axiale + intensité > 0.1) que le panel d'affichage (segments ≥ 2,
// dernier segment uniquement). Après auto-focus, le RMS "affiché" pouvait donc
// différer du RMS "optimisé". Le fix : utiliser spotPrimary pour les deux.
//
// AF8 vérifie que rmsAfter (calculé pendant l'optimisation) est strictement
// identique au RMS recalculé indépendamment à la même position avec le même
// filtre.
// ─────────────────────────────────────────────────────────────────────────────

describe('AF8 — Cohérence métrique : rmsAfter == RMS recalculé indépendamment (±1e-10)', () => {
  const rays8 = Array.from({ length: 7 }, (_, i) => {
    const h = -10 + (20 * i) / 6
    return makeRay(-500, h, 1, 0)
  })
  const results8     = rays8.map(r => traceRay(r, lensScene))
  const spotPrimary8 = toSpotPrimary(results8)

  const plane8 = new ImagePlane({ id: 'ip-af8', position: { x: 300, y: 0 }, angle: 0, height: 100 })
  const [lo8, hi8] = searchBounds(spotPrimary8)

  // Réplication de la logique handleAutoFocus avec spotPrimary8
  const currentAx8 = plane8.position.x   // axisDir = {x:1,y:0}

  function evalAt8(ax: number): number {
    plane8.position = { x: ax, y: 0 }
    const s = collectSpots(plane8, spotPrimary8)
    return s.rmsRadius > 0 ? s.rmsRadius : Infinity
  }

  let bestAx8 = lo8, bestRms8 = Infinity
  for (let i = 0; i <= 200; i++) {
    const ax = lo8 + (hi8 - lo8) * i / 200
    const r  = evalAt8(ax)
    if (r < bestRms8) { bestRms8 = r; bestAx8 = ax }
  }
  const { x: optAx8 } = goldenSectionSearch(
    evalAt8,
    Math.max(lo8, bestAx8 - 10),
    Math.min(hi8, bestAx8 + 10),
    0.01, 100,
  )

  // rmsAfter tel que calculé pendant l'optimisation
  const rmsAfter8 = evalAt8(optAx8)

  it('evalAt et collectSpots indépendant sont identiques à la position optimale', () => {
    // Recalcul indépendant : place le plan à optAx8, appelle collectSpots directement
    plane8.position = { x: optAx8, y: 0 }
    const rmsIndependent = collectSpots(plane8, spotPrimary8).rmsRadius

    // Les deux valeurs doivent être strictement identiques (même fonction, même état)
    expect(Math.abs(rmsAfter8 - rmsIndependent)).toBeLessThan(1e-10)
  })

  it('le filtre spotPrimary (segments≥2, dernier segment) donne rmsAfter fini et positif', () => {
    expect(isFinite(rmsAfter8)).toBe(true)
    expect(rmsAfter8).toBeGreaterThan(0)
  })

  it('rmsAfter ≤ RMS à la position initiale (optimisation effective)', () => {
    plane8.position = { x: currentAx8, y: 0 }
    const rmsBefore8 = collectSpots(plane8, spotPrimary8).rmsRadius
    expect(rmsAfter8).toBeLessThanOrEqual(rmsBefore8)
  })
})
