import type { Scene } from '../core/types.ts'
import type { MaterialId } from '../core/dispersion.ts'
import { FlatMirror } from '../core/elements/flat-mirror.ts'
import { ThinLens } from '../core/elements/thin-lens.ts'
import { Block } from '../core/elements/block.ts'
import { Prism } from '../core/elements/prism.ts'
import { CurvedMirror } from '../core/elements/curved-mirror.ts'
import { ThickLens } from '../core/elements/thick-lens.ts'
import { ConicMirror } from '../core/elements/conic-mirror.ts'
import { GRINElement, type GRINProfile } from '../core/elements/grin-medium.ts'
import { BeamSource } from '../core/sources/beam.ts'
import { PointSource } from '../core/sources/point-source.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Format JSON de la scène
// ─────────────────────────────────────────────────────────────────────────────

export const SCENE_FORMAT_VERSION = 1

export interface SceneJSON {
  version: number
  metadata: { name: string; description?: string }
  elements: ElementJSON[]
  sources: SourceJSON[]
}

type ElementJSON =
  | { type: 'flat-mirror';    id: string; label: string; position: { x: number; y: number }; angle: number; length: number }
  | { type: 'thin-lens';      id: string; label: string; position: { x: number; y: number }; angle: number; focalLength: number; height: number }
  | { type: 'block';          id: string; label: string; position: { x: number; y: number }; angle: number; width: number; height: number; n: number; material?: MaterialId }
  | { type: 'prism';          id: string; label: string; position: { x: number; y: number }; angle: number; size: number; apexAngle?: number; n: number; material?: MaterialId }
  | { type: 'curved-mirror';  id: string; label: string; position: { x: number; y: number }; angle: number; radius: number; aperture: number; concave: boolean }
  | { type: 'thick-lens';    id: string; label: string; position: { x: number; y: number }; angle: number; R1: number; R2: number; kappa1: number; kappa2: number; thickness: number; halfHeight: number; n: number; material?: MaterialId }
  | { type: 'conic-mirror'; id: string; label: string; position: { x: number; y: number }; angle: number; R: number; kappa: number; halfHeight: number }
  | { type: 'grin'; id: string; label: string; position: { x: number; y: number }; angle: number; width: number; height: number; profile: GRINProfile; n0: number; alpha: number; alpha2?: number }

type SourceJSON =
  | { type: 'beam';  id: string; position: { x: number; y: number }; angle: number; wavelengths: number[]; numRays: number; width: number }
  | { type: 'point'; id: string; position: { x: number; y: number }; angle: number; wavelengths: number[]; numRays: number; spreadAngle: number }

// ─────────────────────────────────────────────────────────────────────────────
// Serialize
// ─────────────────────────────────────────────────────────────────────────────

export function serializeScene(scene: Scene): SceneJSON {
  const elements: ElementJSON[] = scene.elements.map(el => {
    if (el instanceof FlatMirror) {
      return { type: 'flat-mirror', id: el.id, label: el.label, position: el.position, angle: el.angle, length: el.length }
    }
    if (el instanceof ThinLens) {
      return { type: 'thin-lens', id: el.id, label: el.label, position: el.position, angle: el.angle, focalLength: el.focalLength, height: el.height }
    }
    if (el instanceof Block) {
      return { type: 'block', id: el.id, label: el.label, position: el.position, angle: el.angle, width: el.width, height: el.height, n: el.n, ...(el.material && { material: el.material }) }
    }
    if (el instanceof Prism) {
      return { type: 'prism', id: el.id, label: el.label, position: el.position, angle: el.angle, size: el.size, apexAngle: el.apexAngle, n: el.n, ...(el.material && { material: el.material }) }
    }
    if (el instanceof CurvedMirror) {
      return { type: 'curved-mirror', id: el.id, label: el.label, position: el.position, angle: el.angle, radius: el.radius, aperture: el.aperture, concave: el.concave }
    }
    if (el instanceof ThickLens) {
      return { type: 'thick-lens', id: el.id, label: el.label, position: el.position, angle: el.angle, R1: el.R1, R2: el.R2, kappa1: el.kappa1, kappa2: el.kappa2, thickness: el.thickness, halfHeight: el.halfHeight, n: el.n, ...(el.material && { material: el.material }) }
    }
    if (el instanceof ConicMirror) {
      return { type: 'conic-mirror', id: el.id, label: el.label, position: el.position, angle: el.angle, R: el.R, kappa: el.kappa, halfHeight: el.halfHeight }
    }
    if (el instanceof GRINElement) {
      return { type: 'grin', id: el.id, label: el.label, position: el.position, angle: el.angle, width: el.width, height: el.height, profile: el.profile, n0: el.n0, alpha: el.alpha, ...(el.alpha2 !== 0 && { alpha2: el.alpha2 }) }
    }
    throw new Error(`serializeScene: type d'élément inconnu "${el.type}"`)
  })

  const sources: SourceJSON[] = scene.sources.map(src => {
    if (src instanceof BeamSource) {
      return { type: 'beam', id: src.id, position: src.position, angle: src.angle, wavelengths: src.wavelengths, numRays: src.numRays, width: src.width }
    }
    if (src instanceof PointSource) {
      return { type: 'point', id: src.id, position: src.position, angle: src.angle, wavelengths: src.wavelengths, numRays: src.numRays, spreadAngle: src.spreadAngle }
    }
    throw new Error(`serializeScene: type de source inconnu "${src.type}"`)
  })

  return { version: SCENE_FORMAT_VERSION, metadata: { ...scene.metadata }, elements, sources }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deserialize
// ─────────────────────────────────────────────────────────────────────────────

export function deserializeScene(json: SceneJSON): Scene {
  if (json.version !== SCENE_FORMAT_VERSION) {
    throw new Error(`deserializeScene: version ${json.version} non supportée (attendu ${SCENE_FORMAT_VERSION})`)
  }

  const elements = json.elements.map(el => {
    switch (el.type) {
      case 'flat-mirror':   return new FlatMirror(el)
      case 'thin-lens':     return new ThinLens(el)
      case 'block':         return new Block({ ...el, material: el.material })
      case 'prism':         return new Prism({ ...el, apexAngle: el.apexAngle, material: el.material })
      case 'curved-mirror': return new CurvedMirror(el)
      case 'thick-lens':    return new ThickLens(el)
      case 'conic-mirror':  return new ConicMirror(el)
      case 'grin':          return new GRINElement({ ...el, alpha2: el.alpha2 ?? 0 })
      default: throw new Error(`deserializeScene: type d'élément inconnu "${(el as { type: string }).type}"`)
    }
  })

  const sources = json.sources.map(src => {
    switch (src.type) {
      case 'beam':  return new BeamSource(src)
      case 'point': return new PointSource(src)
      default: throw new Error(`deserializeScene: type de source inconnu "${(src as { type: string }).type}"`)
    }
  })

  return { elements, sources, metadata: { ...json.metadata } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers Browser (download + upload)
// ─────────────────────────────────────────────────────────────────────────────

export function downloadScene(scene: Scene): void {
  const json = serializeScene(scene)
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const name = (scene.metadata.name || 'scene').replace(/[^a-z0-9_\-]/gi, '_').toLowerCase()
  a.href     = url
  a.download = `${name}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function loadSceneFromFile(): Promise<Scene> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type  = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { reject(new Error('Aucun fichier sélectionné')); return }
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result as string) as SceneJSON
          resolve(deserializeScene(json))
        } catch (e) {
          reject(e)
        }
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    }
    input.click()
  })
}
