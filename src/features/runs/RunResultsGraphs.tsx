import { Fragment, useMemo, useState } from 'react'
import {
  AreaChart,
  Area,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

type BalanceDetail = 'none' | 'seasoning' | 'asset'

type ChartDatum = Record<string, unknown>

type BalanceSeries = {
  key: string
  label: string
  color: string
}

type BalanceOverTime = {
  data: ChartDatum[]
  series: BalanceSeries[]
}

type BracketLine = {
  key: string
  label: string
  rate: number
}

type OrdinaryIncomeChart = {
  data: ChartDatum[]
  bracketLines: BracketLine[]
  maxValue: number
}

type CashflowSeries = {
  key: string
  label: string
  color: string
  bucket: string
}

type CashflowChart = {
  data: ChartDatum[]
  series: CashflowSeries[]
}

type RunResultsGraphsProps = {
  balanceDetail: BalanceDetail
  balanceDetailOptions: ReadonlyArray<{ value: BalanceDetail; label: string }>
  onBalanceDetailChange: (value: BalanceDetail) => void
  balanceOverTime: BalanceOverTime
  ordinaryIncomeChart: OrdinaryIncomeChart
  cashflowChart: CashflowChart
  formatAxisValue: (value: number) => string
  formatCurrency: (value: number) => string
  formatSignedCurrency: (value: number) => string
}

const RunResultsGraphs = ({
  balanceDetail,
  balanceDetailOptions,
  onBalanceDetailChange,
  balanceOverTime,
  ordinaryIncomeChart,
  cashflowChart,
  formatAxisValue,
  formatCurrency,
  formatSignedCurrency,
}: RunResultsGraphsProps) => {
  const [bucketFilter, setBucketFilter] = useState('all')
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())
  const [showBalanceChart, setShowBalanceChart] = useState(true)
  const [showOrdinaryChart, setShowOrdinaryChart] = useState(true)
  const [showCashflowChart, setShowCashflowChart] = useState(true)

  const visibleCashflowSeries = useMemo(() => {
    if (bucketFilter === 'all') {
      return cashflowChart.series
    }
    return cashflowChart.series.filter((series) => series.bucket === bucketFilter)
  }, [bucketFilter, cashflowChart.series])

  return (
    <>
      <div className="card" id="section-balance">
        <div className="row">
          <h2>Balance over time</h2>
          <div className="row" style={{ gap: '0.75rem' }}>
            <label className="field">
              <select
                value={balanceDetail}
                onChange={(event) =>
                  onBalanceDetailChange(event.target.value as BalanceDetail)
                }
              >
                {balanceDetailOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="link-button"
              type="button"
              onClick={() => setShowBalanceChart((current) => !current)}
            >
              {showBalanceChart ? '▾' : '▸'} {showBalanceChart ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        {showBalanceChart ? (
          <>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={balanceOverTime.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => formatAxisValue(Number(value))} width={70} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) {
                        return null
                      }
                      const row =
                        payload[0]?.payload as { year?: number; age?: number } | undefined
                      const label = row?.year
                        ? `${row.year} (age ${row.age ?? '-'})`
                        : `${row?.age ?? ''}`
                      const total = payload.reduce(
                        (sum, entry) => sum + Number(entry.value ?? 0),
                        0,
                      )
                      return (
                        <div
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            boxShadow: '0 12px 24px rgba(25, 32, 42, 0.12)',
                            padding: '10px 12px',
                          }}
                        >
                          <div className="tooltip-label">{label}</div>
                          {payload.map((entry) => (
                            <div key={String(entry.dataKey)} style={{ color: entry.color }}>
                              {entry.name}: {formatCurrency(Number(entry.value))}
                            </div>
                          ))}
                          <div className="tooltip-total">Total: {formatCurrency(total)}</div>
                        </div>
                      )
                    }}
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      boxShadow: '0 12px 24px rgba(25, 32, 42, 0.12)',
                    }}
                    wrapperStyle={{ zIndex: 10, pointerEvents: 'none' }}
                  />
                  {balanceOverTime.series.map((series) => (
                    <Area
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      stackId="balance"
                      name={series.label}
                      stroke={series.color}
                      fill={`color-mix(in srgb, ${series.color} 35%, transparent)`}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.4rem 0.75rem',
                justifyContent: 'center',
                fontSize: '0.85rem',
                lineHeight: 1.1,
                marginTop: '0.35rem',
              }}
            >
              {balanceOverTime.series.map((item) => (
                <span
                  key={item.key}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '999px',
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {ordinaryIncomeChart.data.length > 0 ? (
        <div className="card" id="section-ordinary-income">
          <div className="row">
            <h2>Taxable ordinary income and bracket thresholds</h2>
            <button
              className="link-button"
              type="button"
              onClick={() => setShowOrdinaryChart((current) => !current)}
            >
              {showOrdinaryChart ? '▾' : '▸'} {showOrdinaryChart ? 'Hide' : 'Show'}
            </button>
          </div>
          {showOrdinaryChart ? (
            <>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ordinaryIncomeChart.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1} />
                    <XAxis dataKey="year" />
                    <YAxis
                      tickFormatter={(value) => formatAxisValue(Number(value))}
                      width={70}
                      domain={['dataMin', ordinaryIncomeChart.maxValue]}
                      allowDataOverflow={true}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) {
                          return null
                        }
                        const row =
                          payload[0]?.payload as { year?: number; age?: number } | undefined
                        const label = row?.year
                          ? `${row.year} (age ${row.age ?? '-'})`
                          : `${row?.age ?? ''}`
                        const bracketKeys = new Set(
                          ordinaryIncomeChart.bracketLines.map((line) => line.key),
                        )
                        const total = payload.reduce((sum, entry) => {
                          const key = String(entry.dataKey ?? '')
                          if (bracketKeys.has(key)) {
                            return sum
                          }
                          return sum + Number(entry.value ?? 0)
                        }, 0)
                        return (
                          <div
                            style={{
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: '10px',
                              boxShadow: '0 12px 24px rgba(25, 32, 42, 0.12)',
                              padding: '10px 12px',
                            }}
                          >
                            <div className="tooltip-label">{label}</div>
                            {(() => {
                              const stackedEntries = payload.filter((entry) =>
                                entry.dataKey && !bracketKeys.has(String(entry.dataKey)),
                              )
                              const bracketEntries = payload.filter(
                                (entry) =>
                                  entry.dataKey && bracketKeys.has(String(entry.dataKey)),
                              )
                              return (
                                <>
                                  {stackedEntries.map((entry) => (
                                    <div key={String(entry.dataKey)} style={{ color: entry.color }}>
                                      {entry.name}: {formatCurrency(Number(entry.value))}
                                    </div>
                                  ))}
                                  <div className="tooltip-total">
                                    Total: {formatCurrency(total)}
                                  </div>
                                  {bracketEntries.map((entry) => (
                                    <div key={String(entry.dataKey)} style={{ color: entry.color }}>
                                      {entry.name}: {formatCurrency(Number(entry.value))}
                                    </div>
                                  ))}
                                </>
                              )
                            })()}
                          </div>
                        )
                      }}
                      wrapperStyle={{ zIndex: 10, pointerEvents: 'none' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="standardDeduction"
                      stackId="ordinary"
                      name="Standard deduction"
                      stroke="#64748b"
                      fill="color-mix(in srgb, #64748b 30%, transparent)"
                    />
                    <Area
                      type="monotone"
                      dataKey="ledgerDeductions"
                      stackId="ordinary"
                      name="Other deductions"
                      stroke="#94a3b8"
                      fill="color-mix(in srgb, #94a3b8 30%, transparent)"
                    />
                    <Area
                      type="monotone"
                      dataKey="salaryIncome"
                      stackId="ordinary"
                      name="Salary and other income"
                      stroke="#4f63ff"
                      fill="color-mix(in srgb, #4f63ff 45%, transparent)"
                    />
                    <Area
                      type="monotone"
                      dataKey="investmentIncome"
                      stackId="ordinary"
                      name="Investment income"
                      stroke="#3da5ff"
                      fill="color-mix(in srgb, #3da5ff 45%, transparent)"
                    />
                    <Area
                      type="monotone"
                      dataKey="socialSecurityIncome"
                      stackId="ordinary"
                      name="Taxable social security"
                      stroke="#7ecf7a"
                      fill="color-mix(in srgb, #7ecf7a 45%, transparent)"
                    />
                    <Area
                      type="monotone"
                      dataKey="pensionIncome"
                      stackId="ordinary"
                      name="Taxable pension and annuity"
                      stroke="#7d6bff"
                      fill="color-mix(in srgb, #7d6bff 45%, transparent)"
                    />
                    <Area
                      type="monotone"
                      dataKey="taxDeferredIncome"
                      stackId="ordinary"
                      name="Withdrawal from tax deferred"
                      stroke="#f39c3d"
                      fill="color-mix(in srgb, #f39c3d 45%, transparent)"
                    />
                    {ordinaryIncomeChart.bracketLines.map((line) => {
                      const rateRatio = Math.min(Math.max(line.rate / 0.5, 0), 1)
                      const hue = 120 - 120 * rateRatio
                      const stroke = `hsl(${hue} 70% 45%)`
                      return (
                        <Line
                          key={line.key}
                          type="monotone"
                          dataKey={line.key}
                          name={line.label}
                          stroke={stroke}
                          strokeDasharray="4 4"
                          strokeWidth={0.75}
                          dot={false}
                        />
                      )
                    })}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.4rem 0.75rem',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  lineHeight: 1.1,
                  marginTop: '0.35rem',
                }}
              >
                {[
                  { key: 'standardDeduction', label: 'Standard deduction', color: '#64748b' },
                  { key: 'ledgerDeductions', label: 'Other deductions', color: '#94a3b8' },
                  { key: 'salaryIncome', label: 'Salary and other income', color: '#4f63ff' },
                  { key: 'investmentIncome', label: 'Investment income', color: '#3da5ff' },
                  { key: 'socialSecurityIncome', label: 'Taxable social security', color: '#7ecf7a' },
                  { key: 'pensionIncome', label: 'Taxable pension and annuity', color: '#7d6bff' },
                  { key: 'taxDeferredIncome', label: 'Withdrawal from tax deferred', color: '#f39c3d' },
                  ...ordinaryIncomeChart.bracketLines.map((line) => {
                    const rateRatio = Math.min(Math.max(line.rate / 0.5, 0), 1)
                    const hue = 120 - 120 * rateRatio
                    return { key: line.key, label: line.label, color: `hsl(${hue} 70% 45%)` }
                  }),
                ].map((item) => (
                  <span
                    key={item.key}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '999px',
                        background: item.color,
                        display: 'inline-block',
                      }}
                    />
                    {item.label}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {cashflowChart.data.length > 0 && cashflowChart.series.length > 0 ? (
        <div className="card" id="section-cashflow">
          <div className="row">
            <h2>Cash flow by module</h2>
            <div className="row" style={{ gap: '0.75rem' }}>
              <label className="field">
                <select
                  value={bucketFilter}
                  onChange={(event) => setBucketFilter(event.target.value)}
                >
                  <option value="all">All buckets</option>
                  <option value="cash">Cash</option>
                  <option value="taxable">Taxable</option>
                  <option value="traditional">Traditional</option>
                  <option value="roth">Roth</option>
                  <option value="hsa">HSA</option>
                </select>
              </label>
              <button
                className="link-button"
                type="button"
                onClick={() => setShowCashflowChart((current) => !current)}
              >
                {showCashflowChart ? '▾' : '▸'} {showCashflowChart ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {showCashflowChart ? (
            <>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashflowChart.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1.5} />
                    <XAxis dataKey="year" />
                    <YAxis tickFormatter={(value) => formatAxisValue(Number(value))} width={70} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) {
                          return null
                        }
                        const row = payload[0]?.payload as Record<string, number> | undefined
                        if (!row) {
                          return null
                        }
                        const header =
                          typeof row.year === 'number'
                            ? `${row.year} (age ${row.age ?? '-'})`
                            : `${row.age ?? ''}`
                        return (
                          <div
                            style={{
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: '10px',
                              boxShadow: '0 12px 24px rgba(25, 32, 42, 0.12)',
                              padding: '10px 12px',
                            }}
                          >
                            <div className="tooltip-label">{header}</div>
                            {(() => {
                              const visible = visibleCashflowSeries.filter((series) => {
                                if (hiddenSeries.has(series.key)) {
                                  return false
                                }
                                const value = row[series.key]
                                return typeof value === 'number' && Math.abs(value) > 0.005
                              })
                              const positives = visible.filter(
                                (series) => Number(row[series.key]) > 0,
                              )
                              const negatives = visible.filter(
                                (series) => Number(row[series.key]) < 0,
                              )
                              return [...positives.reverse(), ...negatives].map((series) => (
                                <div key={series.key} style={{ color: series.color }}>
                                  {series.label}: {formatSignedCurrency(Number(row[series.key]))}
                                </div>
                              ))
                            })()}
                          </div>
                        )
                      }}
                      wrapperStyle={{ zIndex: 10, pointerEvents: 'none' }}
                    />
                    {visibleCashflowSeries.map((series) => (
                      <Fragment key={series.key}>
                        <Area
                          type="monotone"
                          dataKey={`${series.key}__pos`}
                          name={series.label}
                          stroke={series.color}
                          strokeWidth={1.25}
                          fill={`color-mix(in srgb, ${series.color} 45%, transparent)`}
                          fillOpacity={0.85}
                          dot={false}
                          stackId="cashflow-pos"
                          hide={hiddenSeries.has(series.key)}
                          isAnimationActive={false}
                        />
                        <Area
                          type="monotone"
                          dataKey={`${series.key}__neg`}
                          name={series.label}
                          stroke={series.color}
                          strokeWidth={1.25}
                          fill={`color-mix(in srgb, ${series.color} 45%, transparent)`}
                          fillOpacity={0.85}
                          dot={false}
                          stackId="cashflow-neg"
                          hide={hiddenSeries.has(series.key)}
                          isAnimationActive={false}
                        />
                      </Fragment>
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.45rem 0.75rem',
                  fontSize: '0.85rem',
                  lineHeight: 1.1,
                  justifyContent: 'center',
                  marginTop: '0.35rem',
                }}
              >
                {visibleCashflowSeries.map((series) => {
                  const isHidden = hiddenSeries.has(series.key)
                  return (
                    <button
                      key={series.key}
                      type="button"
                      onClick={() =>
                        setHiddenSeries((current) => {
                          const next = new Set(current)
                          if (next.has(series.key)) {
                            next.delete(series.key)
                          } else {
                            next.add(series.key)
                          }
                          return next
                        })
                      }
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        border: 'none',
                        background: 'none',
                        padding: '0.1rem 0',
                        color: isHidden ? 'var(--text-muted)' : 'inherit',
                        opacity: isHidden ? 0.55 : 1,
                        cursor: 'pointer',
                        font: 'inherit',
                      }}
                    >
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '999px',
                          background: series.color,
                          display: 'inline-block',
                        }}
                      />
                      {series.label}
                    </button>
                  )
                })}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

export default RunResultsGraphs
