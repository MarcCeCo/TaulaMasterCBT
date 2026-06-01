import { useState } from 'react'
import { useQuery, upsertRow } from '../hooks/useSupabase'
import Loader from '../components/shared/Loader'
import StatCard from '../components/shared/StatCard'
import { TrendingUp, TrendingDown, DollarSign, Plus, X, Check, Pencil, ChevronDown, ChevronUp } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, LineChart, Line
} from 'recharts'
import { ASSETS, EMPTY_FORM } from './inversionsConstants'

function fmt(v) { return new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v) }
function fmtPct(v) { return (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%' }
function n(v) { return parseFloat(v) || 0 }

function getYearFromPeriode(periode) {
  if (!periode) return null
  // Accepta formats com "gen 25", "des 2025", "jan 25"
  const m = String(periode).match(/(\d{2,4})$/)
  if (!m) return null
  const y = parseInt(m[1])
  return y < 100 ? 2000 + y : y
}

// ── CAGR: rendibilitat anualitzada des de l'inici ──────────────────────────
// "A quin ritme anual ha crescut des del principi?"
// Limitació: assumeix capital aportat tot el dia 1. Si fas DCA, sobreestima.
function calcCAGR(invertit, valor, mesos) {
  if (invertit <= 0 || valor <= 0 || mesos <= 0) return 0
  const anys = mesos / 12
  return Math.pow(valor / invertit, 1 / anys) - 1
}

// ── YTD: % variació anual seguint criteri full Excel ────────────────────────
// Fórmula Excel columna P:
//   Gener (1r mes any): 0
//   Resta de mesos: (valor_actual - (inversio_actual + benefici_1gen)) / (inversio_actual + benefici_1gen)
//   On benefici_1gen = valor_1gen - inversio_1gen (el benefici acumulat a 1 de gener)
//   Si no hi ha any anterior (primer any de dades): base = inversio_total del 1r mes
function calcYTD(dataArr, currentIndex) {
  if (!dataArr || currentIndex < 0 || currentIndex >= dataArr.length) return 0
  const current = dataArr[currentIndex]
  const currentYear = getYearFromPeriode(current.periode)
  if (!currentYear) return 0

  // Detecta si és el primer mes de l'any (gener)
  const periodeStr = String(current.periode).toLowerCase().trim()
  const isJanuary = periodeStr.startsWith('gen') || periodeStr.startsWith('jan') || periodeStr.startsWith('ene')
  if (isJanuary) return 0

  // Troba el primer mes de l'any actual (gener)
  const yearRows = dataArr.filter(r => getYearFromPeriode(r.periode) === currentYear)
  const janRow = yearRows[0] // primer mes de l'any = gener

  let base
  if (janRow) {
    // base = inversió_actual + benefici_1gen
    // benefici_1gen = valor_1gen - inversio_1gen
    const beneficiJan = n(janRow.valor_total) - n(janRow.inversio_total)
    base = n(current.inversio_total) + beneficiJan
  } else {
    // No hi ha gener per a aquest any: usa inversio_total del primer mes disponible
    base = n(dataArr[0].inversio_total)
  }

  if (base <= 0) return 0
  return n(current.valor_total) / base - 1
}

// calcYearReturn: mateix criteri que calcYTD però per al tancament de l'any.
// Usa el darrer mes disponible de l'any com a "actual" i aplica la mateixa base:
//   base = inversio_endRow + benefici_1gen
function calcYearReturn(dataArr, year) {
  if (!dataArr || dataArr.length === 0) return null
  const yearRows = dataArr.filter(r => getYearFromPeriode(r.periode) === year)
  if (yearRows.length === 0) return null

  const endRow = yearRows[yearRows.length - 1]
  const janRow = yearRows[0] // gener = primer mes de l'any

  // Si l'any té un sol mes (gener), retorna 0
  const endPeriode = String(endRow.periode).toLowerCase().trim()
  const isJanuary = endPeriode.startsWith('gen') || endPeriode.startsWith('jan') || endPeriode.startsWith('ene')
  if (isJanuary) return 0

  const beneficiJan = n(janRow.valor_total) - n(janRow.inversio_total)
  const base = n(endRow.inversio_total) + beneficiJan
  if (base <= 0) return null
  return n(endRow.valor_total) / base - 1
}

function NumInput({ value, onChange, placeholder = '0.00' }) {
  return (
    <input
      type="number" step="0.01" placeholder={placeholder}
      className="w-full px-2 py-1 rounded text-xs font-mono"
      style={{ background: 'var(--ink-700)', border: '1px solid var(--ink-600)', color: '#e8e8f0' }}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
}

function AssetBlock({ color, emoji, label, invertit, valor, onInvertit, onValor }) {
  return (
    <div className="space-y-2 p-3 rounded-lg" style={{ background: 'var(--ink-900)', border: `1px solid ${color}44` }}>
      <p className="text-xs font-semibold" style={{ color }}>{emoji} {label}</p>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Invertit (€)</label>
        <NumInput value={invertit} onChange={onInvertit} />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Valor actual (€)</label>
        <NumInput value={valor} onChange={onValor} />
      </div>
    </div>
  )
}

function FormRow({ form, setForm, onSave, onCancel, saving, error, title, titleColor }) {
  const f = (key) => (val) => setForm(prev => ({ ...prev, [key]: val }))
  const inversioTotal = n(form.rv_invertit) + n(form.btc_invertit) + n(form.eth_invertit) + n(form.gold_invertit)
  const valorTotal    = n(form.rv_valor)    + n(form.btc_valor)    + n(form.eth_valor)    + n(form.gold_valor)
  const benefici      = valorTotal - inversioTotal
  const rendTotal     = inversioTotal > 0 ? benefici / inversioTotal : 0

  return (
    <div className="card fade-up" style={{ borderColor: titleColor || 'var(--jade)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: titleColor || 'var(--jade)' }}>{title}</h3>
        <button onClick={onCancel} className="text-gray-500 hover:text-white"><X size={16} /></button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Període (ex: jun 26)</label>
          <input type="text" placeholder="jun 26"
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--ink-700)', border: '1px solid var(--ink-600)', color: '#e8e8f0' }}
            value={form.periode} onChange={e => f('periode')(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Any cartera (1=24, 2=25…)</label>
          <input type="number"
            className="w-full px-3 py-2 rounded-lg text-sm font-mono"
            style={{ background: 'var(--ink-700)', border: '1px solid var(--ink-600)', color: '#e8e8f0' }}
            value={form.any_cartera} onChange={e => f('any_cartera')(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Nº mes (seqüencial)</label>
          <input type="number" placeholder="25"
            className="w-full px-3 py-2 rounded-lg text-sm font-mono"
            style={{ background: 'var(--ink-700)', border: '1px solid var(--ink-600)', color: '#e8e8f0' }}
            value={form.mes_num} onChange={e => f('mes_num')(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AssetBlock color="#7b8cde" emoji="📈" label="RV"
          invertit={form.rv_invertit} valor={form.rv_valor}
          onInvertit={f('rv_invertit')} onValor={f('rv_valor')} />
        <AssetBlock color="#f7931a" emoji="₿" label="BTC"
          invertit={form.btc_invertit} valor={form.btc_valor}
          onInvertit={f('btc_invertit')} onValor={f('btc_valor')} />
        <AssetBlock color="#627eea" emoji="⟠" label="ETH"
          invertit={form.eth_invertit} valor={form.eth_valor}
          onInvertit={f('eth_invertit')} onValor={f('eth_valor')} />
        <AssetBlock color="#c9a84c" emoji="🥇" label="Or"
          invertit={form.gold_invertit} valor={form.gold_valor}
          onInvertit={f('gold_invertit')} onValor={f('gold_valor')} />
      </div>

      <div className="mt-4 p-3 rounded-lg flex flex-wrap gap-6" style={{ background: 'var(--ink-900)' }}>
        <div><p className="text-xs text-gray-500">Total invertit</p><p className="font-mono text-sm" style={{ color: 'var(--gold-light)' }}>{fmt(inversioTotal)}</p></div>
        <div><p className="text-xs text-gray-500">Valor total</p><p className="font-mono text-sm" style={{ color: 'var(--gold-light)' }}>{fmt(valorTotal)}</p></div>
        <div><p className="text-xs text-gray-500">Benefici / Pèrdua</p><p className={`font-mono text-sm ${benefici >= 0 ? 'positive' : 'negative'}`}>{benefici >= 0 ? '+' : ''}{fmt(benefici)}</p></div>
        <div><p className="text-xs text-gray-500">Rendibilitat total</p><p className={`font-mono text-sm ${rendTotal >= 0 ? 'positive' : 'negative'}`}>{fmtPct(rendTotal)}</p></div>
      </div>

      {error && <p className="text-red-400 text-xs mt-3">{error}</p>}

      <div className="flex gap-2 mt-4">
        <button onClick={() => onSave(inversioTotal, valorTotal, benefici, rendTotal)} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: titleColor || 'var(--jade)', color: 'var(--ink-950)', opacity: saving ? 0.7 : 1 }}>
          <Check size={14} /> {saving ? 'Desant...' : 'Desar'}
        </button>
        <button onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--ink-700)', color: '#aaa' }}>
          <X size={14} /> Cancel·lar
        </button>
      </div>
    </div>
  )
}

// ── Targeta de rendibilitat per actiu individual ───────────────────────────
function AssetRentCard({ asset, last, mesos }) {
  const inv = n(last[`${asset.key}_invertit`])
  const val = n(last[`${asset.key}_valor`])
  const ben = val - inv
  const rendTotal = inv > 0 ? ben / inv : 0
  const rendAnual = calcCAGR(inv, val, mesos)
  const positiu = ben >= 0

  return (
    <div className="card" style={{ borderLeft: `3px solid ${asset.color}` }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{asset.emoji}</span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: asset.color }}>{asset.label}</span>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Invertit</span>
          <span className="font-mono text-gray-300">{fmt(inv)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Valor actual</span>
          <span className="font-mono" style={{ color: 'var(--gold-light)' }}>{fmt(val)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Benefici</span>
          <span className={`font-mono font-semibold ${positiu ? 'positive' : 'negative'}`}>
            {positiu ? '+' : ''}{fmt(ben)}
          </span>
        </div>
        <div style={{ borderTop: '1px solid var(--ink-700)', paddingTop: '0.5rem', marginTop: '0.5rem' }}
          className="flex justify-between text-xs">
          <span className="text-gray-500">Rend. total</span>
          <span className={`font-mono font-semibold ${rendTotal >= 0 ? 'positive' : 'negative'}`}>{fmtPct(rendTotal)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Rend. anual (CAGR)</span>
          <span className={`font-mono font-semibold ${rendAnual >= 0 ? 'positive' : 'negative'}`}>{fmtPct(rendAnual)}</span>
        </div>
      </div>
    </div>
  )
}

export default function Inversions() {
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [editingId, setEditingId]   = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [editForm, setEditForm]     = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState(null)
  const [refresh, setRefresh]       = useState(0)
  const [selectedYear, setSelectedYear] = useState(null)

  // La cartera ara és sempre la mateixa (sense distinció Marc/Gemma/Bruna)
  const CARTERA = 'Marc i Gemma'

  const { data, loading } = useQuery('inversions', {
    order: 'mes_num',
    ascending: true,
  }, refresh)

  async function saveRow(row) {
    const { error: err } = await upsertRow('inversions', { ...row, cartera: CARTERA })
    return err
  }

  async function handleSave(inversioTotal, valorTotal, benefici, rendTotal) {
    if (!form.periode || !form.mes_num) { setError('Omple el període i el número de mes.'); return }
    setSaving(true); setError(null)
    const mesos = n(form.mes_num)
    const cagr  = calcCAGR(inversioTotal, valorTotal, mesos)
    const err = await saveRow({
      periode: form.periode, any_cartera: n(form.any_cartera), mes_num: mesos,
      rv_invertit: n(form.rv_invertit), rv_valor: n(form.rv_valor),
      btc_invertit: n(form.btc_invertit), btc_valor: n(form.btc_valor),
      eth_invertit: n(form.eth_invertit), eth_valor: n(form.eth_valor),
      gold_invertit: n(form.gold_invertit), gold_valor: n(form.gold_valor),
      inversio_total: inversioTotal, valor_total: valorTotal,
      benefici, rendibilitat_anual: cagr, rendibilitat_total: rendTotal,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowForm(false); setForm(EMPTY_FORM); setRefresh(r => r + 1)
  }

  async function handleEditSave(inversioTotal, valorTotal, benefici, rendTotal) {
    if (!editForm.periode || !editForm.mes_num) { setError('Omple el període i el número de mes.'); return }
    setSaving(true); setError(null)
    const mesos = n(editForm.mes_num)
    const cagr  = calcCAGR(inversioTotal, valorTotal, mesos)
    const err = await saveRow({
      id: editingId,
      periode: editForm.periode, any_cartera: n(editForm.any_cartera), mes_num: mesos,
      rv_invertit: n(editForm.rv_invertit), rv_valor: n(editForm.rv_valor),
      btc_invertit: n(editForm.btc_invertit), btc_valor: n(editForm.btc_valor),
      eth_invertit: n(editForm.eth_invertit), eth_valor: n(editForm.eth_valor),
      gold_invertit: n(editForm.gold_invertit), gold_valor: n(editForm.gold_valor),
      inversio_total: inversioTotal, valor_total: valorTotal,
      benefici, rendibilitat_anual: cagr, rendibilitat_total: rendTotal,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setEditingId(null); setRefresh(r => r + 1)
  }

  function startEdit(row) {
    setEditingId(row.id)
    setEditForm({
      periode: row.periode, any_cartera: row.any_cartera, mes_num: row.mes_num,
      rv_invertit: String(row.rv_invertit), rv_valor: String(row.rv_valor),
      btc_invertit: String(row.btc_invertit), btc_valor: String(row.btc_valor),
      eth_invertit: String(row.eth_invertit), eth_valor: String(row.eth_valor),
      gold_invertit: String(row.gold_invertit), gold_valor: String(row.gold_valor),
    })
  }

  if (loading) return <Loader />

  const last   = data[data.length - 1]
  const mesos  = last ? n(last.mes_num) : 0

  // Stats globals
  const rendTotal    = last ? n(last.rendibilitat_total) : 0
  // Mitjana mensual invertida: diferència d'inversió entre mesos / nombre de mesos amb aportació
  const avgMonthly = (() => {
    if (data.length < 2) return last ? n(last.inversio_total) : 0
    const aportacions = data.slice(1).map((r, i) => n(r.inversio_total) - n(data[i].inversio_total)).filter(d => d > 0)
    return aportacions.length > 0 ? aportacions.reduce((s, v) => s + v, 0) / aportacions.length : 0
  })()

  // Anys disponibles per al selector
  const availableYears = [...new Set(data.map(r => getYearFromPeriode(r.periode)).filter(Boolean))].sort()
  const currentYear = availableYears[availableYears.length - 1] || new Date().getFullYear()
  const activeYear = selectedYear || currentYear

  // Rendibilitat de l'any natural seleccionat
  const yearReturn = last ? calcYearReturn(data, activeYear) : null
  const yearRows = data.filter(r => getYearFromPeriode(r.periode) === activeYear)
  const yearLabel = yearRows.length > 0 && yearRows[yearRows.length - 1].periode !== yearRows[0].periode
    ? `${yearRows[0].periode} → ${yearRows[yearRows.length - 1].periode}`
    : yearRows.length > 0 ? yearRows[0].periode : String(activeYear)

  // Dades per als gràfics
  const areaData = data.map(r => ({
    periode: r.periode,
    Invertit: n(r.inversio_total),
    Valor: n(r.valor_total),
  }))

  const barData = data.map(r => ({
    periode: r.periode,
    RV:  n(r.rv_valor),
    BTC: n(r.btc_valor),
    ETH: n(r.eth_valor),
    Or:  n(r.gold_valor),
  }))

  return (
    <div className="space-y-8 fade-up">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: '2rem', color: 'var(--gold-light)' }}>
            Inversions
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Evolució de la cartera · {mesos} {mesos === 1 ? 'mes' : 'mesos'}
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setForm(EMPTY_FORM) }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--jade)', color: 'var(--ink-950)' }}>
          <Plus size={14} /> Afegir mes
        </button>
      </div>

      {/* ── Formulari nou ──────────────────────────────────────── */}
      {showForm && (
        <FormRow form={form} setForm={setForm}
          onSave={handleSave} onCancel={() => setShowForm(false)}
          saving={saving} error={error} title="Nou registre mensual" />
      )}

      {last && <>

        {/* ── KPIs globals ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Valor actual"    value={fmt(last.valor_total)}    sub={last.periode}        icon={DollarSign} />
          <StatCard label="Total invertit"  value={fmt(last.inversio_total)} sub="capital aportat"      color="#9ecfea" icon={TrendingUp} />
          <StatCard label="Rendibilitat total"
            value={fmtPct(rendTotal)}
            sub="des de l'inici"
            color={rendTotal >= 0 ? 'var(--jade)' : 'var(--coral)'}
            icon={rendTotal >= 0 ? TrendingUp : TrendingDown} />
          <StatCard label="Mitjana mensual"
            value={fmt(avgMonthly)}
            sub={`${data.length} mesos · aportació/mes`}
            color="#d4a0f0"
            icon={TrendingUp} />
        </div>

        {/* ── Rendibilitat any natural ────────────────────────────── */}
        <div className="card" style={{ borderColor: 'var(--gold)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-sm uppercase tracking-widest text-gray-400">Rendibilitat any natural</h2>
            <div className="flex gap-2 flex-wrap">
              {availableYears.map(y => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: activeYear === y ? 'var(--gold)' : 'var(--ink-700)',
                    color: activeYear === y ? 'var(--ink-950)' : '#aaa',
                    border: activeYear === y ? 'none' : '1px solid var(--ink-600)',
                  }}>
                  {y}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-8 items-center">
            <div>
              <p className="text-xs text-gray-500 mb-1">Rendibilitat {activeYear}</p>
              <p className={`text-3xl font-mono font-bold ${yearReturn === null ? 'text-gray-500' : yearReturn >= 0 ? 'positive' : 'negative'}`}>
                {yearReturn !== null ? fmtPct(yearReturn) : '—'}
              </p>
              <p className="text-xs text-gray-600 mt-1">{yearLabel}</p>
            </div>
            {yearReturn !== null && (() => {
              const endRow = yearRows[yearRows.length - 1]
              const janRow = yearRows[0]
              return (
                <div className="flex flex-wrap gap-5">
                  {ASSETS.map(a => {
                    const endVal  = n(endRow[`${a.key}_valor`])
                    // YTD per actiu: (valor_actual - (invertit_actual + benefici_gen)) / base
                    const endPer  = String(endRow.periode).toLowerCase().trim()
                    const isJan   = endPer.startsWith('gen') || endPer.startsWith('jan') || endPer.startsWith('ene')
                    let ret = null
                    if (isJan) {
                      ret = 0
                    } else {
                      const beneficiJan = n(janRow[`${a.key}_valor`]) - n(janRow[`${a.key}_invertit`])
                      const base = n(endRow[`${a.key}_invertit`]) + beneficiJan
                      ret = base > 0 ? endVal / base - 1 : null
                    }
                    return (
                      <div key={a.key} className="text-center">
                        <p className="text-base mb-0.5">{a.emoji}</p>
                        <p className="text-xs text-gray-500 mb-1">{a.label}</p>
                        <p className={`text-sm font-mono font-semibold ${ret === null ? 'text-gray-500' : ret >= 0 ? 'positive' : 'negative'}`}>
                          {ret !== null ? fmtPct(ret) : '—'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>


        {/* ── Gràfic: invertit vs valor ───────────────────────────── */}
        <div className="card">
          <h2 className="text-sm uppercase tracking-widest text-gray-400 mb-4">Evolució invertit vs valor</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={areaData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gInv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--gold)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--gold)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gVal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--jade)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--jade)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-600)" />
              <XAxis dataKey="periode" tick={{ fontSize: 10, fill: '#888' }} interval={2} />
              <YAxis tick={{ fontSize: 10, fill: '#888' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k€`} />
              <Tooltip formatter={(v, name) => [fmt(v), name]}
                contentStyle={{ background: 'var(--ink-800)', border: '1px solid var(--ink-600)', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#aaa' }} />
              <Area type="monotone" dataKey="Invertit" stroke="var(--gold)" fill="url(#gInv)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Valor"    stroke="var(--jade)" fill="url(#gVal)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>


        {/* ── Gràfic: composició per actiu ───────────────────────── */}
        <div className="card">
          <h2 className="text-sm uppercase tracking-widest text-gray-400 mb-4">Composició per actiu (€)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={barData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gRV"   x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#7b8cde" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#7b8cde" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gBTC"  x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f7931a" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#f7931a" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gETH"  x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#627eea" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#627eea" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gOr"   x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#c9a84c" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-600)" />
              <XAxis dataKey="periode" tick={{ fontSize: 10, fill: '#888' }} interval={2} />
              <YAxis tick={{ fontSize: 10, fill: '#888' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k€`} />
              <Tooltip formatter={(v, name) => [fmt(v), name]}
                contentStyle={{ background: 'var(--ink-800)', border: '1px solid var(--ink-600)', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#aaa' }} />
              <Area type="monotone" dataKey="RV"  stroke="#7b8cde" fill="url(#gRV)"  strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="BTC" stroke="#f7931a" fill="url(#gBTC)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="ETH" stroke="#627eea" fill="url(#gETH)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Or"  stroke="#c9a84c" fill="url(#gOr)"  strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── Historial editable ─────────────────────────────────── */}
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--ink-700)' }}>
            <h2 className="text-sm uppercase tracking-widest text-gray-400">Historial</h2>
          </div>
          <div className="overflow-auto" style={{ maxHeight: '420px' }}>
            <table className="w-full text-xs">
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--ink-900)' }}>
                <tr style={{ borderBottom: '1px solid var(--ink-700)' }}>
                  {['Període', 'Invertit', 'Valor', 'Benefici', 'Total', 'Anual YTD', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((r, i) => {
                  const ben        = n(r.valor_total) - n(r.inversio_total)
                  const dataIdx    = data.length - 1 - i  // data is reversed in render
                  const cagr       = calcYTD(data, dataIdx)
                  const isExpanded = expandedId === r.id
                  const isEditing  = editingId  === r.id

                  return (
                    <>
                      {/* Fila principal clicable */}
                      <tr key={r.id}
                        onClick={() => { if (!isEditing) setExpandedId(isExpanded ? null : r.id) }}
                        style={{
                          borderBottom: isExpanded ? 'none' : '1px solid var(--ink-700)',
                          background: isExpanded
                            ? 'rgba(123,140,222,0.08)'
                            : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                          cursor: 'pointer',
                        }}
                        className="group transition-colors hover:bg-white/5">
                        <td className="px-4 py-2.5 font-medium" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <ChevronDown size={12} className="text-gray-500"
                            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }} />
                          {r.periode}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-300">{fmt(r.inversio_total)}</td>
                        <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--gold-light)' }}>{fmt(r.valor_total)}</td>
                        <td className={`px-4 py-2.5 font-mono ${ben >= 0 ? 'positive' : 'negative'}`}>
                          {ben >= 0 ? '+' : ''}{fmt(ben)}
                        </td>
                        <td className={`px-4 py-2.5 font-mono ${r.rendibilitat_total >= 0 ? 'positive' : 'negative'}`}>
                          {fmtPct(r.rendibilitat_total)}
                        </td>
                        <td className={`px-4 py-2.5 font-mono ${cagr >= 0 ? 'positive' : 'negative'}`}>
                          {fmtPct(cagr)}
                        </td>
                        <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setExpandedId(null); isEditing ? setEditingId(null) : startEdit(r) }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10">
                            <Pencil size={12} className="text-gray-400" />
                          </button>
                        </td>
                      </tr>

                      {/* Detall per actiu */}
                      {isExpanded && !isEditing && (
                        <tr key={`detail-${r.id}`} style={{ borderBottom: '1px solid var(--ink-700)' }}>
                          <td colSpan={8} className="px-4 pb-4 pt-1">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {ASSETS.map(a => {
                                const inv = n(r[`${a.key}_invertit`])
                                const val = n(r[`${a.key}_valor`])
                                const b   = val - inv
                                const rt  = inv > 0 ? b / inv : 0
                                const ra  = calcCAGR(inv, val, n(r.mes_num))
                                return (
                                  <div key={a.key} className="rounded-lg p-3 text-xs space-y-1.5"
                                    style={{ background: 'var(--ink-900)', border: `1px solid ${a.color}33` }}>
                                    <p className="font-semibold mb-2" style={{ color: a.color }}>{a.emoji} {a.label}</p>
                                    <div className="flex justify-between text-gray-400">
                                      <span>Invertit</span><span className="font-mono">{fmt(inv)}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-400">
                                      <span>Valor</span>
                                      <span className="font-mono" style={{ color: 'var(--gold-light)' }}>{fmt(val)}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-400">
                                      <span>Benefici</span>
                                      <span className={`font-mono font-semibold ${b >= 0 ? 'positive' : 'negative'}`}>
                                        {b >= 0 ? '+' : ''}{fmt(b)}
                                      </span>
                                    </div>
                                    <div style={{ borderTop: '1px solid var(--ink-700)', paddingTop: '0.375rem', marginTop: '0.375rem' }}
                                      className="flex justify-between text-gray-400">
                                      <span>Total</span>
                                      <span className={`font-mono ${rt >= 0 ? 'positive' : 'negative'}`}>{fmtPct(rt)}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-400">
                                      <span>Anual (CAGR)</span>
                                      <span className={`font-mono ${ra >= 0 ? 'positive' : 'negative'}`}>{fmtPct(ra)}</span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Formulari edició */}
                      {isEditing && (
                        <tr key={`edit-${r.id}`} style={{ borderBottom: '1px solid var(--ink-700)' }}>
                          <td colSpan={8} className="p-0">
                            <div className="p-4" style={{ background: 'var(--ink-800)' }}>
                              <FormRow
                                form={editForm} setForm={setEditForm}
                                onSave={handleEditSave} onCancel={() => setEditingId(null)}
                                saving={saving} error={error}
                                title="Editant registre" titleColor="var(--gold)" />
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>}
    </div>
  )
}
