// ─────────────────────────────────────────────────────────────────────────────
// Tableau de prescription optique — Phase 7D
//
// Génère un tableau au format standard (Zemax/Oslo) à partir d'une scène.
// Colonnes : Surface, Label, Rayon (R), Épaisseur, Matériau, nD, Abbe, R_semi, κ.
//
// Convention de signe :
//   R > 0 → surface convexe du côté de l'objet (centre à droite)
//   R < 0 → surface concave du côté de l'objet
//   R = Infinity → surface plate
//
// L'axe optique est supposé horizontal (direction +x).
// Les épaisseurs sont mesurées comme Δx entre vertices consécutifs.
//
// Référence : W. J. Smith, Modern Optical Engineering §2.
// ─────────────────────────────────────────────────────────────────────────────

import type { Scene } from './types.ts'
import { ThickLens } from './elements/thick-lens.ts'
import { ThinLens } from './elements/thin-lens.ts'
import { Block } from './elements/block.ts'
import { FlatMirror } from './elements/flat-mirror.ts'
import { CurvedMirror } from './elements/curved-mirror.ts'
import { ConicMirror } from './elements/conic-mirror.ts'
import { ApertureElement } from './elements/aperture.ts'
import { ImagePlane } from './elements/image-plane.ts'
import { getGlass, LAMBDA_F, LAMBDA_C } from './glass-catalog.ts'
import { MATERIALS, materialIndex, type MaterialId } from './dispersion.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces publiques
// ─────────────────────────────────────────────────────────────────────────────

export type SurfaceType = 'refract' | 'reflect' | 'stop' | 'image' | 'object'

export interface SurfaceRow {
  /** Numéro de surface (1-based). */
  index: number
  /** Étiquette de la surface (ex: 'L1-S1', 'Diaphragme', 'Image'). */
  label: string
  /** Identifiant de l'élément parent. */
  elementId: string
  /** Nature de la surface. */
  type: SurfaceType
  /**
   * Rayon de courbure (px ou mm selon scale).
   * Infinity = surface plane. Signe : positif si la normale pointe vers l'objet.
   */
  radius: number
  /**
   * Épaisseur = distance axiale vers la surface suivante (px ou mm).
   * Infinie sur la dernière surface.
   */
  thickness: number
  /** Nom du matériau après la surface ('AIR', 'MIRROR', ou nom du verre). */
  material: string
  /** Indice à la raie d (587.56 nm). NaN si miroir. */
  nD: number
  /** Numéro d'Abbe νD. null si inconnu ou miroir. */
  abbeNumber: number | null
  /** Demi-ouverture physique (px ou mm). */
  clearRadius: number
  /** Constante de conicité κ. 0 pour les surfaces sphériques ou plates. */
  kappa: number
}

export interface PrescriptionTable {
  rows: SurfaceRow[]
  /** Unité des distances : 'px' (scale = 1) ou 'mm'. */
  units: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — matériaux
// ─────────────────────────────────────────────────────────────────────────────

interface MatInfo {
  name: string
  nD: number
  abbeNumber: number | null
}

function matFromGlassId(glassId: string): MatInfo | null {
  const g = getGlass(glassId)
  if (!g) return null
  return { name: g.id, nD: g.nD, abbeNumber: g.abbeNumber }
}

function matFromMaterialId(id: MaterialId): MatInfo {
  const m = MATERIALS[id]
  const nD  = m.nD
  const nF  = materialIndex(id, LAMBDA_F)
  const nC  = materialIndex(id, LAMBDA_C)
  const abbe = (nD - 1) / (nF - nC)
  return { name: m.label, nD, abbeNumber: +abbe.toFixed(1) }
}

function matFromN(n: number): MatInfo {
  return { name: `n=${n.toFixed(4)}`, nD: n, abbeNumber: null }
}

function airMat(): MatInfo {
  return { name: 'AIR', nD: 1, abbeNumber: null }
}

function mirrorMat(): MatInfo {
  return { name: 'MIROIR', nD: NaN, abbeNumber: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — extraction des entrées de surface
// ─────────────────────────────────────────────────────────────────────────────

interface SurfaceEntry {
  /** Position axiale de ce vertex (px, axe global x). */
  x: number
  label: string
  elementId: string
  type: SurfaceType
  radius: number
  /** Matériau après cette surface. Null = air (calculé post-tri). */
  matAfter: MatInfo
  clearRadius: number
  kappa: number
}

function extractEntries(scene: Scene): SurfaceEntry[] {
  const entries: SurfaceEntry[] = []

  for (const el of scene.elements) {
    if (el instanceof ThickLens) {
      const v1 = el.vertex1()
      const v2 = el.vertex2()
      const mat = el.glassId
        ? (matFromGlassId(el.glassId) ?? matFromN(el.n))
        : el.material
          ? matFromMaterialId(el.material)
          : matFromN(el.n)
      // Convention prescription standard : R2_std = -R2 (ThickLens utilise R2 > 0 = convexe sortant)
      entries.push({
        x:          v1.x,
        label:      `${el.label}-S1`,
        elementId:  el.id,
        type:       'refract',
        radius:     el.R1,
        matAfter:   mat,
        clearRadius: el.halfHeight,
        kappa:      el.kappa1,
      })
      entries.push({
        x:          v2.x,
        label:      `${el.label}-S2`,
        elementId:  el.id,
        type:       'refract',
        radius:     -el.R2,   // convention optique standard
        matAfter:   airMat(),
        clearRadius: el.halfHeight,
        kappa:      el.kappa2,
      })

    } else if (el instanceof ThinLens) {
      entries.push({
        x:          el.position.x,
        label:      el.label,
        elementId:  el.id,
        type:       'refract',
        radius:     Infinity,   // lentille mince idéalisée
        matAfter:   airMat(),
        clearRadius: el.height / 2,
        kappa:      0,
      })

    } else if (el instanceof Block) {
      const hw = el.width / 2
      const mat = el.glassId
        ? (matFromGlassId(el.glassId) ?? matFromN(el.n))
        : el.material
          ? matFromMaterialId(el.material)
          : matFromN(el.n)
      entries.push({
        x:          el.position.x - hw,
        label:      `${el.label}-S1`,
        elementId:  el.id,
        type:       'refract',
        radius:     Infinity,
        matAfter:   mat,
        clearRadius: el.height / 2,
        kappa:      0,
      })
      entries.push({
        x:          el.position.x + hw,
        label:      `${el.label}-S2`,
        elementId:  el.id,
        type:       'refract',
        radius:     Infinity,
        matAfter:   airMat(),
        clearRadius: el.height / 2,
        kappa:      0,
      })

    } else if (el instanceof FlatMirror) {
      entries.push({
        x:          el.position.x,
        label:      el.label,
        elementId:  el.id,
        type:       'reflect',
        radius:     Infinity,
        matAfter:   mirrorMat(),
        clearRadius: el.length / 2,
        kappa:      0,
      })

    } else if (el instanceof CurvedMirror) {
      entries.push({
        x:          el.position.x,
        label:      el.label,
        elementId:  el.id,
        type:       'reflect',
        radius:     el.concave ? el.radius : -el.radius,
        matAfter:   mirrorMat(),
        clearRadius: el.radius * Math.sin(el.aperture),
        kappa:      0,
      })

    } else if (el instanceof ConicMirror) {
      entries.push({
        x:          el.position.x,
        label:      el.label,
        elementId:  el.id,
        type:       'reflect',
        radius:     el.R,
        matAfter:   mirrorMat(),
        clearRadius: el.halfHeight,
        kappa:      el.kappa,
      })

    } else if (el instanceof ApertureElement) {
      entries.push({
        x:          el.position.x,
        label:      el.label,
        elementId:  el.id,
        type:       'stop',
        radius:     Infinity,
        matAfter:   airMat(),
        clearRadius: el.clearRadius,
        kappa:      0,
      })

    } else if (el instanceof ImagePlane) {
      entries.push({
        x:          el.position.x,
        label:      el.label,
        elementId:  el.id,
        type:       'image',
        radius:     Infinity,
        matAfter:   airMat(),
        clearRadius: el.height,
        kappa:      0,
      })
    }
  }

  // Trie par position axiale croissante
  entries.sort((a, b) => a.x - b.x)
  return entries
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPrescription — point d'entrée principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construit le tableau de prescription à partir d'une scène.
 *
 * @param scene  la scène OptiSim
 * @param scale  mm/px (WorldUnits.scale) — si omis, distances en px
 */
export function buildPrescription(scene: Scene, scale = 1): PrescriptionTable {
  const entries = extractEntries(scene)
  const rows: SurfaceRow[] = []

  for (let i = 0; i < entries.length; i++) {
    const e    = entries[i]
    const next = entries[i + 1]
    // Épaisseur = distance axiale vers la prochaine surface (en unités display)
    const thicknessPx = next !== undefined ? next.x - e.x : Infinity
    const thickness   = thicknessPx === Infinity ? Infinity : thicknessPx * scale

    rows.push({
      index:       i + 1,
      label:       e.label,
      elementId:   e.elementId,
      type:        e.type,
      radius:      e.radius === Infinity ? Infinity : e.radius * scale,
      thickness,
      material:    e.matAfter.name,
      nD:          e.matAfter.nD,
      abbeNumber:  e.matAfter.abbeNumber,
      clearRadius: e.clearRadius * scale,
      kappa:       e.kappa,
    })
  }

  return { rows, units: scale === 1 ? 'px' : 'mm' }
}

// ─────────────────────────────────────────────────────────────────────────────
// prescriptionToCSV — export CSV
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exporte le tableau de prescription au format CSV (séparateur virgule, header FR).
 */
export function prescriptionToCSV(table: PrescriptionTable): string {
  const u = table.units
  const header = `Surface,Label,Rayon (${u}),Épaisseur (${u}),Matériau,nD,Abbe,R_semi (${u}),κ,Type\r\n`

  const rows = table.rows.map(r => {
    const fmt = (v: number, dec = 4) =>
      !isFinite(v) ? '∞' : v.toFixed(dec)

    return [
      r.index,
      `"${r.label}"`,
      fmt(r.radius, 4),
      fmt(r.thickness, 4),
      `"${r.material}"`,
      isNaN(r.nD) ? '' : r.nD.toFixed(5),
      r.abbeNumber !== null ? r.abbeNumber.toFixed(1) : '',
      fmt(r.clearRadius, 4),
      r.kappa.toFixed(4),
      r.type,
    ].join(',')
  }).join('\r\n')

  return header + rows
}
