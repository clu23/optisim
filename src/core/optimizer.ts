// ─────────────────────────────────────────────────────────────────────────────
// Optimiseur mono-variable — Phase 7D
//
// Algorithme : recherche par section dorée (Golden Section Search, GSS).
//
// La section dorée réduit l'intervalle d'un facteur φ = (√5−1)/2 ≈ 0.618
// à chaque itération sans calcul de dérivée. Convergence garantie si f est
// unimodale sur [a, b].
//
// Complexité : O(log(1/ε)) évaluations de la fonction objectif.
//
// Référence : Kiefer (1953), Sequential minimax search for a maximum,
//             Proc. Amer. Math. Soc. 4(3), 502-506.
// ─────────────────────────────────────────────────────────────────────────────

import type { Scene } from './types.ts'
import { traceRay } from './tracer.ts'
import { collectSpots } from './spot-diagram.ts'
import { ImagePlane } from './elements/image-plane.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Paramètre à optimiser : propriété numérique d'un élément. */
export interface OptimizerParam {
  /** Identifiant de l'élément cible. */
  elementId: string
  /**
   * Nom de la propriété à modifier (ex: 'focalLength', 'R1', 'thickness').
   * Doit référencer un champ numérique mutable de l'élément.
   */
  property: string
  /** Borne inférieure de la recherche. */
  min: number
  /** Borne supérieure de la recherche. */
  max: number
}

/** Fonction métrique : retourne une valeur à minimiser pour la scène donnée. */
export type MetricFn = (scene: Scene) => number

/** Point d'une évaluation : (valeur du paramètre, valeur de la métrique). */
export interface EvalPoint {
  value:  number
  metric: number
}

/** Résultat d'une optimisation. */
export interface OptimizationResult {
  /** Valeur optimale du paramètre. */
  optimalValue: number
  /** Valeur minimale de la métrique atteinte. */
  optimalMetric: number
  /** Historique des évaluations (paramètre → métrique). Utile pour le tracé. */
  history: EvalPoint[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Golden Section Search
// ─────────────────────────────────────────────────────────────────────────────

/** Ratio de la section dorée : φ = (√5 − 1) / 2 ≈ 0.6180. */
const PHI = (Math.sqrt(5) - 1) / 2

/**
 * Recherche par section dorée d'un minimum dans [a, b].
 *
 * Hypothèse : f est unimodale (un seul minimum) sur [a, b].
 *
 * @param f       fonction à minimiser (coût d'une évaluation)
 * @param a       borne inférieure
 * @param b       borne supérieure
 * @param tol     tolérance sur l'intervalle (|b−a| < tol → arrêt)
 * @param maxIter nombre maximum d'itérations
 * @returns       { x: abscisse optimale, fx: valeur minimale }
 */
export function goldenSectionSearch(
  f: (x: number) => number,
  a: number,
  b: number,
  tol    = 1e-6,
  maxIter = 100,
): { x: number; fx: number } {
  let lo = a, hi = b
  // Points internes initiaux
  let x1 = hi - PHI * (hi - lo)
  let x2 = lo + PHI * (hi - lo)
  let f1 = f(x1)
  let f2 = f(x2)

  for (let iter = 0; iter < maxIter && hi - lo > tol; iter++) {
    if (f1 < f2) {
      hi = x2; x2 = x1; f2 = f1
      x1 = hi - PHI * (hi - lo); f1 = f(x1)
    } else {
      lo = x1; x1 = x2; f1 = f2
      x2 = lo + PHI * (hi - lo); f2 = f(x2)
    }
  }

  const xOpt = (lo + hi) / 2
  return { x: xOpt, fx: f1 < f2 ? f1 : f2 }
}

// ─────────────────────────────────────────────────────────────────────────────
// optimizeScene — optimiseur principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Optimise un paramètre de la scène en minimisant une métrique.
 *
 * **Stratégie de mutation directe** : modifie temporairement la propriété de
 * l'élément ciblé, évalue la métrique, puis restaure la valeur originale.
 * Cette approche synchrone évite la nécessité de cloner la scène.
 *
 * @param scene   scène à optimiser (modifiée temporairement, puis restaurée)
 * @param param   paramètre à varier
 * @param metric  fonction objectif (à minimiser)
 * @param options tolérance et nombre d'itérations
 */
export function optimizeScene(
  scene:   Scene,
  param:   OptimizerParam,
  metric:  MetricFn,
  options: { tolerance?: number; maxIterations?: number; scanPoints?: number } = {},
): OptimizationResult {
  const tol      = options.tolerance     ?? 1e-4
  const maxIter  = options.maxIterations ?? 80
  const scanPts  = options.scanPoints    ?? 0   // 0 = pas de balayage préliminaire

  const element = scene.elements.find(e => e.id === param.elementId)
  if (!element) {
    return { optimalValue: param.min, optimalMetric: Infinity, history: [] }
  }

  const obj = element as unknown as Record<string, unknown>
  const original = obj[param.property] as number
  if (typeof original !== 'number') {
    return { optimalValue: original, optimalMetric: Infinity, history: [] }
  }

  const history: EvalPoint[] = []

  // Fonction objectif avec mutation directe
  function evalAt(v: number): number {
    obj[param.property] = v
    const m = metric(scene)
    history.push({ value: v, metric: m })
    return m
  }

  try {
    // ── 1. Balayage préliminaire (optionnel) ───────────────────────────────
    // Si la fonction n'est pas unimodale, le balayage identifie le meilleur
    // sous-intervalle pour la recherche par section dorée.
    let searchMin = param.min
    let searchMax = param.max

    if (scanPts >= 3) {
      let bestV = param.min, bestM = Infinity
      for (let i = 0; i <= scanPts; i++) {
        const v = param.min + (param.max - param.min) * i / scanPts
        const m = evalAt(v)
        if (m < bestM) { bestM = m; bestV = v }
      }
      // Restreint la recherche GSS autour du meilleur point de balayage
      const width = (param.max - param.min) / scanPts
      searchMin = Math.max(param.min, bestV - width)
      searchMax = Math.min(param.max, bestV + width)
    }

    // ── 2. Recherche par section dorée ────────────────────────────────────
    const { x: xOpt } = goldenSectionSearch(evalAt, searchMin, searchMax, tol, maxIter)

    // Évalue au point optimal pour actualiser la métrique finale
    const mOpt = evalAt(xOpt)

    return {
      optimalValue:  xOpt,
      optimalMetric: mOpt,
      history,
    }
  } finally {
    // Toujours restaurer la valeur originale (même en cas d'exception)
    obj[param.property] = original
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// makeRmsMetric — métrique RMS spot size (cas d'usage principal)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construit une métrique RMS spot size pour un plan image donné.
 *
 * La métrique trace tous les rayons de la scène et mesure le rayon RMS
 * du spot sur le plan image `imagePlaneId`.
 *
 * @param imagePlaneId  identifiant du plan image (ImagePlane element)
 * @returns             fonction métrique (scene → rmsRadius en px)
 */
export function makeRmsMetric(imagePlaneId: string): MetricFn {
  return (scene: Scene): number => {
    const plane = scene.elements.find(e => e.id === imagePlaneId)
    if (!(plane instanceof ImagePlane)) return Infinity

    const results = scene.sources.flatMap(src =>
      src.generateRays().map(ray => traceRay(ray, scene))
    )

    const spot = collectSpots(plane, results)
    return spot.rmsRadius
  }
}
