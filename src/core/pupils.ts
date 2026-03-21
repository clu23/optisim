import type { Scene, Vec2 } from './types.ts'
import type { ApertureElement } from './elements/aperture.ts'
import { computeImage, computeEFL } from './image-calculator.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Pupils — Phase 7C
//
// Calcule les pupilles d'entrée/sortie, f/N et l'ouverture numérique (NA)
// du système optique.
//
// Modèle simplifié (phase 7C) :
//   — Pupille d'entrée (EP) : image du diaphragme à travers les éléments
//     situés à sa GAUCHE. Si aucun élément à gauche → EP ≈ diaphragme lui-même.
//   — Pupille de sortie (XP) : image du diaphragme à travers les éléments
//     situés à sa DROITE (tracer en sens inverse). Approche symétrique.
//   — f/N = EFL / (2 × R_EP)   (f-number)
//   — NA  = n × sin(u_max)  où u_max = R_EP / |objectDistance| (objet fini)
//            ou  NA = R_EP / EFL  (objet à l'infini, espace image)
// ─────────────────────────────────────────────────────────────────────────────

export interface PupilResult {
  /** Position axiale de la pupille d'entrée (px). */
  entrancePupilX:      number
  /** Rayon de la pupille d'entrée (px). */
  entrancePupilRadius: number
  /** Position axiale de la pupille de sortie (px). */
  exitPupilX:          number
  /** Rayon de la pupille de sortie (px). */
  exitPupilRadius:     number
  /** f-Number = EFL / (2 × R_EP). null si EFL non calculable. */
  fNumber:             number | null
  /** Ouverture numérique côté image. */
  NA:                  number | null
  /** Longueur focale effective (px). */
  efl:                 number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Duck-type check : est-ce un ApertureElement ? */
function isAperture(el: unknown): el is ApertureElement {
  return (
    typeof el === 'object' && el !== null &&
    (el as { type?: unknown }).type === 'aperture' &&
    'clearRadius' in (el as object)
  )
}

/** Trouve le premier ApertureElement de la scène (le plus à gauche en x). */
function findApertureStop(scene: Scene): ApertureElement | null {
  let stop: ApertureElement | null = null
  for (const el of scene.elements) {
    if (isAperture(el)) {
      if (stop === null || el.position.x < stop.position.x) stop = el
    }
  }
  return stop
}

// ─────────────────────────────────────────────────────────────────────────────
// computePupils
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule les pupilles d'entrée/sortie et les métriques associées.
 *
 * @param scene        Scène optique.
 * @param objectX      Position x de l'objet (px). Utilisé pour NA.
 * @param wavelength   Longueur d'onde de référence (nm). Défaut : 550.
 */
export function computePupils(
  scene:       Scene,
  objectX      = -500,
  wavelength   = 550,
): PupilResult {
  const stop = findApertureStop(scene)

  // ── Position et rayon du diaphragme ────────────────────────────────────────
  const stopX = stop?.position.x ?? 0
  const stopR = stop?.clearRadius ?? 50

  // ── Pupille d'entrée : image du diaphragme par les éléments à sa gauche ────
  // Approximation : si pas d'élément optique entre objet et diaphragme,
  // EP ≈ diaphragme lui-même.
  const elementsLeftOfStop = scene.elements.filter(el =>
    !isAperture(el) && el.position.x < stopX,
  )

  let epX = stopX
  let epR = stopR

  if (elementsLeftOfStop.length > 0) {
    // Tracer l'image du bord de diaphragme à travers les éléments à gauche.
    // On crée une mini-scène avec seulement ces éléments.
    const miniScene = { ...scene, elements: elementsLeftOfStop, sources: [] }
    const img = computeImage(miniScene, stopX, stopR, wavelength, stopR * 0.1)
    if (img.imageX !== null && img.imageY !== null) {
      epX = img.imageX
      epR = Math.abs(img.imageY)
    }
  }

  // ── Pupille de sortie : image du diaphragme par les éléments à sa droite ───
  const elementsRightOfStop = scene.elements.filter(el =>
    !isAperture(el) && el.position.x > stopX,
  )

  let xpX = stopX
  let xpR = stopR

  if (elementsRightOfStop.length > 0) {
    const miniScene = { ...scene, elements: elementsRightOfStop, sources: [] }
    const img = computeImage(miniScene, stopX, stopR, wavelength, stopR * 0.1)
    if (img.imageX !== null && img.imageY !== null) {
      xpX = img.imageX
      xpR = Math.abs(img.imageY)
    }
  }

  // ── EFL du système complet ──────────────────────────────────────────────────
  const efl = computeEFL(scene, wavelength, objectX - 100, stopR * 0.1)

  // ── f/N ────────────────────────────────────────────────────────────────────
  const fNumber = (efl !== null && epR > 0)
    ? Math.abs(efl) / (2 * epR)
    : null

  // ── NA (côté image) ────────────────────────────────────────────────────────
  // Pour objet fini : NA_image = n × sin(u) ≈ xpR / |imageDistance|
  // Approximation : imageDistance ≈ EFL (objet à grande distance)
  const NA = (efl !== null && xpR > 0)
    ? xpR / Math.sqrt(xpR * xpR + efl * efl)
    : null

  return {
    entrancePupilX:      epX,
    entrancePupilRadius: epR,
    exitPupilX:          xpX,
    exitPupilRadius:     xpR,
    fNumber,
    NA,
    efl,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports utilitaires
// ─────────────────────────────────────────────────────────────────────────────

export { findApertureStop }
export type { Vec2 }
