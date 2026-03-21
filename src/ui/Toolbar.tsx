import './ui.css'
import type { Scene } from '../core/types.ts'
import { FlatMirror } from '../core/elements/flat-mirror.ts'
import { ThinLens } from '../core/elements/thin-lens.ts'
import { Block } from '../core/elements/block.ts'
import { Prism } from '../core/elements/prism.ts'
import { CurvedMirror } from '../core/elements/curved-mirror.ts'
import { ThickLens } from '../core/elements/thick-lens.ts'
import { ConicMirror } from '../core/elements/conic-mirror.ts'
import { GRINElement } from '../core/elements/grin-medium.ts'
import { ImagePlane } from '../core/elements/image-plane.ts'
import { ApertureElement } from '../core/elements/aperture.ts'
import { BeamSource } from '../core/sources/beam.ts'
import { PointSource } from '../core/sources/point-source.ts'
import { OpticalObject } from '../core/elements/optical-object.ts'
import { PRESETS } from './presets.ts'
import { downloadScene, loadSceneFromFile } from '../serialization/scene-serializer.ts'

interface Props {
  canvasW: number
  canvasH: number
  onAddToScene: (scene: Scene) => void
  onLoadPreset: (presetId: string) => void
  onSceneRef: () => Scene | null
  onSelectId: (id: string) => void
  onSceneLoaded: (scene: Scene) => void
  useMm: boolean
  onToggleMm: () => void
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}`
}

export function Toolbar({ canvasW, canvasH, onSceneRef, onAddToScene, onLoadPreset, onSelectId, onSceneLoaded, useMm, onToggleMm }: Props) {
  const cx = canvasW / 2
  const cy = canvasH / 2

  function add(makeEl: (scene: Scene) => string) {
    const scene = onSceneRef()
    if (!scene) return
    const id = makeEl(scene)
    onAddToScene(scene)
    onSelectId(id)
  }

  function addFlatMirror() {
    add(scene => {
      const id = uid('mirror')
      scene.elements.push(new FlatMirror({ id, position: { x: cx, y: cy }, angle: Math.PI / 4, length: 120 }))
      return id
    })
  }

  function addCurvedMirror() {
    add(scene => {
      const id = uid('cmirror')
      scene.elements.push(new CurvedMirror({ id, position: { x: cx, y: cy }, angle: Math.PI, radius: 200, aperture: 0.4 }))
      return id
    })
  }

  function addThinLens() {
    add(scene => {
      const id = uid('lens')
      scene.elements.push(new ThinLens({ id, position: { x: cx, y: cy }, angle: 0, focalLength: 120, height: 140 }))
      return id
    })
  }

  function addPrism() {
    add(scene => {
      const id = uid('prism')
      scene.elements.push(new Prism({ id, position: { x: cx, y: cy }, angle: Math.PI, size: 120, n: 1.5 }))
      return id
    })
  }

  function addThickLens() {
    add(scene => {
      const id = uid('thicklens')
      scene.elements.push(new ThickLens({ id, position: { x: cx, y: cy }, angle: 0, R1: 200, R2: 200, thickness: 30, halfHeight: 60, n: 1.5 }))
      return id
    })
  }

  function addConicMirror() {
    add(scene => {
      const id = uid('conic')
      scene.elements.push(new ConicMirror({ id, position: { x: cx, y: cy }, angle: Math.PI, R: 200, kappa: -1, halfHeight: 80 }))
      return id
    })
  }

  function addImagePlane() {
    add(scene => {
      const id = uid('imgplane')
      scene.elements.push(new ImagePlane({ id, position: { x: cx + 150, y: cy }, angle: 0, height: 120 }))
      return id
    })
  }

  function addGRIN() {
    add(scene => {
      const id = uid('grin')
      scene.elements.push(new GRINElement({
        id, position: { x: cx - 150, y: cy - 100 },
        width: 300, height: 200,
        profile: 'parabolic', n0: 1.5, alpha: 0.015,
      }))
      return id
    })
  }

  function addBlock() {
    add(scene => {
      const id = uid('block')
      scene.elements.push(new Block({ id, position: { x: cx, y: cy }, angle: 0, width: 80, height: 120, n: 1.5 }))
      return id
    })
  }

  function addAperture() {
    add(scene => {
      const id = uid('aperture')
      scene.elements.push(new ApertureElement({ id, position: { x: cx, y: cy }, angle: 0, diameter: 120, clearRadius: 30 }))
      return id
    })
  }

  function addOpticalObject() {
    add(scene => {
      const id = uid('object')
      scene.sources.push(new OpticalObject({ id, position: { x: cx - 200, y: cy }, angle: 0, mode: 'finite', height: 60, wavelengths: [486, 550, 656], numRays: 5 }))
      return id
    })
  }

  function addBeam() {
    add(scene => {
      const id = uid('beam')
      scene.sources.push(new BeamSource({ id, position: { x: cx - 200, y: cy }, angle: 0, wavelengths: [555], numRays: 3, width: 40 }))
      return id
    })
  }

  function addPointSrc() {
    add(scene => {
      const id = uid('point')
      scene.sources.push(new PointSource({ id, position: { x: cx - 120, y: cy }, angle: 0, wavelengths: [555], numRays: 9, spreadAngle: Math.PI / 3 }))
      return id
    })
  }

  return (
    <div className="toolbar">
      {/* Presets */}
      <span className="toolbar-label">Preset</span>
      <select
        className="preset-select"
        defaultValue=""
        onChange={e => { if (e.target.value) { onLoadPreset(e.target.value); e.target.value = '' } }}
      >
        <option value="" disabled>Choisir…</option>
        {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>

      <div className="toolbar-sep" />

      {/* Elements */}
      <span className="toolbar-label">Éléments</span>
      <button className="toolbar-btn" onClick={addFlatMirror} title="Miroir plan">⟋ Miroir plan</button>
      <button className="toolbar-btn" onClick={addCurvedMirror} title="Miroir courbe">⌒ Miroir courbe</button>
      <button className="toolbar-btn" onClick={addConicMirror} title="Miroir conique (parabolique, elliptique…)">⌓ Miroir conique</button>
      <button className="toolbar-btn" onClick={addThinLens} title="Lentille mince">⊕ Lentille</button>
      <button className="toolbar-btn" onClick={addThickLens} title="Lentille épaisse">⊙ Épaisse</button>
      <button className="toolbar-btn" onClick={addPrism} title="Prisme">△ Prisme</button>
      <button className="toolbar-btn" onClick={addBlock} title="Bloc réfractant">▭ Bloc</button>
      <button className="toolbar-btn" onClick={addGRIN} title="Milieu GRIN (gradient d'indice)">⬡ GRIN</button>
      <button className="toolbar-btn" onClick={addImagePlane} title="Plan image (spot diagram)">▦ Plan image</button>
      <button className="toolbar-btn" onClick={addAperture} title="Diaphragme / pupille d'ouverture">◎ Diaphragme</button>

      <div className="toolbar-sep" />

      {/* Sources */}
      <span className="toolbar-label">Sources</span>
      <button className="toolbar-btn" onClick={addBeam} title="Faisceau parallèle">⇒ Faisceau</button>
      <button className="toolbar-btn" onClick={addPointSrc} title="Source ponctuelle">✦ Point</button>
      <button className="toolbar-btn" onClick={addOpticalObject} title="Objet optique (flèche objet fini/infini)">↕ Objet</button>

      <div className="toolbar-sep" style={{ marginLeft: 'auto' }} />

      {/* Unités */}
      <button
        className="toolbar-btn"
        title="Basculer entre pixels et millimètres"
        onClick={onToggleMm}
        style={{ fontWeight: useMm ? 700 : 400, color: useMm ? '#60c8ff' : undefined }}
      >
        {useMm ? 'mm' : 'px'}
      </button>

      <div className="toolbar-sep" />

      {/* Fichier */}
      <button
        className="toolbar-btn"
        title="Sauvegarder la scène (.json)"
        onClick={() => { const s = onSceneRef(); if (s) downloadScene(s) }}
      >
        ↓ Sauvegarder
      </button>
      <button
        className="toolbar-btn"
        title="Charger une scène (.json)"
        onClick={() => loadSceneFromFile().then(onSceneLoaded).catch(console.error)}
      >
        ↑ Charger
      </button>
    </div>
  )
}
