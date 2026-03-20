// ─────────────────────────────────────────────────────────────────────────────
// Catalogue de verres optiques — Formule de Sellmeier
//
// Formule de Sellmeier :
//   n²(λ) = 1 + B₁λ²/(λ²-C₁) + B₂λ²/(λ²-C₂) + B₃λ²/(λ²-C₃)
//   λ exprimé en micromètres (µm) — ATTENTION : ne pas passer des nm directement
//
// Raies de Fraunhofer de référence :
//   λD = 589.3 nm  → nD  (raie du sodium, indice de référence)
//   λF = 486.1 nm  → nF  (raie bleue de l'hydrogène)
//   λC = 656.3 nm  → nC  (raie rouge de l'hydrogène)
//
// Numéro d'Abbe : νD = (nD − 1) / (nF − nC)
//   νD > 50 → crown (faible dispersion)
//   νD < 50 → flint (forte dispersion)
//
// Source des données : coefficients de Sellmeier publiés dans le catalogue
// Schott et sur refractiveindex.info (données publiques).
// ─────────────────────────────────────────────────────────────────────────────

// Raies spectrales de référence Schott (nm)
// Convention standard des catalogues optiques :
//   d : hélium d-line  (587.56 nm) ← référence nD et νD dans les catalogues Schott
//   F : hydrogène F-line (486.13 nm)
//   C : hydrogène C-line (656.27 nm)
export const LAMBDA_D = 587.56  // Hélium d-line (standard Schott)
export const LAMBDA_F = 486.13  // Hydrogène F-line
export const LAMBDA_C = 656.27  // Hydrogène C-line

export interface SellmeierCoeffs {
  readonly B1: number
  readonly B2: number
  readonly B3: number
  readonly C1: number  // µm²
  readonly C2: number  // µm²
  readonly C3: number  // µm²
}

export interface GlassData {
  readonly id: string         // ex: 'N-BK7'
  readonly catalog: string    // ex: 'SCHOTT'
  readonly name: string       // nom complet
  readonly sellmeier: SellmeierCoeffs
  readonly nD: number         // Indice à 589.3 nm (pré-calculé pour affichage)
  readonly abbeNumber: number // νD = (nD-1)/(nF-nC)
  readonly density?: number   // g/cm³
}

// ─────────────────────────────────────────────────────────────────────────────
// Formule de Sellmeier
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule l'indice de réfraction par la formule de Sellmeier.
 *
 * @param coeffs       — coefficients B1/B2/B3/C1/C2/C3 (C en µm²)
 * @param wavelengthNm — longueur d'onde en nanomètres (380–2500)
 * @returns indice de réfraction n (sans unité)
 */
export function sellmeierIndex(coeffs: SellmeierCoeffs, wavelengthNm: number): number {
  // Sellmeier : λ doit être en micromètres — conversion nm → µm
  const lm = wavelengthNm / 1000
  const l2 = lm * lm

  const n2 = 1
    + coeffs.B1 * l2 / (l2 - coeffs.C1)
    + coeffs.B2 * l2 / (l2 - coeffs.C2)
    + coeffs.B3 * l2 / (l2 - coeffs.C3)

  return Math.sqrt(Math.max(1, n2))
}

/**
 * Calcule le numéro d'Abbe : νD = (nD − 1) / (nF − nC)
 */
export function computeAbbeNumber(coeffs: SellmeierCoeffs): number {
  const nD = sellmeierIndex(coeffs, LAMBDA_D)
  const nF = sellmeierIndex(coeffs, LAMBDA_F)
  const nC = sellmeierIndex(coeffs, LAMBDA_C)
  return (nD - 1) / (nF - nC)
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue — ~25 verres Schott (lot prioritaire)
//
// Crowns : N-BK7, N-BK10, N-K5, N-SK2, N-SK4, N-SK16, N-BAK1, N-BAK4,
//          N-LAK9, N-LAK33B, N-PSK53A, N-FK5, N-FK51A, N-PK52A
// Flints  : N-SF4, N-SF5, N-SF6, N-SF11, N-SF57, N-F2,
//           N-BAF4, N-BAF10, N-BASF64, N-LASF9, N-LASF44
// Spéciaux : P-SF68, LITHOTEC-CAF2
// ─────────────────────────────────────────────────────────────────────────────

const _raw: Omit<GlassData, 'nD' | 'abbeNumber'>[] = [
  // ── Crowns ────────────────────────────────────────────────────────────────
  {
    id: 'N-BK7', catalog: 'SCHOTT', name: 'N-BK7 (Borosilicate Crown)',
    density: 2.51,
    sellmeier: { B1: 1.03961212, B2: 0.231792344, B3: 1.01046945,
                 C1: 0.00600069867, C2: 0.0200179144, C3: 103.560653 },
  },
  {
    id: 'N-BK10', catalog: 'SCHOTT', name: 'N-BK10 (Crown)',
    density: 2.57,
    sellmeier: { B1: 1.12365662, B2: 0.309276848, B3: 0.881511957,
                 C1: 0.00644742752, C2: 0.0222284402, C3: 107.297751 },
  },
  {
    id: 'N-K5', catalog: 'SCHOTT', name: 'N-K5 (Crown)',
    density: 2.59,
    sellmeier: { B1: 1.08511833, B2: 0.199630177, B3: 0.930756064,
                 C1: 0.00661099503, C2: 0.0241023975, C3: 111.885909 },
  },
  {
    id: 'N-SK2', catalog: 'SCHOTT', name: 'N-SK2 (Dense Crown)',
    density: 3.54,
    sellmeier: { B1: 1.28189012, B2: 0.257738258, B3: 0.96818604,
                 C1: 0.00727191556, C2: 0.0242823527, C3: 110.377773 },
  },
  {
    id: 'N-SK4', catalog: 'SCHOTT', name: 'N-SK4 (Dense Crown)',
    density: 3.44,
    sellmeier: { B1: 1.32814161, B2: 0.14722341, B3: 1.10837807,
                 C1: 0.00682708039, C2: 0.0222543918, C3: 108.859677 },
  },
  {
    id: 'N-SK16', catalog: 'SCHOTT', name: 'N-SK16 (Dense Crown)',
    density: 3.58,
    sellmeier: { B1: 1.34317774, B2: 0.241144399, B3: 0.994317969,
                 C1: 0.00704369960, C2: 0.0231430156, C3: 92.7508526 },
  },
  {
    id: 'N-BAK1', catalog: 'SCHOTT', name: 'N-BAK1 (Barium Crown)',
    density: 3.19,
    sellmeier: { B1: 1.12365662, B2: 0.309276848, B3: 0.881511957,
                 C1: 0.00644742752, C2: 0.0222284402, C3: 107.297751 },
  },
  {
    id: 'N-BAK4', catalog: 'SCHOTT', name: 'N-BAK4 (Barium Crown)',
    density: 3.05,
    sellmeier: { B1: 1.28834642, B2: 0.132817724, B3: 0.945395373,
                 C1: 0.00779980626, C2: 0.0315631177, C3: 105.965875 },
  },
  {
    id: 'N-LAK9', catalog: 'SCHOTT', name: 'N-LAK9 (Lanthanum Crown)',
    density: 3.52,
    sellmeier: { B1: 1.46231905, B2: 0.344399589, B3: 1.15508372,
                 C1: 0.00724270156, C2: 0.0243353131, C3: 85.4686868 },
  },
  {
    id: 'N-LAK33B', catalog: 'SCHOTT', name: 'N-LAK33B (Lanthanum Crown)',
    density: 4.21,
    sellmeier: { B1: 1.42288601, B2: 0.593661336, B3: 1.16605226,
                 C1: 0.00670283452, C2: 0.0212174524, C3: 107.615560 },
  },
  {
    id: 'N-PSK53A', catalog: 'SCHOTT', name: 'N-PSK53A (Short Flint Crown)',
    density: 2.70,
    sellmeier: { B1: 1.38121836, B2: 0.196745645, B3: 0.886089205,
                 C1: 0.00706416337, C2: 0.0233395269, C3: 97.4508265 },
  },
  {
    id: 'N-FK5', catalog: 'SCHOTT', name: 'N-FK5 (Fluoro Crown)',
    density: 2.47,
    sellmeier: { B1: 0.844309338, B2: 0.344147824, B3: 0.910790213,
                 C1: 0.00475111955, C2: 0.0149814849, C3: 97.8600293 },
  },
  {
    id: 'N-FK51A', catalog: 'SCHOTT', name: 'N-FK51A (Fluoro Crown)',
    density: 3.72,
    sellmeier: { B1: 0.971247817, B2: 0.216901417, B3: 0.904651666,
                 C1: 0.00472301995, C2: 0.0153575612, C3: 168.681330 },
  },
  {
    id: 'N-PK52A', catalog: 'SCHOTT', name: 'N-PK52A (Phosphate Crown)',
    density: 3.70,
    sellmeier: { B1: 1.02960700, B2: 0.188050600, B3: 0.736488165,
                 C1: 0.00516800155, C2: 0.0166658798, C3: 138.964129 },
  },
  // ── Flints ────────────────────────────────────────────────────────────────
  {
    id: 'N-SF4', catalog: 'SCHOTT', name: 'N-SF4 (Dense Flint)',
    density: 3.68,
    sellmeier: { B1: 1.61957826, B2: 0.339493189, B3: 1.81600155,
                 C1: 0.0125502104, C2: 0.0544559822, C3: 131.507555 },
  },
  {
    id: 'N-SF5', catalog: 'SCHOTT', name: 'N-SF5 (Dense Flint)',
    density: 3.52,
    sellmeier: { B1: 1.52481889, B2: 0.187085527, B3: 1.42729015,
                 C1: 0.011254756, C2: 0.0588995392, C3: 129.141675 },
  },
  {
    id: 'N-SF6', catalog: 'SCHOTT', name: 'N-SF6 (Dense Flint)',
    density: 3.37,
    sellmeier: { B1: 1.77931763, B2: 0.338149866, B3: 2.08734474,
                 C1: 0.0133714182, C2: 0.0617533621, C3: 174.017590 },
  },
  {
    id: 'N-SF11', catalog: 'SCHOTT', name: 'N-SF11 (Dense Flint)',
    density: 3.23,
    sellmeier: { B1: 1.73759695, B2: 0.313747346, B3: 1.89878101,
                 C1: 0.013188707, C2: 0.0623068142, C3: 155.236290 },
  },
  {
    id: 'N-SF57', catalog: 'SCHOTT', name: 'N-SF57 (Dense Flint)',
    density: 3.53,
    sellmeier: { B1: 1.87543831, B2: 0.37375749, B3: 2.30001797,
                 C1: 0.0141749518, C2: 0.0640509927, C3: 177.389795 },
  },
  {
    id: 'N-F2', catalog: 'SCHOTT', name: 'N-F2 (Flint)',
    density: 3.60,
    sellmeier: { B1: 1.39757037, B2: 0.159201403, B3: 1.26865430,
                 C1: 0.00995906143, C2: 0.0546931752, C3: 119.248346 },
  },
  {
    id: 'N-BAF4', catalog: 'SCHOTT', name: 'N-BAF4 (Barium Flint)',
    density: 3.17,
    sellmeier: { B1: 1.42894540, B2: 0.0922085011, B3: 1.15637755,
                 C1: 0.00898012780, C2: 0.0361621055, C3: 112.369239 },
  },
  {
    id: 'N-BAF10', catalog: 'SCHOTT', name: 'N-BAF10 (Barium Flint)',
    density: 3.76,
    sellmeier: { B1: 1.58514950, B2: 0.143559385, B3: 1.08521269,
                 C1: 0.00926681282, C2: 0.0424489805, C3: 105.613573 },
  },
  {
    id: 'N-BASF64', catalog: 'SCHOTT', name: 'N-BASF64 (Dense Barium Flint)',
    density: 3.70,
    sellmeier: { B1: 1.65554268, B2: 0.171079428, B3: 1.33867403,
                 C1: 0.0105011995, C2: 0.0495145076, C3: 116.600738 },
  },
  {
    id: 'N-LASF9', catalog: 'SCHOTT', name: 'N-LASF9 (Lanthanum Dense Flint)',
    density: 4.44,
    sellmeier: { B1: 2.00029547, B2: 0.298926886, B3: 1.80691843,
                 C1: 0.0121426017, C2: 0.0538736236, C3: 156.530829 },
  },
  {
    id: 'N-LASF44', catalog: 'SCHOTT', name: 'N-LASF44 (Lanthanum Dense Flint)',
    density: 4.65,
    sellmeier: { B1: 1.78897105, B2: 0.38675672, B3: 1.30506243,
                 C1: 0.00872506277, C2: 0.0308085023, C3: 92.7743824 },
  },
  // ── Spéciaux ─────────────────────────────────────────────────────────────
  {
    id: 'P-SF68', catalog: 'SCHOTT', name: 'P-SF68 (High Dispersion)',
    density: 6.19,
    sellmeier: { B1: 2.3330067, B2: 0.452961396, B3: 1.25172339,
                 C1: 0.0168838419, C2: 0.0710565699, C3: 153.854346 },
  },
  {
    // Coefficients de Malitson (1963) pour CaF2.
    // C_i = λ_i² (µm²) avec λ_i en µm :
    //   C1 = 0.050263605² = 0.0025264, C2 = 0.1291521² = 0.016680,
    //   C3 = 34.6491042²  = 1200.559
    id: 'LITHOTEC-CAF2', catalog: 'LITHOTEC', name: 'CAF2 (Calcium Fluoride)',
    density: 3.18,
    sellmeier: { B1: 0.5675888, B2: 0.4710914, B3: 3.8484723,
                 C1: 0.0025264428, C2: 0.016680259, C3: 1200.559 },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Construction du catalogue avec nD et νD pré-calculés
// ─────────────────────────────────────────────────────────────────────────────

export const GLASS_CATALOG: readonly GlassData[] = _raw.map(g => ({
  ...g,
  nD: sellmeierIndex(g.sellmeier, LAMBDA_D),
  abbeNumber: computeAbbeNumber(g.sellmeier),
}))

/** Map id → GlassData pour accès O(1). */
const _catalogById = new Map<string, GlassData>(GLASS_CATALOG.map(g => [g.id, g]))

/**
 * Retourne les données d'un verre par son identifiant.
 * Retourne undefined si le verre n'existe pas.
 */
export function getGlass(id: string): GlassData | undefined {
  return _catalogById.get(id)
}

/**
 * Calcule l'indice de réfraction d'un verre du catalogue à la longueur d'onde donnée.
 *
 * @param id           — identifiant du verre (ex: 'N-BK7')
 * @param wavelengthNm — longueur d'onde en nm
 * @returns indice, ou undefined si le verre n'existe pas
 */
export function glassIndex(id: string, wavelengthNm: number): number | undefined {
  const glass = _catalogById.get(id)
  if (!glass) return undefined
  return sellmeierIndex(glass.sellmeier, wavelengthNm)
}

/**
 * Cherche des verres par sous-chaîne (id ou nom complet).
 * Insensible à la casse.
 */
export function searchGlasses(query: string): readonly GlassData[] {
  const q = query.toLowerCase()
  return GLASS_CATALOG.filter(g =>
    g.id.toLowerCase().includes(q) || g.name.toLowerCase().includes(q)
  )
}
