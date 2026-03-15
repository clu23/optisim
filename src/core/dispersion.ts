// ─────────────────────────────────────────────────────────────────────────────
// Dispersion chromatique — Loi de Cauchy
//
// Loi de Cauchy : n(λ) = A + B/λ² + C/λ⁴
//   λ exprimé en micromètres (µm) — ATTENTION : ne pas passer des nm directement
//
// Référence spectrale : domaine visible 380–780 nm
// ─────────────────────────────────────────────────────────────────────────────

export interface CauchyCoeffs {
  readonly A: number
  readonly B: number
  readonly C: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Base de données de matériaux
// Coefficients de Cauchy (A, B, C) pour λ en µm
// Valeur n_D (raie de sodium 589 nm) donnée à titre indicatif
// ─────────────────────────────────────────────────────────────────────────────

// Coefficients ajustés par fit exact sur 3 raies de Fraunhofer (λF=486.1 nm, λD=589.3 nm, λC=656.3 nm).
// nD = n(589.3 nm) calculé par Cauchy — correspond aux valeurs Schott/référence à ±0.0001.
export const MATERIALS = {
  'BK7':     { A: 1.5027061, B:  0.0054074, C: -0.0001781, label: 'BK7 (crown)',  nD: 1.5168 },
  'SF11':    { A: 1.7713626, B: -0.0031842, C:  0.0027143, label: 'SF11 (flint)', nD: 1.7847 },
  'water':   { A: 1.3232871, B:  0.0035551, C: -0.0000632, label: 'Eau',          nD: 1.3330 },
  'diamond': { A: 2.3769212, B:  0.0146750, C: -0.0002025, label: 'Diamant',      nD: 2.4175 },
} as const satisfies Record<string, CauchyCoeffs & { label: string; nD: number }>

export type MaterialId = keyof typeof MATERIALS

// ─────────────────────────────────────────────────────────────────────────────
// Fonctions de calcul
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule l'indice de réfraction par la loi de Cauchy.
 *
 * @param coeffs      — coefficients A, B, C (λ en µm)
 * @param wavelengthNm — longueur d'onde en nanomètres (380–780)
 * @returns indice de réfraction n (sans unité)
 */
export function cauchyIndex(coeffs: CauchyCoeffs, wavelengthNm: number): number {
  // Cauchy : λ doit être en micromètres — conversion nm → µm
  const lm = wavelengthNm / 1000
  const l2 = lm * lm
  return coeffs.A + coeffs.B / l2 + coeffs.C / (l2 * l2)
}

/**
 * Retourne l'indice de réfraction d'un matériau catalogué à la longueur
 * d'onde donnée (loi de Cauchy).
 *
 * @param id           — identifiant dans MATERIALS
 * @param wavelengthNm — longueur d'onde en nm
 */
export function materialIndex(id: MaterialId, wavelengthNm: number): number {
  return cauchyIndex(MATERIALS[id], wavelengthNm)
}

/**
 * Indice de référence du matériau à 550 nm (vert, milieu du visible).
 * Utile pour l'affichage et les approximations monochromatiques.
 */
export function referenceIndex(id: MaterialId): number {
  return materialIndex(id, 550)
}
