import { useState } from 'react'

// Vercel API Route経由でFMPを叩く（本番）
// 開発時は直接FMPに接続
async function fmpFetch(path) {
  const url = `/api/fmp?path=${encodeURIComponent(path)}`
  const res = await fetch(url)
  let body
  try { body = await res.json() } catch { body = null }

  if (!res.ok) {
    const detail = body
      ? `${body.error ?? ''} ${body.fmpStatus ? `(FMP status: ${body.fmpStatus})` : ''} ${body.message ?? ''} ${body.snippet ?? ''} ${body.detail ? JSON.stringify(body.detail) : ''}`.trim()
      : `HTTP ${res.status}`
    throw new Error(detail || `API error: ${res.status}`)
  }
  return body
}

const CRITERIA = [
  { key: 'fcfYield',     label: 'FCF利回り≥5%',      group: 'bcu',  star: true },
  { key: 'roe',          label: 'ROE≥10%',           group: 'bcu',  star: true },
  { key: 'pbr',          label: 'PBR≤2.5',           group: 'bcu',  star: true },
  { key: 'fcfMargin',    label: 'FCFマージン≥8%',     group: 'bcu' },
  { key: 'ebitdaGrowth', label: 'EBITDAプラス成長',   group: 'bcu' },
  { key: 'wkRange',      label: '52週安値圏+40%以内', group: 'bcu' },
  { key: 'pbrKiyo',      label: 'PBR≤1.0',           group: 'kiyo', star: true },
  { key: 'per',          label: 'PER≤10',            group: 'kiyo', star: true },
  { key: 'mcap',         label: '時価総額≤$500M',     group: 'kiyo' },
  { key: 'netCashRatio', label: 'NCR≥1.0',           group: 'kiyo', star: true },
]

function calcChecks(m, m1, bs, c) {
  const price     = c.price ?? 0
  const marketCap = c.marketCap ?? 0
  const fcfPS     = m.freeCashFlowPerShare ?? 0
  const roe       = m.roe ?? 0
  const pbr       = m.pbRatio ?? 999
  const peRatio   = m.peRatio ?? null
  const revPS     = m.revenuePerShare ?? 0
  const fcfYield  = price > 0 ? fcfPS / price : 0
  const fcfMargin = revPS > 0 ? fcfPS / revPS : 0

  const ev0 = m.enterpriseValue  && m.evToEbitda  ? m.enterpriseValue  / m.evToEbitda  : null
  const ev1 = m1?.enterpriseValue && m1?.evToEbitda ? m1.enterpriseValue / m1.evToEbitda : null
  const ebitdaGrowth = ev0 && ev1 && ev1 > 0 ? (ev0 - ev1) / Math.abs(ev1) : null

  const high52   = c.yearHigh ?? 0
  const low52    = c.yearLow  ?? 0
  const range    = high52 - low52
  const rangePct = range > 0 ? (price - low52) / range : null

  const curAssets   = bs?.totalCurrentAssets ?? 0
  const investments = bs?.longTermInvestments ?? bs?.otherNonCurrentAssets ?? 0
  const liabilities = bs?.totalLiabilities ?? 0
  const netCash     = curAssets + investments * 0.7 - liabilities
  const netCashRatio = marketCap > 0 ? netCash / marketCap : null

  return {
    metrics: {
      fcfYield:     fcfYield * 100,
      roe:          roe * 100,
      pbr,
      peRatio,
      fcfMargin:    fcfMargin * 100,
      ebitdaGrowth: ebitdaGrowth != null ? ebitdaGrowth * 100 : null,
      rangePct:     rangePct != null ? rangePct * 100 : null,
      netCashRatio,
      marketCapM:   marketCap / 1e6,
    },
    checks: {
      fcfYield:     fcfYield >= 0.05,
      roe:          roe >= 0.10,
      pbr:          pbr <= 2.5 && pbr > 0,
      fcfMargin:    fcfMargin >= 0.08,
      ebitdaGrowth: ebitdaGrowth != null ? ebitdaGrowth > 0 : null,
      wkRange:      rangePct != null ? rangePct <= 0.40 : null,
      pbrKiyo:      pbr > 0 && pbr <= 1.0,
      per:          peRatio != null ? peRatio > 0 && peRatio <= 10 : null,
      mcap:         marketCap > 0 && marketCap / 1e6 <= 500,
      netCashRatio: netCashRatio != null ? netCashRatio >= 1.0 : null,
    }
  }
}

function scoreRow(row, active) {
  let pass = 0, total = 0
  for (const c of CRITERIA) {
    if (!active[c.key]) continue
    total++
    if (row.checks?.[c.key] === true) pass++
  }
  return { pass, total, pct: total > 0 ? Math.round(pass / total * 100) : 0 }
}

// ── styles ──────────────────────────────────────────
const C = {
  bg: '#0d0f14', surface: '#141720', border: '#1e2330',
  accent: '#c8f135', muted: '#6b7280', text: '#e8eaf0',
  warn: '#f59e0b', danger: '#ef4444', pass: '#22c55e',
  mono: "'SF Mono','Fira Code',monospace",
}
const sel = { background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, padding: '6px 10px', borderRadius: 4 }
const inp = { ...sel, width: 90 }

export default function App() {
  const [exchange, setExchange] = useState('NASDAQ')
  const [maxCap, setMaxCap]     = useState(500)
  const [minCap, setMinCap]     = useState(50)
  const [limit, setLimit]       = useState(30)
  const [active, setActive]     = useState(Object.fromEntries(CRITERIA.map(c => [c.key, true])))
  const [results, setResults]   = useState([])
  const [status, setStatus]     = useState('')
  const [prog, setProg]         = useState(0)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [sortCol, setSortCol]   = useState('pct')
  const [sortDir, setSortDir]   = useState(-1)

  const toggleCrit = key => setActive(a => ({ ...a, [key]: !a[key] }))
  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d * -1)
    else { setSortCol(col); setSortDir(-1) }
  }

  async function runScreener() {
    setLoading(true); setError(''); setResults([]); setProg(5)
    setStatus('候補銘柄を取得中…')
    try {
      const candidates = await fmpFetch(
        `/company-screener?exchange=${exchange}&marketCapMoreThan=${minCap * 1e6}&marketCapLowerThan=${maxCap * 1e6}&limit=${limit}`
      )
      if (!Array.isArray(candidates) || candidates.length === 0)
        throw new Error('候補が見つかりません。条件を変えてみてください。')

      setStatus(`${candidates.length}件取得。財務データを取得中…`)
      setProg(15)

      const BATCH = 8
      const scored = []

      for (let i = 0; i < candidates.length; i += BATCH) {
        const batch = candidates.slice(i, i + BATCH)
        setProg(15 + Math.round((i / candidates.length) * 80))
        setStatus(`財務データ取得中… ${Math.min(i + BATCH, candidates.length)}/${candidates.length}件`)

        const settled = await Promise.allSettled(
          batch.map(async c => {
            const [metricsArr, bsArr] = await Promise.allSettled([
              fmpFetch(`/key-metrics?symbol=${c.symbol}&limit=2`),
              fmpFetch(`/balance-sheet-statement?symbol=${c.symbol}&limit=1`),
            ])
            const metrics = metricsArr.status === 'fulfilled' ? metricsArr.value : []
            const bs      = bsArr.status === 'fulfilled' ? (bsArr.value?.[0] ?? {}) : {}
            if (!metrics?.length) return null
            const { metrics: m, checks } = calcChecks(metrics[0], metrics[1], bs, c)
            return {
              symbol: c.symbol,
              name: c.companyName ?? c.symbol,
              exchange: c.exchangeShortName ?? '',
              price: c.price ?? 0,
              ...m,
              checks,
            }
          })
        )
        for (const r of settled)
          if (r.status === 'fulfilled' && r.value) scored.push(r.value)

        if (i + BATCH < candidates.length) await new Promise(r => setTimeout(r, 200))
      }

      setResults(scored)
      const passN = scored.filter(r => {
        const { pass, total } = scoreRow(r, active)
        return pass === total && total > 0
      }).length
      setStatus(`完了 — ${scored.length}件解析 / 全条件クリア: ${passN}件`)
      setProg(100)
    } catch (e) {
      setError(e.message)
      setStatus('エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const sorted = [...results]
    .map(r => ({ ...r, ...scoreRow(r, active) }))
    .sort((a, b) => {
      const av = a[sortCol] ?? -Infinity, bv = b[sortCol] ?? -Infinity
      return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir
    })

  const passCount = sorted.filter(r => r.pass === r.total && r.total > 0).length
  const fmt = (v, d = 1) => v == null ? '—' : Number(v).toFixed(d)
  const dot = (row, key) => {
    if (!active[key]) return <span style={{ color: C.muted }}>—</span>
    const v = row.checks?.[key]
    if (v == null) return <span style={{ color: C.warn }}>?</span>
    return v
      ? <span style={{ color: C.pass, fontWeight: 700 }}>✓</span>
      : <span style={{ color: C.danger }}>✗</span>
  }

  const TABLE_COLS = [
    ['symbol','ティッカー'], ['name','銘柄名'], ['pct','スコア'],
    ['fcfYield','FCF利回%'], ['roe','ROE%'], ['pbr','PBR'], ['peRatio','PER'],
    ['fcfMargin','FCF粗利%'], ['ebitdaGrowth','EBITDA成長%'],
    ['rangePct','52週位置%'], ['netCashRatio','NCR'], ['marketCapM','M$'],
  ]

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', fontFamily: "-apple-system,'Hiragino Sans',sans-serif", fontSize: 13 }}>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '18px 16px 12px' }}>
        <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '0.15em', color: C.accent, marginBottom: 4 }}>
          BCU WORKING PAPER 2025 ← 実証研究ベース
        </div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>
          テンバガー<span style={{ color: C.accent }}>スクリーナー</span>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          BCU論文 × 清原ネットキャッシュ戦略 / FMP API
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        {[
          { label: '市場', el: (
            <select value={exchange} onChange={e => setExchange(e.target.value)} style={sel}>
              <option value="NASDAQ">NASDAQ</option>
              <option value="NYSE">NYSE</option>
              <option value="NYSE,NASDAQ">NYSE+NASDAQ</option>
              <option value="JPX">JPX（日本）</option>
            </select>
          )},
          { label: '時価総額上限 (M$)', el: <input type="number" value={maxCap} onChange={e => setMaxCap(+e.target.value)} style={inp} /> },
          { label: '時価総額下限 (M$)', el: <input type="number" value={minCap} onChange={e => setMinCap(+e.target.value)} style={inp} /> },
          { label: '件数上限', el: (
            <select value={limit} onChange={e => setLimit(+e.target.value)} style={sel}>
              <option value={20}>20件</option>
              <option value={30}>30件</option>
              <option value={50}>50件</option>
              <option value={100}>100件</option>
            </select>
          )},
        ].map(({ label, el }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, color: C.muted, fontFamily: C.mono }}>{label}</span>
            {el}
          </div>
        ))}
        <button onClick={runScreener} disabled={loading}
          style={{ background: loading ? '#2a2f1a' : C.accent, color: C.bg, border: 'none', fontWeight: 700, fontSize: 13, padding: '8px 20px', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer', alignSelf: 'flex-end', opacity: loading ? 0.6 : 1 }}>
          {loading ? '取得中…' : '▶ 実行'}
        </button>
      </div>

      {/* Criteria toggles */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: C.mono, width: '100%', marginBottom: 2 }}>判定基準 ON/OFF</span>
        {['bcu', 'kiyo'].map(group => (
          <div key={group} style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: group === 'bcu' ? C.accent : C.warn, fontFamily: C.mono, letterSpacing: '0.1em' }}>
              {group === 'bcu' ? '── BCU論文 ──' : '── 清原 ──'}
            </span>
            {CRITERIA.filter(c => c.group === group).map(c => (
              <button key={c.key} onClick={() => toggleCrit(c.key)}
                style={{
                  background: active[c.key] ? (group === 'bcu' ? 'rgba(200,241,53,0.12)' : 'rgba(245,158,11,0.12)') : C.surface,
                  border: `1px solid ${active[c.key] ? (group === 'bcu' ? C.accent : C.warn) : C.border}`,
                  color: active[c.key] ? (group === 'bcu' ? C.accent : C.warn) : C.muted,
                  fontSize: 10, fontFamily: C.mono, padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                }}>
                {c.star ? '★ ' : ''}{c.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Status + progress */}
      <div style={{ padding: '8px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: loading ? 6 : 0 }}>
          <span style={{ fontSize: 11, color: C.muted, flex: 1 }}>{status || '実行ボタンを押してスクリーニング開始'}</span>
          {results.length > 0 && (
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.accent, fontWeight: 700 }}>
              全条件クリア: {passCount}/{sorted.length}件
            </span>
          )}
        </div>
        {loading && (
          <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${prog}%`, height: '100%', background: C.accent, borderRadius: 2, transition: 'width 0.4s' }} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: '10px 16px', padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, color: C.danger, fontSize: 12 }}>
          ⚠ {error}
        </div>
      )}

      {/* Table */}
      {sorted.length > 0 && (
        <div style={{ overflowX: 'auto', padding: '12px 16px 40px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                {TABLE_COLS.map(([col, lbl]) => (
                  <th key={col} onClick={() => handleSort(col)}
                    style={{ textAlign: 'left', padding: '6px 7px', fontFamily: C.mono, fontSize: 9, color: sortCol === col ? C.accent : C.muted, letterSpacing: '0.07em', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {lbl}{sortCol === col ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => {
                const allPass = row.pass === row.total && row.total > 0
                const pc = row.pct
                const pillC = pc === 100 ? C.accent : pc >= 67 ? C.warn : C.danger
                return (
                  <tr key={row.symbol} style={{ borderBottom: `1px solid ${C.border}`, background: allPass ? 'rgba(200,241,53,0.04)' : 'transparent' }}>
                    <td style={{ padding: '7px 7px', fontFamily: C.mono, fontWeight: 700, color: C.accent, fontSize: 12, whiteSpace: 'nowrap' }}>
                      {row.symbol}
                      <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.06)', color: C.muted, padding: '1px 4px', borderRadius: 2, marginLeft: 4 }}>{row.exchange}</span>
                    </td>
                    <td style={{ padding: '7px 7px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.name}>{row.name}</td>
                    <td style={{ padding: '7px 7px' }}>
                      <span style={{ background: `${pillC}22`, border: `1px solid ${pillC}55`, color: pillC, fontFamily: C.mono, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>
                        {pc}%
                      </span>
                    </td>
                    <td style={{ padding: '7px 7px', fontFamily: C.mono }}>{dot(row,'fcfYield')} {fmt(row.fcfYield)}</td>
                    <td style={{ padding: '7px 7px', fontFamily: C.mono }}>{dot(row,'roe')} {fmt(row.roe)}</td>
                    <td style={{ padding: '7px 7px', fontFamily: C.mono }}>{dot(row,'pbr')} {fmt(row.pbr,2)}</td>
                    <td style={{ padding: '7px 7px', fontFamily: C.mono }}>{dot(row,'per')} {fmt(row.peRatio,1)}</td>
                    <td style={{ padding: '7px 7px', fontFamily: C.mono }}>{dot(row,'fcfMargin')} {fmt(row.fcfMargin)}</td>
                    <td style={{ padding: '7px 7px', fontFamily: C.mono }}>{dot(row,'ebitdaGrowth')} {fmt(row.ebitdaGrowth)}</td>
                    <td style={{ padding: '7px 7px', fontFamily: C.mono }}>{dot(row,'wkRange')} {fmt(row.rangePct)}</td>
                    <td style={{ padding: '7px 7px', fontFamily: C.mono }}>{dot(row,'netCashRatio')} {fmt(row.netCashRatio,2)}</td>
                    <td style={{ padding: '7px 7px', fontFamily: C.mono, color: C.muted }}>{fmt(row.marketCapM,0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: 48, color: C.muted }}>結果はここに表示されます</div>
      )}

      <div style={{ margin: '0 16px 24px', padding: '10px 14px', background: C.surface, borderLeft: `2px solid ${C.border}`, fontSize: 10, color: C.muted, lineHeight: 1.7, borderRadius: '0 4px 4px 0' }}>
        <strong style={{ color: C.text }}>NCR</strong> = （流動資産 + 投資有価証券×70% − 負債）÷ 時価総額 ／
        <strong style={{ color: C.text }}> 免責</strong>: BCU論文はワーキングペーパー（査読前）。投資判断はご自身の責任で。
      </div>
    </div>
  )
}
