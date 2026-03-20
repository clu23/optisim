// ─────────────────────────────────────────────────────────────────────────────
// Coefficients de Fresnel — Phase 5
//
// Convention d'entrée :
//   n1  : indice du milieu incident (≥ 1)
//   n2  : indice du milieu réfracté (≥ 1)
//   cosI: cosinus de l'angle d'incidence (∈ [0, 1])
//
// Formules (polarisation s = TE, p = TM) :
//   cosT = √(1 − (n1/n2)²·sin²I)          (sin²I = 1 − cosI²)
//
//   rs = (n1·cosI − n2·cosT) / (n1·cosI + n2·cosT)
//   rp = (n2·cosI − n1·cosT) / (n2·cosI + n1·cosT)
//
//   Rs = rs²,  Rp = rp²          (réflectances en énergie)
//   Ts = 1 − Rs, Tp = 1 − Rp    (transmittances en énergie)
//
// Cas TIR (sin²T > 1) : Rs = Rp = 1, Ts = Tp = 0.
//
// Angle de Brewster : rp = 0 ↔ n2·cosI = n1·cosT ↔ θ_B = arctan(n2/n1).
// ─────────────────────────────────────────────────────────────────────────────

/** Résultat complet du calcul de Fresnel. */
export interface FresnelResult {
  /** Réflectance polarisation s (TE). */
  Rs: number
  /** Réflectance polarisation p (TM). */
  Rp: number
  /** Réflectance lumière non polarisée : (Rs + Rp) / 2. */
  Runpol: number
  /** Transmittance polarisation s : 1 − Rs. */
  Ts: number
  /** Transmittance polarisation p : 1 − Rp. */
  Tp: number
  /** Transmittance lumière non polarisée : 1 − Runpol. */
  Tunpol: number
}

/**
 * Calcule les coefficients de Fresnel exacts.
 *
 * @param n1   Indice incident (milieu d'origine du rayon)
 * @param n2   Indice réfracté (milieu de destination)
 * @param cosI Cosinus de l'angle d'incidence ∈ [0, 1]
 */
export function fresnelCoefficients(n1: number, n2: number, cosI: number): FresnelResult {
  // Clamp numérique
  const cI = Math.min(1, Math.max(0, cosI))

  const sinI2 = 1 - cI * cI
  const ratio  = n1 / n2
  const sinT2  = ratio * ratio * sinI2

  // Réflexion totale interne
  if (sinT2 >= 1) {
    return { Rs: 1, Rp: 1, Runpol: 1, Ts: 0, Tp: 0, Tunpol: 0 }
  }

  const cosT = Math.sqrt(1 - sinT2)

  // Amplitudes de Fresnel
  const n1cI = n1 * cI,  n2cT = n2 * cosT
  const n2cI = n2 * cI,  n1cT = n1 * cosT

  const rs = (n1cI - n2cT) / (n1cI + n2cT)
  const rp = (n2cI - n1cT) / (n2cI + n1cT)

  const Rs = rs * rs
  const Rp = rp * rp
  const Runpol = (Rs + Rp) * 0.5

  return { Rs, Rp, Runpol, Ts: 1 - Rs, Tp: 1 - Rp, Tunpol: 1 - Runpol }
}

/**
 * Réflectance scalaire pour une polarisation donnée.
 * Utilisé dans le traceur pour atténuer l'intensité du rayon transmis.
 */
export function fresnelReflectance(
  n1: number,
  n2: number,
  cosI: number,
  polarization: 's' | 'p' | 'unpolarized' = 'unpolarized',
): number {
  const f = fresnelCoefficients(n1, n2, cosI)
  if (polarization === 's') return f.Rs
  if (polarization === 'p') return f.Rp
  return f.Runpol
}

/**
 * Transmittance scalaire (1 − R) pour une polarisation donnée.
 */
export function fresnelTransmittance(
  n1: number,
  n2: number,
  cosI: number,
  polarization: 's' | 'p' | 'unpolarized' = 'unpolarized',
): number {
  return 1 - fresnelReflectance(n1, n2, cosI, polarization)
}

/**
 * Angle de Brewster θ_B = arctan(n2 / n1) en radians.
 * À cet angle, Rp = 0 : la polarisation p est intégralement transmise.
 */
export function brewsterAngle(n1: number, n2: number): number {
  return Math.atan2(n2, n1)
}
