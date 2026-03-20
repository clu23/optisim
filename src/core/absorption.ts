// ─────────────────────────────────────────────────────────────────────────────
// Absorption — Loi de Beer-Lambert (Phase 6)
//
// I(s) = I₀ × exp(−α × s)
//
//   α : coefficient d'absorption linéaire (px⁻¹).
//       0     = milieu transparent (pas d'absorption)
//       0.001 = atténuation d'environ 10% sur 105 px
//       0.01  = atténuation de 63% sur 100 px
//   s : distance parcourue dans le milieu absorbant (px)
//
// Référence : Beer-Lambert-Bouguer law (Born & Wolf §1.5).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intensité transmise après propagation dans un milieu absorbant.
 *
 * @param intensity       Intensité incidente (0–1)
 * @param absorptionCoeff Coefficient α en px⁻¹ (≥ 0 ; 0 = transparent)
 * @param distance        Distance parcourue dans le milieu (px)
 */
export function beerLambert(
  intensity: number,
  absorptionCoeff: number,
  distance: number,
): number {
  if (absorptionCoeff <= 0 || distance <= 0) return intensity
  return intensity * Math.exp(-absorptionCoeff * distance)
}

/**
 * Extrait le coefficient d'absorption d'un élément optique par duck typing.
 * Retourne 0 si l'élément ne définit pas `absorptionCoeff`.
 */
export function getAbsorptionCoeff(element: object): number {
  if (
    'absorptionCoeff' in element &&
    typeof (element as Record<string, unknown>).absorptionCoeff === 'number'
  ) {
    return Math.max(0, (element as Record<string, unknown>).absorptionCoeff as number)
  }
  return 0
}
