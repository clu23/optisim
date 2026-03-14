import './ui.css'
import type { Scene, OpticalElement, LightSource } from '../core/types.ts'
import { FlatMirror } from '../core/elements/flat-mirror.ts'
import { ThinLens } from '../core/elements/thin-lens.ts'
import { Block } from '../core/elements/block.ts'
import { Prism } from '../core/elements/prism.ts'
import { CurvedMirror } from '../core/elements/curved-mirror.ts'
import { BeamSource } from '../core/sources/beam.ts'
import { PointSource } from '../core/sources/point-source.ts'
import { wavelengthToColor } from '../renderer/canvas-renderer.ts'

// ─────────────────────────────────────────────────────────────────────────────

const RAD = 180 / Math.PI
const DEG = Math.PI / 180
const SPECTRUM = [405, 445, 480, 515, 555, 590, 630, 670, 700]

interface Props {
  scene: Scene | null
  selectedId: string | null
  onUpdate: () => void
  onDelete: (id: string) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Slider helper
// ─────────────────────────────────────────────────────────────────────────────

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  digits?: number
  onChange: (v: number) => void
}

function Slider({ label, value, min, max, step, unit = '', digits = 1, onChange }: SliderProps) {
  return (
    <div className="prop-row">
      <div className="prop-header">
        <span className="prop-label">{label}</span>
        <span className="prop-value">{value.toFixed(digits)}{unit}</span>
      </div>
      <input
        type="range"
        className="prop-slider"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Wavelength picker
// ─────────────────────────────────────────────────────────────────────────────

function WavelengthPicker({ wavelengths, onChange }: { wavelengths: number[]; onChange: (wl: number[]) => void }) {
  function toggle(wl: number) {
    const next = wavelengths.includes(wl)
      ? wavelengths.filter(w => w !== wl)
      : [...wavelengths, wl].sort((a, b) => a - b)
    if (next.length > 0) onChange(next)  // must keep ≥ 1
  }

  return (
    <div className="prop-row">
      <span className="prop-label">Longueurs d'onde</span>
      <div className="wl-grid">
        {SPECTRUM.map(wl => {
          const active = wavelengths.includes(wl)
          const color = wavelengthToColor(wl, 1)
          return (
            <button
              key={wl}
              className={`wl-chip${active ? '' : ' off'}`}
              style={{ borderColor: color, background: active ? `${color.replace('rgba', 'rgba').replace(', 1)', ', 0.25)')}` : 'transparent' }}
              onClick={() => toggle(wl)}
              title={`${wl} nm`}
            >
              {wl}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Element-specific panels
// ─────────────────────────────────────────────────────────────────────────────

function FlatMirrorPanel({ el, onUpdate }: { el: FlatMirror; onUpdate: () => void }) {
  function set<K extends 'angle' | 'length'>(key: K, v: number) {
    if (key === 'angle') el.angle = v * DEG
    else el.length = v
    onUpdate()
  }
  return <>
    <Slider label="Angle" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°" onChange={v => set('angle', v)} />
    <Slider label="Longueur" value={el.length} min={20} max={600} step={1} unit=" px" digits={0} onChange={v => set('length', v)} />
  </>
}

function ThinLensPanel({ el, onUpdate }: { el: ThinLens; onUpdate: () => void }) {
  return <>
    <Slider label="Angle axe" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { el.angle = v * DEG; onUpdate() }} />
    <Slider label="Focale f" value={el.focalLength} min={-500} max={500} step={1} unit=" px" digits={0}
      onChange={v => { if (v === 0) return; el.focalLength = v; onUpdate() }} />
    <Slider label="Ouverture" value={el.height} min={20} max={400} step={1} unit=" px" digits={0}
      onChange={v => { el.height = v; onUpdate() }} />
    <div className="prop-row">
      <div className="prop-header">
        <span className="prop-label">Type</span>
        <span className="prop-value" style={{ color: el.focalLength > 0 ? '#60ff90' : '#ff8060' }}>
          {el.focalLength > 0 ? 'Convergente' : 'Divergente'}
        </span>
      </div>
    </div>
  </>
}

function BlockPanel({ el, onUpdate }: { el: Block; onUpdate: () => void }) {
  return <>
    <Slider label="Angle" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { el.angle = v * DEG; onUpdate() }} />
    <Slider label="Largeur" value={el.width} min={10} max={400} step={1} unit=" px" digits={0}
      onChange={v => { el.width = v; onUpdate() }} />
    <Slider label="Hauteur" value={el.height} min={10} max={400} step={1} unit=" px" digits={0}
      onChange={v => { el.height = v; onUpdate() }} />
    <Slider label="Indice n" value={el.n} min={1.0} max={2.5} step={0.01} digits={2}
      onChange={v => { el.n = v; onUpdate() }} />
  </>
}

function PrismPanel({ el, onUpdate }: { el: Prism; onUpdate: () => void }) {
  return <>
    <Slider label="Angle" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { el.angle = v * DEG; onUpdate() }} />
    <Slider label="Taille (côté)" value={el.size} min={30} max={400} step={1} unit=" px" digits={0}
      onChange={v => { el.size = v; onUpdate() }} />
    <Slider label="Indice n" value={el.n} min={1.0} max={2.5} step={0.01} digits={2}
      onChange={v => { el.n = v; onUpdate() }} />
  </>
}

function CurvedMirrorPanel({ el, onUpdate }: { el: CurvedMirror; onUpdate: () => void }) {
  return <>
    <Slider label="Angle axe" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { el.angle = v * DEG; onUpdate() }} />
    <Slider label="Rayon R" value={el.radius} min={30} max={800} step={1} unit=" px" digits={0}
      onChange={v => { el.radius = v; onUpdate() }} />
    <Slider label="Demi-ouverture" value={el.aperture * RAD} min={5} max={85} step={0.5} unit="°"
      onChange={v => { el.aperture = v * DEG; onUpdate() }} />
    <div className="prop-row">
      <label className="prop-checkbox-row">
        <input type="checkbox" checked={el.concave}
          onChange={e => { el.concave = e.target.checked; onUpdate() }} />
        <span>Concave</span>
        <span className="prop-value" style={{ marginLeft: 'auto' }}>
          f = {(el.radius / 2).toFixed(0)} px
        </span>
      </label>
    </div>
  </>
}

function BeamSourcePanel({ src, onUpdate }: { src: BeamSource; onUpdate: () => void }) {
  return <>
    <Slider label="Angle" value={src.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { src.angle = v * DEG; onUpdate() }} />
    <Slider label="Nb rayons" value={src.numRays} min={1} max={20} step={1} digits={0}
      onChange={v => { src.numRays = v; onUpdate() }} />
    <Slider label="Largeur faisceau" value={src.width} min={0} max={250} step={1} unit=" px" digits={0}
      onChange={v => { src.width = v; onUpdate() }} />
    <WavelengthPicker wavelengths={src.wavelengths} onChange={wl => { src.wavelengths = wl; onUpdate() }} />
  </>
}

function PointSourcePanel({ src, onUpdate }: { src: PointSource; onUpdate: () => void }) {
  return <>
    <Slider label="Angle central" value={src.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { src.angle = v * DEG; onUpdate() }} />
    <Slider label="Nb rayons" value={src.numRays} min={1} max={32} step={1} digits={0}
      onChange={v => { src.numRays = v; onUpdate() }} />
    <Slider label="Ouverture angulaire" value={src.spreadAngle * RAD} min={5} max={360} step={1} unit="°" digits={0}
      onChange={v => { src.spreadAngle = v * DEG; onUpdate() }} />
    <WavelengthPicker wavelengths={src.wavelengths} onChange={wl => { src.wavelengths = wl; onUpdate() }} />
  </>
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

export function PropertiesPanel({ scene, selectedId, onUpdate, onDelete }: Props) {
  if (!scene || !selectedId) {
    return (
      <div className="props-panel">
        <div className="props-empty">
          Cliquer sur un élément ou une source pour voir ses propriétés
        </div>
      </div>
    )
  }

  const element = scene.elements.find(e => e.id === selectedId) ?? null
  const source  = scene.sources.find(s => s.id === selectedId) ?? null

  function renderElementProps(el: OpticalElement) {
    if (el instanceof FlatMirror)    return <FlatMirrorPanel    el={el}  onUpdate={onUpdate} />
    if (el instanceof ThinLens)      return <ThinLensPanel      el={el}  onUpdate={onUpdate} />
    if (el instanceof Block)         return <BlockPanel         el={el}  onUpdate={onUpdate} />
    if (el instanceof Prism)         return <PrismPanel         el={el}  onUpdate={onUpdate} />
    if (el instanceof CurvedMirror)  return <CurvedMirrorPanel  el={el}  onUpdate={onUpdate} />
    return null
  }

  function renderSourceProps(src: LightSource) {
    if (src instanceof BeamSource)   return <BeamSourcePanel   src={src} onUpdate={onUpdate} />
    if (src instanceof PointSource)  return <PointSourcePanel  src={src} onUpdate={onUpdate} />
    return null
  }

  const target = element ?? source
  if (!target) return null

  const typeLabel = element
    ? ({ 'flat-mirror': 'Miroir plan', 'thin-lens': 'Lentille mince', 'block': 'Bloc', 'prism': 'Prisme', 'curved-mirror': 'Miroir courbe' }[element.type] ?? element.type)
    : (source!.type === 'beam' ? 'Source faisceau' : 'Source ponctuelle')

  return (
    <div className="props-panel">
      <div className="props-title">{typeLabel}</div>

      {/* Position */}
      <div className="props-section">Position</div>
      <Slider label="X" value={target.position.x} min={0} max={3840} step={1} unit=" px" digits={0}
        onChange={v => { target.position = { ...target.position, x: v }; onUpdate() }} />
      <Slider label="Y" value={target.position.y} min={0} max={2160} step={1} unit=" px" digits={0}
        onChange={v => { target.position = { ...target.position, y: v }; onUpdate() }} />

      {/* Type-specific */}
      <div className="props-section">Paramètres</div>
      {element && renderElementProps(element)}
      {source  && renderSourceProps(source)}

      {/* Label — only OpticalElement has a label field */}
      {element && <>
        <div className="props-section">Étiquette</div>
        <div className="prop-row">
          <input
            type="text"
            value={element.label}
            onChange={e => { element.label = e.target.value; onUpdate() }}
            style={{
              background: 'rgba(60, 100, 200, 0.15)',
              border: '1px solid rgba(90, 140, 255, 0.3)',
              borderRadius: 5,
              color: 'rgba(190, 215, 255, 0.9)',
              fontSize: 11,
              padding: '4px 7px',
              outline: 'none',
              width: '100%',
            }}
          />
        </div>
      </>}

      {/* Delete */}
      <button className="props-delete-btn" onClick={() => onDelete(selectedId)}>
        Supprimer
      </button>
    </div>
  )
}
