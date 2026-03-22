import './ui.css'
import { useState, useRef, useEffect } from 'react'
import type { Scene, OpticalElement, LightSource, TraceResult, CoatingSpec } from '../core/types.ts'
import { FlatMirror } from '../core/elements/flat-mirror.ts'
import { ThinLens } from '../core/elements/thin-lens.ts'
import { Block } from '../core/elements/block.ts'
import { Prism } from '../core/elements/prism.ts'
import { CurvedMirror } from '../core/elements/curved-mirror.ts'
import { ThickLens } from '../core/elements/thick-lens.ts'
import { ConicMirror } from '../core/elements/conic-mirror.ts'
import { GRINElement, type GRINProfile } from '../core/elements/grin-medium.ts'
import { ImagePlane } from '../core/elements/image-plane.ts'
import { ApertureElement } from '../core/elements/aperture.ts'
import { collectSpots } from '../core/spot-diagram.ts'
import { computeRayFan, computeLCA, autoRayFanConfig } from '../core/ray-fan.ts'
import { computeImage, computeEFL } from '../core/image-calculator.ts'
import { computePupils } from '../core/pupils.ts'
import { BeamSource } from '../core/sources/beam.ts'
import { PointSource } from '../core/sources/point-source.ts'
import { OpticalObject } from '../core/elements/optical-object.ts'
import { wavelengthToColor } from '../renderer/canvas-renderer.ts'
import { MATERIALS, referenceIndex, type MaterialId } from '../core/dispersion.ts'
import { GLASS_CATALOG, sellmeierIndex, LAMBDA_D } from '../core/glass-catalog.ts'
import { optimizeScene, makeRmsMetric, goldenSectionSearch } from '../core/optimizer.ts'

// ─────────────────────────────────────────────────────────────────────────────

const RAD = 180 / Math.PI
const DEG = Math.PI / 180
const SPECTRUM = [405, 445, 480, 515, 555, 590, 630, 670, 700]

interface Props {
  scene: Scene | null
  selectedId: string | null
  onUpdate: () => void
  onDelete: (id: string) => void
  useMm?: boolean           // afficher les distances en mm (phase 7A)
  scale?: number            // mm/px (WorldUnits.scale)
  traceResults?: TraceResult[]  // résultats de tracé courants (phase 7B)
}

// ─────────────────────────────────────────────────────────────────────────────
// UnitCtx — contexte de conversion unités pour les panneaux de propriétés
// ─────────────────────────────────────────────────────────────────────────────

interface UnitCtx {
  /** Interne (px) → display (mm ou px). */
  toD: (px: number) => number
  /** Display (mm ou px) → interne (px). */
  toI: (d: number) => number
  /** Suffixe d'unité : ' mm' ou ' px'. */
  unit: string
  /** Pas de drag en unités display. */
  step: number
  /** Décimales en unités display. */
  digits: number
}

function makeUnitCtx(useMm: boolean, scale: number): UnitCtx {
  if (!useMm) return { toD: v => v, toI: v => v, unit: ' px', step: 1, digits: 0 }
  const digits = scale < 0.1 ? 3 : scale < 1 ? 2 : 1
  // Pas : 1 pixel exprimé en mm, arrondi à 1 chiffre significatif
  const raw = scale
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = Math.round(raw / mag) * mag
  return {
    toD:  v => +(v * scale).toFixed(digits + 2),
    toI:  v => v / scale,
    unit: ' mm',
    step: Math.max(0.01, step),
    digits,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DragNumber — drag horizontal · molette · double-clic pour saisir
// ─────────────────────────────────────────────────────────────────────────────

interface DragNumberProps {
  label: string
  value: number
  min: number
  max: number
  /** Incrément de base : 1 px de drag = 1 step. */
  step: number
  unit?: string
  digits?: number
  onChange: (v: number) => void
}

function DragNumber({ label, value, min, max, step, unit = '', digits = 1, onChange }: DragNumberProps) {
  const [editing, setEditing]   = useState(false)
  const [editText, setEditText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const startRef = useRef<{ x: number; value: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function clamp(v: number) { return Math.max(min, Math.min(max, v)) }

  // Arrondi au multiple de step le plus proche (évite la dérive float)
  function snap(v: number) {
    const inv = 1 / step
    return Math.round(v * inv) / inv
  }

  // ── Pointer capture : drag horizontal ─────────────────────────────────────
  function handlePointerDown(e: React.PointerEvent<HTMLSpanElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    startRef.current = { x: e.clientX, value }
    setIsDragging(false)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLSpanElement>) {
    if (!startRef.current) return
    e.preventDefault()
    const dx = e.clientX - startRef.current.x
    if (Math.abs(dx) > 2) setIsDragging(true)
    onChange(clamp(snap(startRef.current.value + dx * step)))
  }

  function handlePointerUp(e: React.PointerEvent<HTMLSpanElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId)
    startRef.current = null
    setIsDragging(false)
  }

  // ── Molette : incrément fin ────────────────────────────────────────────────
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    e.stopPropagation()
    onChange(clamp(snap(value + (e.deltaY < 0 ? step : -step))))
  }

  // ── Double-clic : saisie clavier ───────────────────────────────────────────
  function startEditing() {
    setEditText(value.toFixed(digits))
    setEditing(true)
  }

  function commitEdit() {
    const parsed = parseFloat(editText.replace(',', '.'))
    if (!isNaN(parsed)) onChange(clamp(parsed))
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') setEditing(false)
  }

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  return (
    <div className="prop-row">
      <div className="prop-header">
        <span className="prop-label">{label}</span>
        {editing ? (
          <input
            ref={inputRef}
            className="prop-edit-input"
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className={`prop-value prop-drag${isDragging ? ' is-dragging' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            onDoubleClick={startEditing}
            title="Drag ← →  ·  Molette  ·  Double-clic pour saisir"
          >
            {value.toFixed(digits)}{unit}
          </span>
        )}
      </div>
    </div>
  )
}

// Alias pour compatibilité avec les usages existants dans ce fichier
const Slider = DragNumber

// ─────────────────────────────────────────────────────────────────────────────
// GlassSelect — sélecteur unifié : n fixe | Cauchy (legacy) | Sellmeier catalogue
// ─────────────────────────────────────────────────────────────────────────────
//
// Encodage de la valeur du <select> :
//   ""          → pas de matériau (n fixe)
//   "cauchy:ID" → matériau Cauchy (MaterialId)
//   "glass:ID"  → verre Sellmeier (GLASS_CATALOG)
// ─────────────────────────────────────────────────────────────────────────────

interface GlassSelectProps {
  material: MaterialId | undefined
  glassId: string | undefined
  onChangeMaterial: (v: MaterialId | undefined) => void
  onChangeGlassId: (v: string | undefined) => void
}

function GlassSelect({ material, glassId, onChangeMaterial, onChangeGlassId }: GlassSelectProps) {
  const [search, setSearch] = useState('')
  const abbeRef = useRef<HTMLCanvasElement>(null)

  // Valeur encodée courante
  const currentValue = glassId ? `glass:${glassId}` : material ? `cauchy:${material}` : ''

  function handleChange(encoded: string) {
    if (encoded === '') {
      onChangeGlassId(undefined)
      onChangeMaterial(undefined)
    } else if (encoded.startsWith('glass:')) {
      onChangeGlassId(encoded.slice(6))
      onChangeMaterial(undefined)
    } else if (encoded.startsWith('cauchy:')) {
      onChangeMaterial(encoded.slice(7) as MaterialId)
      onChangeGlassId(undefined)
    }
  }

  const filtered = search.trim().length > 0
    ? GLASS_CATALOG.filter(g =>
        g.id.toLowerCase().includes(search.toLowerCase()) ||
        g.name.toLowerCase().includes(search.toLowerCase())
      )
    : GLASS_CATALOG

  // ── Diagramme d'Abbe ──────────────────────────────────────────────────────
  // Axes : νD en abscisse (95→20 de gauche à droite), nD en ordonnée (1.9→1.4 haut→bas)
  useEffect(() => {
    const canvas = abbeRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const PAD = 16

    const nuMin = 18, nuMax = 100
    const nMin = 1.42, nMax = 1.92

    function toX(nu: number) { return PAD + (1 - (nu - nuMin) / (nuMax - nuMin)) * (W - 2 * PAD) }
    function toY(nd: number) { return PAD + (1 - (nd - nMin) / (nMax - nMin)) * (H - 2 * PAD) }

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0d1a24'
    ctx.fillRect(0, 0, W, H)

    // Grille
    ctx.strokeStyle = '#1e2e3e'
    ctx.lineWidth = 0.5
    for (const nu of [20, 30, 40, 50, 60, 70, 80, 90]) {
      ctx.beginPath(); ctx.moveTo(toX(nu), PAD); ctx.lineTo(toX(nu), H - PAD); ctx.stroke()
    }
    for (const nd of [1.5, 1.6, 1.7, 1.8, 1.9]) {
      ctx.beginPath(); ctx.moveTo(PAD, toY(nd)); ctx.lineTo(W - PAD, toY(nd)); ctx.stroke()
    }

    // Axes labels
    ctx.fillStyle = '#4a6a7a'
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    for (const nu of [20, 40, 60, 80]) {
      ctx.fillText(String(nu), toX(nu), H - 3)
    }
    ctx.textAlign = 'right'
    for (const nd of [1.5, 1.6, 1.7, 1.8]) {
      ctx.fillText(nd.toFixed(1), PAD - 1, toY(nd) + 3)
    }

    // Tous les verres du catalogue
    for (const g of GLASS_CATALOG) {
      const x = toX(g.abbeNumber), y = toY(g.nD)
      const isSel = g.id === glassId
      ctx.beginPath()
      ctx.arc(x, y, isSel ? 4 : 2.5, 0, Math.PI * 2)
      ctx.fillStyle = isSel ? '#60c8ff' : '#3a7a9a'
      ctx.fill()
      if (isSel) {
        ctx.fillStyle = '#60c8ff'
        ctx.font = '8px monospace'
        ctx.textAlign = x < W / 2 ? 'left' : 'right'
        ctx.fillText(g.id, x + (x < W / 2 ? 6 : -6), y + 3)
      }
    }

    // Label axes
    ctx.fillStyle = '#4a6a7a'
    ctx.font = '7px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('νD →', W / 2, H - 1)
  }, [glassId])

  // Clic sur le diagramme → sélection du verre le plus proche
  function handleAbbeClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = abbeRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = (e.clientX - rect.left) * (canvas.width / rect.width)
    const py = (e.clientY - rect.top) * (canvas.height / rect.height)
    const W = canvas.width, H = canvas.height, PAD = 16
    const nuMin = 18, nuMax = 100, nMin = 1.42, nMax = 1.92

    function toX(nu: number) { return PAD + (1 - (nu - nuMin) / (nuMax - nuMin)) * (W - 2 * PAD) }
    function toY(nd: number) { return PAD + (1 - (nd - nMin) / (nMax - nMin)) * (H - 2 * PAD) }

    let best: typeof GLASS_CATALOG[0] | null = null, bestDist = Infinity
    for (const g of GLASS_CATALOG) {
      const d = Math.hypot(px - toX(g.abbeNumber), py - toY(g.nD))
      if (d < bestDist) { bestDist = d; best = g }
    }
    if (best && bestDist < 12) {
      onChangeGlassId(best.id)
      onChangeMaterial(undefined)
    }
  }

  return (
    <div className="prop-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
      <div className="prop-header">
        <span className="prop-label">Matériau</span>
        <select
          className="prop-material-select"
          value={currentValue}
          onChange={e => handleChange(e.target.value)}
        >
          <option value="">n fixe</option>
          <optgroup label="Cauchy (legacy)">
            {(Object.keys(MATERIALS) as MaterialId[]).map(id => (
              <option key={id} value={`cauchy:${id}`}>
                {MATERIALS[id].label} (n≈{referenceIndex(id).toFixed(3)})
              </option>
            ))}
          </optgroup>
          <optgroup label="Sellmeier Schott">
            {filtered.map(g => (
              <option key={g.id} value={`glass:${g.id}`}>
                {g.id}  nD={g.nD.toFixed(4)}  νD={g.abbeNumber.toFixed(1)}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <input
        type="text"
        placeholder="Chercher un verre…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid #3a4a5a',
                 background: '#0d1a24', color: '#c0ccd8', marginTop: 2 }}
      />
      {glassId && (
        <span style={{ fontSize: 10, color: '#60c8ff', paddingLeft: 4 }}>
          {(() => { const g = GLASS_CATALOG.find(x => x.id === glassId); return g ? `${g.name}  nD=${sellmeierIndex(g.sellmeier, LAMBDA_D).toFixed(4)}  νD=${g.abbeNumber.toFixed(1)}` : glassId })()}
        </span>
      )}
      {/* Diagramme d'Abbe — clic pour sélectionner un verre */}
      <canvas
        ref={abbeRef}
        width={200} height={120}
        onClick={handleAbbeClick}
        title="Diagramme d'Abbe — clic pour sélectionner un verre"
        style={{ cursor: 'crosshair', borderRadius: 4, border: '1px solid #1e2e3e', alignSelf: 'center', width: 200, height: 120 }}
      />
      <span style={{ fontSize: 9, color: '#4a6a7a', textAlign: 'center' }}>
        Diagramme d&apos;Abbe (clic = sélection)
      </span>
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

function FlatMirrorPanel({ el, onUpdate, u }: { el: FlatMirror; onUpdate: () => void; u: UnitCtx }) {
  return <>
    <Slider label="Angle" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { el.angle = v * DEG; onUpdate() }} />
    <Slider label="Longueur" value={u.toD(el.length)} min={u.toD(20)} max={u.toD(600)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.length = u.toI(v); onUpdate() }} />
  </>
}

function ThinLensPanel({ el, onUpdate, u, scene }: { el: ThinLens; onUpdate: () => void; u: UnitCtx; scene: Scene | null }) {
  return <>
    <Slider label="Angle axe" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { el.angle = v * DEG; onUpdate() }} />
    <Slider label="Focale f" value={u.toD(el.focalLength)} min={u.toD(-2000)} max={u.toD(2000)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { const px = u.toI(v); if (px === 0) return; el.focalLength = px; onUpdate() }} />
    <Slider label="Ouverture" value={u.toD(el.height)} min={u.toD(20)} max={u.toD(400)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.height = u.toI(v); onUpdate() }} />
    <div className="prop-row">
      <div className="prop-header">
        <span className="prop-label">Type</span>
        <span className="prop-value" style={{ color: el.focalLength > 0 ? '#60ff90' : '#ff8060' }}>
          {el.focalLength > 0 ? 'Convergente' : 'Divergente'}
        </span>
      </div>
    </div>
    {scene && <OptimizerPanel el={el} scene={scene} onUpdate={onUpdate} />}
  </>
}

// ─────────────────────────────────────────────────────────────────────────────
// CoatingToggle — Activer/désactiver un coating AR quart-d'onde (phase 7D)
// ─────────────────────────────────────────────────────────────────────────────

function CoatingToggle({
  label,
  coating,
  onChange,
}: {
  label: string
  coating: CoatingSpec | undefined
  onChange: (c: CoatingSpec | undefined) => void
}) {
  const active = coating !== undefined
  return (
    <div className="prop-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none', fontSize: 11, color: '#b0c8e8' }}>
        <input
          type="checkbox"
          checked={active}
          onChange={e => onChange(e.target.checked ? { wavelength: 550 } : undefined)}
          style={{ cursor: 'pointer' }}
        />
        {label} coating AR
      </label>
      {active && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 18 }}>
          <span style={{ fontSize: 10, color: '#7090a0' }}>λ₀</span>
          <input
            type="number"
            value={coating!.wavelength}
            min={380} max={780} step={10}
            onChange={e => onChange({ ...coating!, wavelength: +e.target.value })}
            style={{ width: 56, fontSize: 11, background: '#0d1a24', color: '#60c8ff',
                     border: '1px solid #2a4060', borderRadius: 4, padding: '2px 4px' }}
          />
          <span style={{ fontSize: 10, color: '#7090a0' }}>nm</span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OptimizerPanel — Optimiseur mono-variable (phase 7D)
// ─────────────────────────────────────────────────────────────────────────────

const OPTIMIZABLE_PROPS: Record<string, { label: string; min: number; max: number }[]> = {
  'thin-lens':  [{ label: 'f (focale)', min: -2000, max: 2000 }],
  'thick-lens': [
    { label: 'R1',         min: -2000, max: 2000 },
    { label: 'R2',         min: -2000, max: 2000 },
    { label: 'thickness',  min: 2,     max: 200  },
    { label: 'halfHeight', min: 10,    max: 300  },
  ],
  'curved-mirror': [{ label: 'radius', min: 20, max: 1000 }],
  'conic-mirror':  [{ label: 'R',      min: 20, max: 1000 }],
}

const PROP_INTERNAL: Record<string, string> = {
  'f (focale)': 'focalLength',
  'R1': 'R1', 'R2': 'R2', 'thickness': 'thickness', 'halfHeight': 'halfHeight',
  'radius': 'radius', 'R': 'R',
}

function OptimizerPanel({
  el, scene, onUpdate,
}: {
  el: OpticalElement
  scene: Scene
  onUpdate: () => void
}) {
  const props = OPTIMIZABLE_PROPS[el.type] ?? []
  const [propIdx, setPropIdx]     = useState(0)
  const [rangeMin, setRangeMin]   = useState(props[0]?.min ?? 20)
  const [rangeMax, setRangeMax]   = useState(props[0]?.max ?? 500)
  const [running, setRunning]     = useState(false)
  const [lastResult, setLastResult] = useState<string | null>(null)

  // Cherche le premier ImagePlane dans la scène
  const imagePlaneId = scene.elements.find(e => e.type === 'image-plane')?.id ?? ''

  if (props.length === 0 || !imagePlaneId) return null

  const selected = props[propIdx]

  function run() {
    if (!selected || !imagePlaneId) return
    setRunning(true)
    setLastResult(null)
    try {
      const metric = makeRmsMetric(imagePlaneId)
      const result = optimizeScene(scene, {
        elementId: el.id,
        property: PROP_INTERNAL[selected.label] ?? selected.label,
        min: rangeMin,
        max: rangeMax,
      }, metric, { scanPoints: 10 })

      // Appliquer la valeur optimale
      const obj = el as unknown as Record<string, unknown>
      obj[PROP_INTERNAL[selected.label] ?? selected.label] = result.optimalValue
      setLastResult(`Optimal: ${result.optimalValue.toFixed(2)}  RMS: ${result.optimalMetric.toFixed(3)} px`)
      onUpdate()
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ marginTop: 6, borderTop: '1px solid #2a3a4a', paddingTop: 6 }}>
      <div className="props-section" style={{ marginBottom: 4 }}>Optimiseur</div>
      <div className="prop-row" style={{ gap: 4 }}>
        <span className="prop-label" style={{ width: 70 }}>Paramètre</span>
        <select
          value={propIdx}
          onChange={e => {
            const i = +e.target.value
            setPropIdx(i)
            setRangeMin(props[i].min)
            setRangeMax(props[i].max)
          }}
          style={{ flex: 1, fontSize: 11, background: '#0d1a24', color: '#c0d8f0',
                   border: '1px solid #2a4060', borderRadius: 4, padding: '2px 4px' }}
        >
          {props.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
        </select>
      </div>
      <div className="prop-row" style={{ gap: 4 }}>
        <span className="prop-label" style={{ width: 70 }}>Plage</span>
        <input type="number" value={rangeMin} onChange={e => setRangeMin(+e.target.value)}
          style={{ width: 52, fontSize: 11, background: '#0d1a24', color: '#c0d8f0',
                   border: '1px solid #2a4060', borderRadius: 4, padding: '2px 4px' }} />
        <span style={{ fontSize: 10, color: '#607080' }}>–</span>
        <input type="number" value={rangeMax} onChange={e => setRangeMax(+e.target.value)}
          style={{ width: 52, fontSize: 11, background: '#0d1a24', color: '#c0d8f0',
                   border: '1px solid #2a4060', borderRadius: 4, padding: '2px 4px' }} />
      </div>
      <div className="prop-row">
        <span className="prop-label" style={{ width: 70, fontSize: 10, color: '#607080' }}>Métrique</span>
        <span style={{ fontSize: 10, color: '#60c8ff' }}>RMS spot — {scene.elements.find(e => e.id === imagePlaneId)?.label ?? 'Image'}</span>
      </div>
      <button
        onClick={run}
        disabled={running}
        style={{
          marginTop: 4, width: '100%', padding: '5px 0', fontSize: 11,
          background: running ? '#1a2a3a' : 'rgba(60,120,220,0.25)',
          color: running ? '#607080' : '#80c0ff',
          border: '1px solid rgba(80,140,255,0.4)', borderRadius: 5, cursor: running ? 'default' : 'pointer',
        }}
      >
        {running ? 'Optimisation…' : '▶ Lancer la section dorée'}
      </button>
      {lastResult && (
        <div style={{ fontSize: 10, color: '#60e880', marginTop: 4, textAlign: 'center' }}>
          {lastResult}
        </div>
      )}
    </div>
  )
}

function BlockPanel({ el, onUpdate, u }: { el: Block; onUpdate: () => void; u: UnitCtx }) {
  return <>
    <Slider label="Angle" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { el.angle = v * DEG; onUpdate() }} />
    <Slider label="Largeur" value={u.toD(el.width)} min={u.toD(10)} max={u.toD(400)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.width = u.toI(v); onUpdate() }} />
    <Slider label="Hauteur" value={u.toD(el.height)} min={u.toD(10)} max={u.toD(400)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.height = u.toI(v); onUpdate() }} />
    <GlassSelect material={el.material} glassId={el.glassId}
      onChangeMaterial={v => { el.material = v; onUpdate() }}
      onChangeGlassId={v => { el.glassId = v; onUpdate() }} />
    {!el.material && !el.glassId && (
      <Slider label="Indice n" value={el.n} min={1.0} max={2.5} step={0.01} digits={2}
        onChange={v => { el.n = v; onUpdate() }} />
    )}
    <Slider label="Absorption α" value={el.absorptionCoeff} min={0} max={0.05} step={0.0005} digits={4} unit={u.unit + '⁻¹'}
      onChange={v => { el.absorptionCoeff = v; onUpdate() }} />
    <CoatingToggle label="Toutes faces" coating={el.coating} onChange={c => { el.coating = c; onUpdate() }} />
  </>
}

function PrismPanel({ el, onUpdate, u }: { el: Prism; onUpdate: () => void; u: UnitCtx }) {
  return <>
    <Slider label="Angle" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { el.angle = v * DEG; onUpdate() }} />
    <Slider label="Taille (jambe)" value={u.toD(el.size)} min={u.toD(30)} max={u.toD(400)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.size = u.toI(v); onUpdate() }} />
    <Slider label="Angle apex" value={el.apexAngle * RAD} min={10} max={120} step={0.5} unit="°"
      onChange={v => { el.apexAngle = v * DEG; onUpdate() }} />
    <GlassSelect material={el.material} glassId={el.glassId}
      onChangeMaterial={v => { el.material = v; onUpdate() }}
      onChangeGlassId={v => { el.glassId = v; onUpdate() }} />
    {!el.material && !el.glassId && (
      <Slider label="Indice n" value={el.n} min={1.0} max={2.5} step={0.01} digits={2}
        onChange={v => { el.n = v; onUpdate() }} />
    )}
    <Slider label="Absorption α" value={el.absorptionCoeff} min={0} max={0.05} step={0.0005} digits={4} unit={u.unit + '⁻¹'}
      onChange={v => { el.absorptionCoeff = v; onUpdate() }} />
    <CoatingToggle label="Toutes faces" coating={el.coating} onChange={c => { el.coating = c; onUpdate() }} />
  </>
}

function ThickLensPanel({ el, onUpdate, u, scene }: { el: ThickLens; onUpdate: () => void; u: UnitCtx; scene: Scene | null }) {
  const f = el.paraxialFocalLength()
  return <>
    <Slider label="Angle axe" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { el.angle = v * DEG; onUpdate() }} />
    <Slider label="R1 (avant)" value={u.toD(el.R1)} min={u.toD(-2000)} max={u.toD(2000)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { if (v === 0) return; el.R1 = u.toI(v); onUpdate() }} />
    <Slider label="R2 (arrière)" value={u.toD(el.R2)} min={u.toD(-2000)} max={u.toD(2000)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { if (v === 0) return; el.R2 = u.toI(v); onUpdate() }} />
    <Slider label="κ1" value={el.kappa1} min={-3} max={2} step={0.05} digits={2}
      onChange={v => { el.kappa1 = v; onUpdate() }} />
    <Slider label="κ2" value={el.kappa2} min={-3} max={2} step={0.05} digits={2}
      onChange={v => { el.kappa2 = v; onUpdate() }} />
    <Slider label="Épaisseur" value={u.toD(el.thickness)} min={u.toD(1)} max={u.toD(200)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.thickness = u.toI(v); onUpdate() }} />
    <Slider label="Demi-ouverture" value={u.toD(el.halfHeight)} min={u.toD(10)} max={u.toD(250)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.halfHeight = u.toI(v); onUpdate() }} />
    <GlassSelect material={el.material} glassId={el.glassId}
      onChangeMaterial={v => { el.material = v; onUpdate() }}
      onChangeGlassId={v => { el.glassId = v; onUpdate() }} />
    {!el.material && !el.glassId && (
      <Slider label="Indice n" value={el.n} min={1.0} max={2.5} step={0.01} digits={2}
        onChange={v => { el.n = v; onUpdate() }} />
    )}
    <Slider label="Absorption α" value={el.absorptionCoeff} min={0} max={0.05} step={0.0005} digits={4} unit={u.unit + '⁻¹'}
      onChange={v => { el.absorptionCoeff = v; onUpdate() }} />
    <CoatingToggle label="S1 (avant)" coating={el.coating1} onChange={c => { el.coating1 = c; onUpdate() }} />
    <CoatingToggle label="S2 (arrière)" coating={el.coating2} onChange={c => { el.coating2 = c; onUpdate() }} />
    <div className="prop-row">
      <div className="prop-header">
        <span className="prop-label">f paraxiale</span>
        <span className="prop-value" style={{ color: '#60c8ff' }}>
          {isFinite(f) ? `${u.toD(f).toFixed(u.digits)}${u.unit}` : '∞'}
        </span>
      </div>
    </div>
    {scene && <OptimizerPanel el={el} scene={scene} onUpdate={onUpdate} />}
  </>
}

function GRINMediumPanel({ el, onUpdate, u }: { el: GRINElement; onUpdate: () => void; u: UnitCtx }) {
  // Paramètres de l'alpha selon le profil
  type AlphaCfg = { label: string; min: number; max: number; step: number; digits: number }
  const alphaCfg: Record<GRINProfile, AlphaCfg> = {
    linear:      { label: 'α (∂n/∂y)',  min: -0.003, max: 0.003, step: 0.00005, digits: 5 },
    parabolic:   { label: 'α (px⁻¹)',   min:  0.001, max: 0.05,  step: 0.001,   digits: 3 },
    exponential: { label: 'H (px)',      min:  10,    max: 500,   step: 1,       digits: 0 },
    custom:      { label: 'αy (∂n/∂y)', min: -0.003, max: 0.003, step: 0.00005, digits: 5 },
  }
  const ac = alphaCfg[el.profile]

  // Indice min/max dans le milieu (info) — on échantillonne les 4 coins + centre
  const cx = el.position.x + el.width / 2
  const cy = el.position.y + el.height / 2
  const samples = [
    el.indexAt({ x: cx,               y: cy               }),
    el.indexAt({ x: el.position.x,    y: el.position.y    }),
    el.indexAt({ x: el.position.x + el.width, y: el.position.y }),
    el.indexAt({ x: el.position.x,    y: el.position.y + el.height }),
    el.indexAt({ x: el.position.x + el.width, y: el.position.y + el.height }),
  ]
  const nMin = Math.min(...samples)
  const nMax = Math.max(...samples)

  return <>
    {/* Sélecteur de profil */}
    <div className="prop-row">
      <div className="prop-header">
        <span className="prop-label">Profil</span>
        <select
          className="prop-material-select"
          value={el.profile}
          onChange={e => { el.profile = e.target.value as GRINProfile; onUpdate() }}
        >
          <option value="linear">Linéaire  n(y)=n₀+αy</option>
          <option value="parabolic">Parabolique  n(r)=n₀(1−α²r²/2)</option>
          <option value="exponential">Exponentiel  n(h)=1+(n₀−1)e^(−h/H)</option>
          <option value="custom">Custom  n(x,y)=n₀+αy·y+αx·x</option>
        </select>
      </div>
    </div>
    <Slider label="n₀" value={el.n0} min={1.0} max={2.5} step={0.005} digits={3}
      onChange={v => { el.n0 = v; onUpdate() }} />
    <Slider label={ac.label} value={el.alpha} min={ac.min} max={ac.max} step={ac.step} digits={ac.digits}
      onChange={v => { el.alpha = v; onUpdate() }} />
    {/* Gradient horizontal αx — uniquement pour le profil custom */}
    {el.profile === 'custom' && (
      <Slider label="αx (∂n/∂x)" value={el.alpha2} min={-0.003} max={0.003} step={0.00005} digits={5}
        onChange={v => { el.alpha2 = v; onUpdate() }} />
    )}
    <Slider label="Largeur" value={u.toD(el.width)} min={u.toD(50)} max={u.toD(900)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.width = u.toI(v); onUpdate() }} />
    <Slider label="Hauteur" value={u.toD(el.height)} min={u.toD(50)} max={u.toD(700)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.height = u.toI(v); onUpdate() }} />
    {/* Plage d'indice */}
    <div className="prop-row">
      <div className="prop-header">
        <span className="prop-label">n min / max</span>
        <span className="prop-value" style={{ color: '#3cd8b8' }}>
          {nMin.toFixed(3)} – {nMax.toFixed(3)}
        </span>
      </div>
    </div>
  </>
}

function ConicMirrorPanel({ el, onUpdate, u }: { el: ConicMirror; onUpdate: () => void; u: UnitCtx }) {
  function kappaLabel(k: number): string {
    if (Math.abs(k) < 0.02)       return 'Sphère (κ=0)'
    if (Math.abs(k + 1) < 0.02)   return 'Parabole (κ=−1)'
    if (k < -1)                   return 'Hyperbole (κ<−1)'
    if (k < 0)                    return 'Ellipse prolate'
    return 'Ellipse oblate (κ>0)'
  }
  return <>
    <Slider label="Angle axe" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { el.angle = v * DEG; onUpdate() }} />
    <Slider label="Rayon R" value={u.toD(el.R)} min={u.toD(30)} max={u.toD(800)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.R = u.toI(v); onUpdate() }} />
    <Slider label="κ (conicité)" value={el.kappa} min={-3} max={2} step={0.05} digits={2}
      onChange={v => { el.kappa = v; onUpdate() }} />
    <Slider label="Demi-ouverture" value={u.toD(el.halfHeight)} min={u.toD(10)} max={u.toD(250)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.halfHeight = u.toI(v); onUpdate() }} />
    <div className="prop-row">
      <div className="prop-header">
        <span className="prop-label">Forme</span>
        <span className="prop-value" style={{ color: '#8bb8f8' }}>{kappaLabel(el.kappa)}</span>
      </div>
    </div>
    <div className="prop-row">
      <div className="prop-header">
        <span className="prop-label">Foyer f</span>
        <span className="prop-value" style={{ color: '#8bb8f8' }}>{u.toD(el.R / 2).toFixed(u.digits)}{u.unit}</span>
      </div>
    </div>
  </>
}

function CurvedMirrorPanel({ el, onUpdate, u }: { el: CurvedMirror; onUpdate: () => void; u: UnitCtx }) {
  return <>
    <Slider label="Angle axe" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { el.angle = v * DEG; onUpdate() }} />
    <Slider label="Rayon R" value={u.toD(el.radius)} min={u.toD(30)} max={u.toD(800)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.radius = u.toI(v); onUpdate() }} />
    <Slider label="Demi-ouverture" value={el.aperture * RAD} min={5} max={85} step={0.5} unit="°"
      onChange={v => { el.aperture = v * DEG; onUpdate() }} />
    <div className="prop-row">
      <label className="prop-checkbox-row">
        <input type="checkbox" checked={el.concave}
          onChange={e => { el.concave = e.target.checked; onUpdate() }} />
        <span>Concave</span>
        <span className="prop-value" style={{ marginLeft: 'auto' }}>
          f = {u.toD(el.radius / 2).toFixed(u.digits)}{u.unit}
        </span>
      </label>
    </div>
  </>
}

function PolarizationSelect({ value, onChange }: { value: 's' | 'p' | 'unpolarized'; onChange: (v: 's' | 'p' | 'unpolarized') => void }) {
  return (
    <div className="prop-row">
      <div className="prop-header">
        <span className="prop-label">Polarisation</span>
        <select
          className="prop-material-select"
          value={value}
          onChange={e => onChange(e.target.value as 's' | 'p' | 'unpolarized')}
        >
          <option value="unpolarized">Non polarisé</option>
          <option value="s">s (TE — ⊥ plan d'incidence)</option>
          <option value="p">p (TM — ∥ plan d'incidence)</option>
        </select>
      </div>
    </div>
  )
}

function BeamSourcePanel({ src, onUpdate, u }: { src: BeamSource; onUpdate: () => void; u: UnitCtx }) {
  return <>
    <Slider label="Angle" value={src.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { src.angle = v * DEG; onUpdate() }} />
    <Slider label="Nb rayons" value={src.numRays} min={1} max={20} step={1} digits={0}
      onChange={v => { src.numRays = v; onUpdate() }} />
    <Slider label="Largeur faisceau" value={u.toD(src.width)} min={0} max={u.toD(250)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { src.width = u.toI(v); onUpdate() }} />
    <WavelengthPicker wavelengths={src.wavelengths} onChange={wl => { src.wavelengths = wl; onUpdate() }} />
    <PolarizationSelect value={src.polarization} onChange={v => { src.polarization = v; onUpdate() }} />
  </>
}

// ─────────────────────────────────────────────────────────────────────────────
// ImagePlanePanel — spot diagram + best focus (Phase 7B)
// ─────────────────────────────────────────────────────────────────────────────

// Longueurs d'onde spectrales de référence pour la LCA
const LCA_WAVELENGTHS = [440, 480, 520, 550, 587, 620, 656, 700]

function ImagePlanePanel({
  el, onUpdate, u, mmPerPx, results, scene,
}: {
  el: ImagePlane
  onUpdate: () => void
  u: UnitCtx
  mmPerPx: number
  results: TraceResult[]
  scene: import('../core/types.ts').Scene | null
}) {
  const spotData = collectSpots(el, results)
  const spotRef       = useRef<HTMLCanvasElement>(null)
  const fanRef        = useRef<HTMLCanvasElement>(null)
  const lcaRef        = useRef<HTMLCanvasElement>(null)
  const focusCurveRef = useRef<HTMLCanvasElement>(null)

  const [focusResult, setFocusResult] = useState<{
    rmsBefore: number               // µm, position avant auto-focus
    rmsAfter:  number               // µm, position optimale
    origX:     number               // position initiale en unités display
    optX:      number               // position optimale en unités display
    curve:     { x: number; rms: number }[]  // courbe RMS(x), rms en µm
  } | null>(null)

  // Axial position = projection de position sur l'axe optique
  const axialPx  = el.position.x * el.axisDir.x + el.position.y * el.axisDir.y

  function setAxial(newAxialDisplay: number) {
    const newAxialPx = u.toI(newAxialDisplay)
    const delta = newAxialPx - axialPx
    el.position = {
      x: el.position.x + delta * el.axisDir.x,
      y: el.position.y + delta * el.axisDir.y,
    }
    onUpdate()
  }

  // ── Auto-focus : GSS sur la position axiale, rayons filtrés ───────────────
  //
  // Rayons valides : ≥2 segments (a traversé au moins une surface réfractante)
  // ET intensité du dernier segment > 0.5 (élimine les reflets Fresnel).
  // Pas besoin de re-tracer : ImagePlane est transparent, on déplace le plan
  // et on recalcule les intersections avec les segments déjà tracés.
  function handleAutoFocus() {
    if (!results.length) return
    const valid = results.filter(r =>
      r.segments.length >= 2 &&
      r.segments[r.segments.length - 1].intensity > 0.5,
    )
    if (!valid.length) return

    const origPos   = { ...el.position }
    const axDir     = el.axisDir           // constant (dépend de el.angle)
    const currentAx = origPos.x * axDir.x + origPos.y * axDir.y

    // Borne inférieure : x du début du dernier segment de chaque rayon valide.
    // Ce point est juste après la dernière surface traversée → pas de sens
    // physique de chercher un foyer avant cette position.
    const lastOpticalX = Math.max(...valid.map(r => r.segments[r.segments.length - 1].start.x))
    const lo = lastOpticalX + u.toI(1)   // 1mm de marge après la dernière surface
    const hi = lo + u.toI(500)           // plage de +500mm vers la droite

    function evalAt(ax: number): number {
      const d = ax - currentAx
      el.position = { x: origPos.x + d * axDir.x, y: origPos.y + d * axDir.y }
      const s = collectSpots(el, valid)
      return s.rmsRadius > 0 ? s.rmsRadius : Infinity
    }

    // RMS à la position actuelle (peut être hors plage, sert uniquement à l'affichage)
    const rmsBefore = evalAt(currentAx) * mmPerPx * 1000

    // Balayage 61 points sur [lo, hi] → courbe de focus
    const N = 60
    const curve: { x: number; rms: number }[] = []
    for (let i = 0; i <= N; i++) {
      const ax = lo + (hi - lo) * i / N
      const r  = evalAt(ax)
      curve.push({ x: u.toD(ax), rms: r === Infinity ? 0 : r * mmPerPx * 1000 })
    }

    // Recherche par section dorée sur [lo, hi]
    const { x: optAx } = goldenSectionSearch(evalAt, lo, hi, 0.1, 80)

    // Applique la position optimale
    const dOpt = optAx - currentAx
    el.position = { x: origPos.x + dOpt * axDir.x, y: origPos.y + dOpt * axDir.y }
    const rmsAfter = collectSpots(el, valid).rmsRadius * mmPerPx * 1000

    setFocusResult({ rmsBefore, rmsAfter, origX: u.toD(currentAx), optX: u.toD(optAx), curve })
    onUpdate()
  }

  // ── Ray fan et LCA (calculés depuis la scène + rayons paraxiaux) ──────────
  const wavelengthsInScene = [...new Set(results.flatMap(r => r.segments.map(s => s.wavelength)))].sort((a,b)=>a-b)
  const fanCfg  = scene ? autoRayFanConfig(scene, el, wavelengthsInScene.length > 0 ? wavelengthsInScene : [550]) : null
  const lcaCfg  = scene && fanCfg ? { pupilX: fanCfg.pupilX, pupilRadius: fanCfg.pupilRadius, rayDir: fanCfg.rayDir, wavelengths: LCA_WAVELENGTHS } : null
  const fanData = scene && fanCfg ? computeRayFan(scene, el, fanCfg) : []
  const lcaData = scene && lcaCfg ? computeLCA(scene, lcaCfg)        : []

  // ── Dessin de la courbe RMS vs position (auto-focus) ─────────────────────
  useEffect(() => {
    const canvas = focusCurveRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const PAD = 18

    ctx.fillStyle = '#0a1520'
    ctx.fillRect(0, 0, W, H)

    if (!focusResult) {
      ctx.fillStyle = '#4a6a7a'
      ctx.font = '10px monospace'; ctx.textAlign = 'center'
      ctx.fillText('Cliquer Auto-focus', W/2, H/2 + 4)
      return
    }

    const { curve, origX, optX } = focusResult
    const validPts = curve.filter(p => p.rms > 0)
    if (validPts.length < 2) {
      ctx.fillStyle = '#4a6a7a'
      ctx.font = '10px monospace'; ctx.textAlign = 'center'
      ctx.fillText('Aucun rayon valide', W/2, H/2 + 4)
      return
    }

    const xMin = curve[0].x, xMax = curve[curve.length - 1].x
    const rmsMax = Math.max(...validPts.map(p => p.rms), 0.001)

    function toCanvasX(x: number) { return PAD + ((x - xMin) / (xMax - xMin)) * (W - 2*PAD) }
    function toCanvasY(r: number) { return H - PAD - (r / (rmsMax * 1.1)) * (H - 2*PAD) }

    // Axe bas
    ctx.strokeStyle = '#1a3040'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD, H-PAD); ctx.lineTo(W-PAD, H-PAD); ctx.stroke()

    // Courbe RMS
    ctx.strokeStyle = '#60a8f8'; ctx.lineWidth = 1.5
    ctx.beginPath()
    let first = true
    for (const pt of curve) {
      if (pt.rms <= 0) { first = true; continue }
      const cx = toCanvasX(pt.x)
      const cy = toCanvasY(pt.rms)
      if (first) { ctx.moveTo(cx, cy); first = false } else { ctx.lineTo(cx, cy) }
    }
    ctx.stroke()

    // Ligne position initiale (jaune tiretée)
    ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
    const cx0 = toCanvasX(origX)
    ctx.beginPath(); ctx.moveTo(cx0, PAD); ctx.lineTo(cx0, H-PAD); ctx.stroke()
    ctx.setLineDash([])

    // Ligne position optimale (verte)
    ctx.strokeStyle = '#40e080'; ctx.lineWidth = 1.5
    const cxOpt = toCanvasX(optX)
    ctx.beginPath(); ctx.moveTo(cxOpt, PAD); ctx.lineTo(cxOpt, H-PAD); ctx.stroke()

    // Point minimum sur la courbe
    const minPt = validPts.reduce((b, p) => p.rms < b.rms ? p : b, validPts[0])
    ctx.fillStyle = '#40e080'
    ctx.beginPath(); ctx.arc(toCanvasX(minPt.x), toCanvasY(minPt.rms), 3, 0, Math.PI*2); ctx.fill()

    // Barre d'échelle RMS (Y)
    const scaleUm = (() => {
      const mag = Math.pow(10, Math.floor(Math.log10(rmsMax)))
      return [mag, mag*2, mag*5].find(c => c/rmsMax < 0.5) ?? mag
    })()
    const scaleH = (scaleUm / (rmsMax * 1.1)) * (H - 2*PAD)
    ctx.strokeStyle = '#8bb8f8'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(W-6, H-PAD); ctx.lineTo(W-6, H-PAD - scaleH); ctx.stroke()
    ctx.fillStyle = '#8bb8f8'; ctx.font = '8px monospace'; ctx.textAlign = 'right'
    ctx.fillText(`${scaleUm < 1 ? scaleUm.toFixed(2) : scaleUm} µm`, W-8, H-PAD - scaleH/2 + 3)

    // Labels X (position axiale)
    ctx.fillStyle = '#4a6a7a'; ctx.font = '8px monospace'; ctx.textAlign = 'center'
    ctx.fillText(`${xMin.toFixed(0)}`, PAD + 8, H - 3)
    ctx.fillText(`${xMax.toFixed(0)}`, W - PAD - 8, H - 3)
  }, [focusResult])

  // ── Dessin du ray fan ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = fanRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const PAD = 18

    ctx.fillStyle = '#0a1520'
    ctx.fillRect(0, 0, W, H)

    // Axes
    ctx.strokeStyle = '#1a3040'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke()  // h=0
    ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke()  // Δy=0

    if (fanData.length === 0) {
      ctx.fillStyle = '#4a6a7a'
      ctx.font = '10px monospace'; ctx.textAlign = 'center'
      ctx.fillText('Aucune donnée', W/2, H/2 + 4)
      return
    }

    // Plage Y en µm
    const allDeltaUm = fanData.flatMap(c => c.points.map(p => p.deltaY * mmPerPx * 1000))
    const maxAbsUm = Math.max(Math.abs(Math.min(...allDeltaUm)), Math.abs(Math.max(...allDeltaUm)), 0.001)
    const rangeUm  = maxAbsUm * 1.3

    function toCanvasX(h: number)  { return W/2 + (h / 1) * (W/2 - PAD) }
    function toCanvasY(um: number) { return H/2 - (um / rangeUm) * (H/2 - PAD) }

    for (const curve of fanData) {
      const color = wavelengthToColor(curve.wavelength, 0.9)
      ctx.strokeStyle = color
      ctx.lineWidth   = 1.5
      ctx.beginPath()
      let first = true
      for (const pt of curve.points) {
        const cx = toCanvasX(pt.h)
        const cy = toCanvasY(pt.deltaY * mmPerPx * 1000)
        if (first) { ctx.moveTo(cx, cy); first = false } else { ctx.lineTo(cx, cy) }
      }
      ctx.stroke()
    }

    // Barre d'échelle Y
    const scaleUm = (() => {
      const mag = Math.pow(10, Math.floor(Math.log10(rangeUm)))
      return [mag, mag*2, mag*5].find(c => c/rangeUm < 0.4) ?? mag
    })()
    const scaleH = (scaleUm / rangeUm) * (H/2 - PAD)
    ctx.strokeStyle = '#8bb8f8'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(W-6, H/2); ctx.lineTo(W-6, H/2 - scaleH); ctx.stroke()
    ctx.fillStyle = '#8bb8f8'; ctx.font = '8px monospace'; ctx.textAlign = 'right'
    ctx.fillText(`${scaleUm < 1 ? scaleUm.toFixed(2) : scaleUm} µm`, W-8, H/2 - scaleH/2 + 3)

    // Labels h
    ctx.fillStyle = '#4a6a7a'; ctx.font = '8px monospace'; ctx.textAlign = 'center'
    ctx.fillText('h=−1', PAD, H-3)
    ctx.fillText('h=+1', W-PAD, H-3)
  }, [fanData, mmPerPx])

  // ── Dessin de la LCA ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = lcaRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const PAD = 18

    ctx.fillStyle = '#0a1520'
    ctx.fillRect(0, 0, W, H)

    // Axe horizontal Δfocus=0
    ctx.strokeStyle = '#1a3040'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke()

    if (lcaData.length < 2) {
      ctx.fillStyle = '#4a6a7a'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
      ctx.fillText('Aucune donnée', W/2, H/2 + 4)
      return
    }

    // Référence : focus à 550 nm (ou median)
    const ref550 = lcaData.find(p => Math.abs(p.wavelength - 550) < 30) ?? lcaData[Math.floor(lcaData.length/2)]
    const shifts = lcaData.map(p => (p.focusX - ref550.focusX) * mmPerPx * 1000)  // µm
    const maxAbsUm = Math.max(Math.abs(Math.min(...shifts)), Math.abs(Math.max(...shifts)), 0.001)
    const rangeUm  = maxAbsUm * 1.3

    const wlMin = 440, wlMax = 700
    function toX(wl: number)   { return PAD + ((wl - wlMin) / (wlMax - wlMin)) * (W - 2*PAD) }
    function toY(shiftUm: number) { return H/2 - (shiftUm / rangeUm) * (H/2 - PAD) }

    // Courbe de focus en fonction de λ
    ctx.lineWidth = 1.5
    ctx.beginPath()
    let first = true
    for (let i = 0; i < lcaData.length; i++) {
      const cx = toX(lcaData[i].wavelength)
      const cy = toY(shifts[i])
      const c = wavelengthToColor(lcaData[i].wavelength, 0.9)
      if (first) { ctx.strokeStyle = c; ctx.moveTo(cx, cy); first = false }
      else {
        ctx.strokeStyle = c
        ctx.lineTo(cx, cy)
        ctx.stroke()
        ctx.beginPath(); ctx.moveTo(cx, cy)
      }
    }
    ctx.stroke()

    // Points colorés par λ
    for (let i = 0; i < lcaData.length; i++) {
      ctx.fillStyle = wavelengthToColor(lcaData[i].wavelength, 1)
      ctx.beginPath(); ctx.arc(toX(lcaData[i].wavelength), toY(shifts[i]), 2.5, 0, Math.PI*2); ctx.fill()
    }

    // Barre d'échelle
    const scaleUm = (() => {
      const mag = Math.pow(10, Math.floor(Math.log10(rangeUm)))
      return [mag, mag*2, mag*5].find(c => c/rangeUm < 0.4) ?? mag
    })()
    const scaleH = (scaleUm / rangeUm) * (H/2 - PAD)
    ctx.strokeStyle = '#8bb8f8'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(W-6, H/2); ctx.lineTo(W-6, H/2 - scaleH); ctx.stroke()
    ctx.fillStyle = '#8bb8f8'; ctx.font = '8px monospace'; ctx.textAlign = 'right'
    ctx.fillText(`${scaleUm < 1 ? scaleUm.toFixed(2) : scaleUm} µm`, W-8, H/2 - scaleH/2 + 3)

    // Étiquettes λ
    ctx.font = '8px monospace'; ctx.textAlign = 'center'
    for (const wl of [440, 550, 656, 700]) {
      const cx = toX(wl)
      if (cx < PAD || cx > W-PAD) continue
      ctx.fillStyle = wavelengthToColor(wl, 0.7)
      ctx.fillText(`${wl}`, cx, H-3)
    }
  }, [lcaData, mmPerPx])

  // ── Dessin du spot diagram ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = spotRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width, H = canvas.height
    const PAD = 18

    ctx.fillStyle = '#0a1520'
    ctx.fillRect(0, 0, W, H)

    // Axe central
    ctx.strokeStyle = '#1a3040'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke()

    if (spotData.points.length === 0) {
      ctx.fillStyle = '#4a6a7a'
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Aucun rayon intercepté', W / 2, H / 2 + 4)
      return
    }

    // Échelle : max aberration + 20% de marge, en µm
    const maxUm = Math.max(spotData.maxRadius * mmPerPx * 1000, 0.001)
    const rangeUm = maxUm * 1.3
    const halfH   = (H / 2) - PAD

    function toY(yPx: number): number {
      const yUm = (yPx - spotData.centroid) * mmPerPx * 1000
      return H / 2 - (yUm / rangeUm) * halfH
    }

    // Lignes ±RMS
    if (spotData.rmsRadius > 0) {
      const rmsUm = spotData.rmsRadius * mmPerPx * 1000
      const yRms  = H / 2 - (rmsUm / rangeUm) * halfH
      ctx.strokeStyle = 'rgba(255, 230, 60, 0.55)'
      ctx.lineWidth   = 1
      ctx.setLineDash([4, 3])
      for (const yLine of [yRms, H - yRms]) {
        ctx.beginPath(); ctx.moveTo(PAD, yLine); ctx.lineTo(W - PAD, yLine); ctx.stroke()
      }
      ctx.setLineDash([])
    }

    // Points — une colonne par longueur d'onde
    const wavelengths = [...new Set(spotData.points.map(p => p.wavelength))].sort((a, b) => a - b)
    const nWl = wavelengths.length
    const xStep = (W - 2 * PAD) / (nWl + 1)

    for (const pt of spotData.points) {
      const wi = wavelengths.indexOf(pt.wavelength)
      const px = PAD + (wi + 1) * xStep
      const py = toY(pt.y)
      ctx.fillStyle = wavelengthToColor(pt.wavelength, Math.min(1, pt.intensity * 1.5))
      ctx.beginPath()
      ctx.arc(px, py, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Barre d'échelle : 1 unité "ronde" en µm
    const scaleBarUm = (() => {
      const mag = Math.pow(10, Math.floor(Math.log10(rangeUm)))
      const candidates = [mag, mag * 2, mag * 5]
      return candidates.find(c => c / rangeUm < 0.4) ?? mag
    })()
    const scaleBarH = (scaleBarUm / rangeUm) * halfH

    ctx.strokeStyle = '#8bb8f8'
    ctx.lineWidth   = 2
    ctx.beginPath()
    ctx.moveTo(W - 8, H / 2)
    ctx.lineTo(W - 8, H / 2 - scaleBarH)
    ctx.stroke()
    ctx.fillStyle  = '#8bb8f8'
    ctx.font       = '8px monospace'
    ctx.textAlign  = 'right'
    ctx.fillText(`${scaleBarUm < 1 ? scaleBarUm.toFixed(2) : scaleBarUm} µm`, W - 10, H / 2 - scaleBarH / 2 + 3)

    // Labels longueurs d'onde (bas)
    ctx.font      = '8px monospace'
    ctx.textAlign = 'center'
    for (let wi = 0; wi < nWl; wi++) {
      const px = PAD + (wi + 1) * xStep
      ctx.fillStyle = wavelengthToColor(wavelengths[wi], 1)
      ctx.fillText(`${wavelengths[wi]}`, px, H - 3)
    }
  }, [spotData, mmPerPx])

  const rmsUm = (spotData.rmsRadius * mmPerPx * 1000)
  const maxUm = (spotData.maxRadius * mmPerPx * 1000)

  return <>
    <Slider label="Angle axe" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { el.angle = v * DEG; onUpdate() }} />
    <Slider label="Demi-hauteur" value={u.toD(el.height)} min={u.toD(20)} max={u.toD(600)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.height = u.toI(v); onUpdate() }} />
    <Slider label="Position axiale" value={u.toD(axialPx)} min={u.toD(-2000)} max={u.toD(5000)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={setAxial} />

    {/* Spot diagram */}
    <div className="props-section">Spot diagram</div>
    <canvas
      ref={spotRef}
      width={200} height={150}
      style={{ display: 'block', margin: '4px auto', borderRadius: 4, border: '1px solid #1e3040' }}
    />
    <div className="prop-row">
      <div className="prop-header">
        <span className="prop-label">RMS radius</span>
        <span className="prop-value" style={{ color: rmsUm < 1 ? '#40e080' : rmsUm < 10 ? '#f0c040' : '#f06060' }}>
          {rmsUm < 0.01 ? rmsUm.toExponential(2) : rmsUm.toFixed(2)} µm
        </span>
      </div>
    </div>
    <div className="prop-row">
      <div className="prop-header">
        <span className="prop-label">Max radius</span>
        <span className="prop-value" style={{ color: '#8bb8f8' }}>
          {maxUm < 0.01 ? maxUm.toExponential(2) : maxUm.toFixed(2)} µm
        </span>
      </div>
    </div>
    <div className="prop-row">
      <div className="prop-header">
        <span className="prop-label">N rayons</span>
        <span className="prop-value" style={{ color: '#8bb8f8' }}>{spotData.points.length}</span>
      </div>
    </div>

    {/* Auto-focus */}
    <div className="props-section">Mise au point auto</div>
    <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
      <button
        onClick={handleAutoFocus}
        style={{
          width: '80%', padding: '5px 0', cursor: 'pointer',
          background: 'rgba(40,120,255,0.25)', border: '1px solid rgba(96,200,255,0.5)',
          borderRadius: 4, color: '#c8e8ff', fontSize: 12, fontWeight: 700,
        }}
      >
        ⊕ Auto-focus
      </button>
    </div>
    {focusResult && <>
      <div className="prop-row">
        <div className="prop-header">
          <span className="prop-label">RMS avant</span>
          <span className="prop-value" style={{ color: '#f0c040' }}>
            {focusResult.rmsBefore < 0.01
              ? focusResult.rmsBefore.toExponential(2)
              : focusResult.rmsBefore.toFixed(2)} µm
          </span>
        </div>
      </div>
      <div className="prop-row">
        <div className="prop-header">
          <span className="prop-label">RMS après</span>
          <span className="prop-value" style={{
            color: focusResult.rmsAfter <= focusResult.rmsBefore ? '#40e080' : '#f06060',
          }}>
            {focusResult.rmsAfter < 0.01
              ? focusResult.rmsAfter.toExponential(2)
              : focusResult.rmsAfter.toFixed(2)} µm
          </span>
        </div>
      </div>
    </>}
    <canvas
      ref={focusCurveRef}
      width={200} height={100}
      style={{ display: 'block', margin: '4px auto', borderRadius: 4, border: '1px solid #1e3040' }}
    />

    {/* Ray fan */}
    <div className="props-section">Ray fan  Δy(h)</div>
    <canvas
      ref={fanRef}
      width={200} height={120}
      style={{ display: 'block', margin: '4px auto', borderRadius: 4, border: '1px solid #1e3040' }}
    />

    {/* LCA */}
    <div className="props-section">Chromatique longitudinale</div>
    <canvas
      ref={lcaRef}
      width={200} height={100}
      style={{ display: 'block', margin: '4px auto', borderRadius: 4, border: '1px solid #1e3040' }}
    />
    {lcaData.length >= 2 && (() => {
      const focii = lcaData.map(p => p.focusX)
      const lcaUm = (Math.max(...focii) - Math.min(...focii)) * mmPerPx * 1000
      return (
        <div className="prop-row">
          <div className="prop-header">
            <span className="prop-label">ACL (440–700 nm)</span>
            <span className="prop-value" style={{ color: lcaUm < 10 ? '#40e080' : lcaUm < 100 ? '#f0c040' : '#f06060' }}>
              {lcaUm < 0.1 ? lcaUm.toExponential(2) : lcaUm.toFixed(1)} µm
            </span>
          </div>
        </div>
      )
    })()}
  </>
}

// ─────────────────────────────────────────────────────────────────────────────
// AperturePanel — diaphragme (Phase 7C)
// ─────────────────────────────────────────────────────────────────────────────

function AperturePanel({ el, onUpdate, u, scene }: { el: ApertureElement; onUpdate: () => void; u: UnitCtx; scene: Scene | null }) {
  const pupils = scene ? computePupils(scene, -500, 550) : null

  return <>
    <Slider label="Angle" value={el.angle * RAD} min={-180} max={180} step={0.1} unit="°"
      onChange={v => { el.angle = v * DEG; onUpdate() }} />
    <Slider label="Diamètre total" value={u.toD(el.diameter)} min={u.toD(20)} max={u.toD(600)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.diameter = u.toI(v); el.clearRadius = Math.min(el.clearRadius, el.diameter / 2); onUpdate() }} />
    <Slider label="Rayon ouverture" value={u.toD(el.clearRadius)} min={u.toD(1)} max={u.toD(el.diameter / 2)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { el.clearRadius = u.toI(v); onUpdate() }} />

    {pupils && <>
      <div className="prop-row">
        <span className="prop-label">f/N</span>
        <span className="prop-value">{pupils.fNumber !== null ? `f/${pupils.fNumber.toFixed(1)}` : '—'}</span>
      </div>
      <div className="prop-row">
        <span className="prop-label">NA image</span>
        <span className="prop-value">{pupils.NA !== null ? pupils.NA.toFixed(3) : '—'}</span>
      </div>
      <div className="prop-row">
        <span className="prop-label">EFL</span>
        <span className="prop-value">{pupils.efl !== null ? `${u.toD(Math.abs(pupils.efl)).toFixed(u.digits)} ${u.unit}` : '—'}</span>
      </div>
      <div className="prop-row">
        <span className="prop-label">Pupille entrée x</span>
        <span className="prop-value">{u.toD(pupils.entrancePupilX).toFixed(u.digits)} {u.unit}</span>
      </div>
      <div className="prop-row">
        <span className="prop-label">Pupille sortie x</span>
        <span className="prop-value">{u.toD(pupils.exitPupilX).toFixed(u.digits)} {u.unit}</span>
      </div>
    </>}
  </>
}

// ─────────────────────────────────────────────────────────────────────────────
// OpticalObjectPanel — flèche objet (Phase 7C)
// ─────────────────────────────────────────────────────────────────────────────

function OpticalObjectPanel({ src, onUpdate, u, scene }: { src: OpticalObject; onUpdate: () => void; u: UnitCtx; scene: Scene | null }) {
  // La pointe de l'objet est à position.y − height (perpDir = +y avec angle=0).
  // L'axe optique est à position.y. On passe les coordonnées absolues à computeImage.
  const imgResult = scene && src.mode === 'finite'
    ? computeImage(scene, src.position.x, src.position.y - src.height, src.wavelengths[0] ?? 550, 0.005, src.position.y)
    : null
  const efl = scene ? computeEFL(scene, src.wavelengths[0] ?? 550, src.position.x - 100, 10) : null

  const modeOptions: Array<{ value: 'finite' | 'infinite'; label: string }> = [
    { value: 'finite',   label: 'Fini (flèche)' },
    { value: 'infinite', label: 'Infini (ondes planes)' },
  ]

  return <>
    <div className="prop-row">
      <span className="prop-label">Mode</span>
      <select className="prop-material-select"
        value={src.mode}
        onChange={e => { src.mode = e.target.value as 'finite' | 'infinite'; onUpdate() }}
      >
        {modeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
    <Slider label={src.mode === 'finite' ? 'Hauteur objet' : 'Demi-angle champ'} value={src.mode === 'finite' ? u.toD(src.height) : src.height * RAD} min={src.mode === 'finite' ? u.toD(1) : 0.1} max={src.mode === 'finite' ? u.toD(300) : 30} step={src.mode === 'finite' ? u.step : 0.1} unit={src.mode === 'finite' ? u.unit : '°'} digits={src.mode === 'finite' ? u.digits : 1}
      onChange={v => { src.height = src.mode === 'finite' ? u.toI(v) : v * DEG; onUpdate() }} />
    <Slider label="Angle axe" value={src.angle * RAD} min={-30} max={30} step={0.1} unit="°"
      onChange={v => { src.angle = v * DEG; onUpdate() }} />
    <Slider label="Nb rayons" value={src.numRays} min={1} max={21} step={1} digits={0}
      onChange={v => { src.numRays = v; onUpdate() }} />
    {src.mode === 'finite' && <Slider label="Éventail (demi-angle)" value={src.spreadAngle * RAD} min={1} max={60} step={0.5} unit="°"
      onChange={v => { src.spreadAngle = v * DEG; onUpdate() }} />}
    {src.mode === 'infinite' && <Slider label="Largeur faisceau" value={u.toD(src.width)} min={u.toD(20)} max={u.toD(600)} step={u.step} unit={u.unit} digits={u.digits}
      onChange={v => { src.width = u.toI(v); onUpdate() }} />}
    <div className="prop-row">
      <span className="prop-label">Points de champ</span>
      <select className="prop-material-select"
        value={src.numFieldPoints}
        onChange={e => { src.numFieldPoints = parseInt(e.target.value, 10); onUpdate() }}
      >
        <option value={1}>1 (sommet)</option>
        <option value={2}>2 (base + sommet)</option>
        <option value={3}>3 (base + mi + sommet)</option>
      </select>
    </div>
    <WavelengthPicker wavelengths={src.wavelengths} onChange={wl => { src.wavelengths = wl; onUpdate() }} />

    {/* Image calculée */}
    {imgResult && imgResult.imageX !== null && <>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '6px 0' }} />
      <div className="prop-row">
        <span className="prop-label">Image x</span>
        <span className="prop-value" style={{ color: imgResult.isReal ? '#80ff80' : '#ffaa60' }}>
          {u.toD(imgResult.imageX).toFixed(u.digits)} {u.unit} {imgResult.isReal ? '(réelle)' : '(virtuelle)'}
        </span>
      </div>
      {imgResult.magnification !== null && <div className="prop-row">
        <span className="prop-label">Grandissement</span>
        <span className="prop-value">{imgResult.magnification.toFixed(3)}×</span>
      </div>}
      {efl !== null && <div className="prop-row">
        <span className="prop-label">EFL système</span>
        <span className="prop-value">{u.toD(Math.abs(efl)).toFixed(u.digits)} {u.unit}</span>
      </div>}
    </>}
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
    <PolarizationSelect value={src.polarization} onChange={v => { src.polarization = v; onUpdate() }} />
  </>
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────

export function PropertiesPanel({ scene, selectedId, onUpdate, onDelete, useMm, scale, traceResults }: Props) {
  if (!scene || !selectedId) {
    return (
      <div className="props-panel">
        <div className="props-empty">
          Cliquer sur un élément ou une source pour voir ses propriétés
        </div>
      </div>
    )
  }

  const u = makeUnitCtx(useMm ?? false, scale ?? 1)

  const element = scene.elements.find(e => e.id === selectedId) ?? null
  const source  = scene.sources.find(s => s.id === selectedId) ?? null

  function renderElementProps(el: OpticalElement) {
    if (el instanceof FlatMirror)    return <FlatMirrorPanel    el={el}  onUpdate={onUpdate} u={u} />
    if (el instanceof ThinLens)      return <ThinLensPanel      el={el}  onUpdate={onUpdate} u={u} scene={scene} />
    if (el instanceof Block)         return <BlockPanel         el={el}  onUpdate={onUpdate} u={u} />
    if (el instanceof Prism)         return <PrismPanel         el={el}  onUpdate={onUpdate} u={u} />
    if (el instanceof CurvedMirror)  return <CurvedMirrorPanel  el={el}  onUpdate={onUpdate} u={u} />
    if (el instanceof ThickLens)     return <ThickLensPanel     el={el}  onUpdate={onUpdate} u={u} scene={scene} />
    if (el instanceof ConicMirror)   return <ConicMirrorPanel   el={el}  onUpdate={onUpdate} u={u} />
    if (el instanceof GRINElement)      return <GRINMediumPanel    el={el}  onUpdate={onUpdate} u={u} />
    if (el instanceof ImagePlane)       return <ImagePlanePanel    el={el}  onUpdate={onUpdate} u={u} mmPerPx={scale ?? 1} results={traceResults ?? []} scene={scene} />
    if (el instanceof ApertureElement)  return <AperturePanel      el={el}  onUpdate={onUpdate} u={u} scene={scene} />
    return null
  }

  function renderSourceProps(src: LightSource) {
    if (src instanceof BeamSource)    return <BeamSourcePanel    src={src} onUpdate={onUpdate} u={u} />
    if (src instanceof PointSource)   return <PointSourcePanel   src={src} onUpdate={onUpdate} />
    if (src instanceof OpticalObject) return <OpticalObjectPanel src={src} onUpdate={onUpdate} u={u} scene={scene} />
    return null
  }

  const target = element ?? source
  if (!target) return null

  const typeLabel = element
    ? ({ 'flat-mirror': 'Miroir plan', 'thin-lens': 'Lentille mince', 'block': 'Bloc', 'prism': 'Prisme', 'curved-mirror': 'Miroir courbe', 'thick-lens': 'Lentille épaisse', 'conic-mirror': 'Miroir conique', 'grin': 'Milieu GRIN', 'image-plane': 'Plan image', 'aperture': 'Diaphragme' }[element.type] ?? element.type)
    : ({ 'beam': 'Source faisceau', 'point': 'Source ponctuelle', 'object': 'Objet optique' }[source!.type] ?? source!.type)

  return (
    <div className="props-panel">
      <div className="props-title">{typeLabel}</div>

      {/* Position */}
      <div className="props-section">Position</div>
      <Slider label="X" value={u.toD(target.position.x)} min={u.toD(-2000)} max={u.toD(5000)} step={u.step} unit={u.unit} digits={u.digits}
        onChange={v => { target.position = { ...target.position, x: u.toI(v) }; onUpdate() }} />
      <Slider label="Y" value={u.toD(target.position.y)} min={u.toD(-2000)} max={u.toD(4000)} step={u.step} unit={u.unit} digits={u.digits}
        onChange={v => { target.position = { ...target.position, y: u.toI(v) }; onUpdate() }} />

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
