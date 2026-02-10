import { Fragment, useState } from 'react'
import type { MonthExplanation, SimulationResult } from '../../core/models'

type MonthlyTimelinePoint = NonNullable<SimulationResult['monthlyTimeline']>[number]

type AccountLookup = {
  cashById: Map<string, string>
  holdingById: Map<string, { name: string; investmentAccountId?: string | null }>
  investmentById: Map<string, string>
}

type YearDetailMode = 'none' | 'month' | 'module'

type RunResultsTimelineProps = {
  showTimeline: boolean
  onToggleTimeline: () => void
  filteredTimeline: SimulationResult['timeline']
  monthlyByYear: Map<number, MonthlyTimelinePoint[]>
  explanationsByMonth: Map<number, MonthExplanation>
  addMonths: (isoDate: string, months: number) => string | null
  formatCurrencyForDate: (value: number, dateIso?: string | null) => string
  formatSignedCurrencyForDate: (value: number, dateIso?: string | null) => string
  formatSignedCurrency: (value: number) => string
  getHoldingLabel: (holdingId: string) => string
  getAccountLabel: (entry: { id: string; kind: 'cash' | 'holding' }) => string
  accountLookup: AccountLookup
  initialBalances: Map<string, number>
  adjustForInflation: (value: number, dateIso?: string | null) => number
}

const formatRate = (value: number) => `${(value * 100).toFixed(2)}%`

const formatMonthYear = (dateIso: string) => {
  const date = new Date(dateIso)
  if (Number.isNaN(date.getTime())) {
    return dateIso
  }
  return date.toLocaleString(undefined, { month: 'short', year: 'numeric' })
}

const formatMonthShort = (dateIso: string) => {
  const date = new Date(dateIso)
  if (Number.isNaN(date.getTime())) {
    return dateIso
  }
  return date.toLocaleString(undefined, { month: 'short' })
}

const formatYearLabel = (dateIso: string | null) => {
  if (!dateIso) {
    return '-'
  }
  const year = new Date(dateIso).getFullYear()
  return Number.isNaN(year) ? '-' : String(year)
}

const formatMetricValue = (value: unknown) => {
  if (typeof value === 'number') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  if (value === null || value === undefined) {
    return '-'
  }
  return String(value)
}

const moduleLabels: Record<string, string> = {
  spending: 'Spending',
  events: 'Events',
  pensions: 'Pensions',
  healthcare: 'Healthcare',
  charitable: 'Charitable',
  'future-work': 'Work',
  'social-security': 'Social Security',
  'cash-buffer': 'Cash buffer',
  rebalancing: 'Rebalancing',
  conversions: 'Conversions',
  rmd: 'RMD',
  taxes: 'Taxes',
  'death-legacy': 'Death & legacy',
  'funding-core': 'Funding',
  'returns-core': 'Market returns',
}

const detailButtonStyle = (isActive: boolean) => ({
  border: '1px solid var(--border)',
  background: isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'none',
  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
  borderRadius: '999px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '26px',
  height: '26px',
  padding: 0,
  cursor: 'pointer',
})

const CancelIcon = () => (
  <svg viewBox="0 0 20 20" width={12} height={12} aria-hidden="true">
    <path
      fill="currentColor"
      d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm-3.1 3.4 6.2 6.2-.8.8-6.2-6.2.8-.8Zm6.2 0 .8.8-6.2 6.2-.8-.8 6.2-6.2Z"
    />
  </svg>
)

const CalendarIcon = () => (
  <svg viewBox="0 0 20 20" width={12} height={12} aria-hidden="true">
    <path
      fill="currentColor"
      d="M6 2h1v2h6V2h1v2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2Zm10 6H4v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8ZM4 7h12V6a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v1Z"
    />
  </svg>
)

const PieIcon = () => (
  <svg viewBox="0 0 20 20" width={12} height={12} aria-hidden="true">
    <path
      fill="currentColor"
      d="M9 2a8 8 0 1 0 8 8h-1.5A6.5 6.5 0 1 1 9 3.5V2Zm1 0v9h9A8 8 0 0 0 10 2Z"
    />
  </svg>
)

const RunResultsTimeline = ({
  showTimeline,
  onToggleTimeline,
  filteredTimeline,
  monthlyByYear,
  explanationsByMonth,
  addMonths,
  formatCurrencyForDate,
  formatSignedCurrencyForDate,
  formatSignedCurrency,
  getHoldingLabel,
  getAccountLabel,
  accountLookup,
  initialBalances,
  adjustForInflation,
}: RunResultsTimelineProps) => {
  const [yearDetailModes, setYearDetailModes] = useState<Record<number, YearDetailMode>>({})
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set())

  const getYearDetailMode = (yearIndex: number): YearDetailMode =>
    yearDetailModes[yearIndex] ?? 'none'

  return (
    <div className="card stack" id="section-timeline">
      <div className="row">
        <h2>Timeline</h2>
        <button
          className="link-button"
          type="button"
          onClick={onToggleTimeline}
        >
          {showTimeline ? 'Hide' : 'Show'}
        </button>
      </div>
      {showTimeline ? (
        <table className="table selectable">
    <thead>
      <tr>
        <th>Year</th>
        <th>Age (end of year)</th>
        <th>Balance</th>
        <th>Contribution</th>
        <th>Spending</th>
      </tr>
    </thead>
    <tbody>
          {filteredTimeline.map((point) => {
            const monthRows = monthlyByYear.get(point.yearIndex) ?? []
            const year = point.date ? new Date(point.date).getFullYear() : null
            const decadeId = year !== null && !Number.isNaN(year) && year % 10 === 0
              ? `timeline-decade-${year}`
              : undefined
            const yearMode = getYearDetailMode(point.yearIndex)
        const yearMonthEntries = monthRows.flatMap((month) => {
          const explanation = explanationsByMonth.get(month.monthIndex)
          return explanation ? [{ month, explanation }] : []
        })
        const yearStartMonth = monthRows.length > 0 ? monthRows[0] : null
            const yearStartDate =
          yearStartMonth?.date ?? (point.date ? addMonths(point.date, -11) : null)
        const yearEndMonth = monthRows.length > 0 ? monthRows[monthRows.length - 1] : null
        const yearEndExplanation = yearEndMonth
          ? explanationsByMonth.get(yearEndMonth.monthIndex)
          : undefined
        const priorYearMonths =
          point.yearIndex > 0 ? monthlyByYear.get(point.yearIndex - 1) ?? [] : []
        const priorYearEndMonth =
          priorYearMonths.length > 0 ? priorYearMonths[priorYearMonths.length - 1] : null
        const priorYearEndExplanation = priorYearEndMonth
          ? explanationsByMonth.get(priorYearEndMonth.monthIndex)
          : undefined
        const yearModules = new Map<
          string,
          {
            moduleId: string
            hasActivity: boolean
            months: Array<{
              month: (typeof monthRows)[number]
              module: (typeof yearMonthEntries)[number]['explanation']['modules'][number]
            }>
            totals: {
              cash: number
              ordinaryIncome: number
              capitalGains: number
              deductions: number
              taxExemptIncome: number
              deposit: number
              withdraw: number
              convert: number
              market: number
              hasMarket: boolean
            }
          }
        >()
        yearMonthEntries.forEach(({ month, explanation }) => {
          explanation.modules.forEach((module) => {
            const hasActivity =
              module.cashflows.length > 0 ||
              module.actions.length > 0 ||
              (module.marketReturns?.length ?? 0) > 0
            const entry = yearModules.get(module.moduleId) ?? {
              moduleId: module.moduleId,
              hasActivity: false,
              months: [],
              totals: {
                cash: 0,
                ordinaryIncome: 0,
                capitalGains: 0,
                deductions: 0,
                taxExemptIncome: 0,
                deposit: 0,
                withdraw: 0,
                convert: 0,
                market: 0,
                hasMarket: false,
              },
            }
            entry.totals.cash += module.totals.cashflows.cash
            entry.totals.ordinaryIncome += module.totals.cashflows.ordinaryIncome
            entry.totals.capitalGains += module.totals.cashflows.capitalGains
            entry.totals.deductions += module.totals.cashflows.deductions
            entry.totals.taxExemptIncome += module.totals.cashflows.taxExemptIncome
            entry.totals.deposit += module.totals.actions.deposit
            entry.totals.withdraw += module.totals.actions.withdraw
            entry.totals.convert += module.totals.actions.convert
            if (module.totals.market) {
              entry.totals.market += module.totals.market.total
              entry.totals.hasMarket = true
            }
            if (hasActivity) {
              entry.hasActivity = true
              entry.months.push({ month, module })
            }
            yearModules.set(module.moduleId, entry)
          })
        })
        const yearModuleRows = [...yearModules.values()]
          .filter((entry) => {
            if (entry.hasActivity) {
              return true
            }
            const totals = entry.totals
            return (
              totals.cash !== 0 ||
              totals.ordinaryIncome !== 0 ||
              totals.capitalGains !== 0 ||
              totals.deductions !== 0 ||
              totals.taxExemptIncome !== 0 ||
              totals.deposit !== 0 ||
              totals.withdraw !== 0 ||
              totals.convert !== 0 ||
              totals.market !== 0
            )
          })
          .sort((a, b) =>
            (moduleLabels[a.moduleId] ?? a.moduleId).localeCompare(
              moduleLabels[b.moduleId] ?? b.moduleId,
            ),
          )
        return (
          <Fragment key={point.yearIndex}>
                <tr id={decadeId}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                    <button
                      type="button"
                      title="No detail"
                      aria-label="No detail"
                      onClick={() =>
                        setYearDetailModes((current) => ({
                          ...current,
                          [point.yearIndex]:
                            current[point.yearIndex] === 'none' ? 'none' : 'none',
                        }))
                      }
                      style={detailButtonStyle(yearMode === 'none')}
                    >
                      <CancelIcon />
                    </button>
                    <button
                      type="button"
                      title="Month detail"
                      aria-label="Month detail"
                      onClick={() =>
                        setYearDetailModes((current) => ({
                          ...current,
                          [point.yearIndex]:
                            current[point.yearIndex] === 'month' ? 'none' : 'month',
                        }))
                      }
                      style={detailButtonStyle(yearMode === 'month')}
                    >
                      <CalendarIcon />
                    </button>
                    <button
                      type="button"
                      title="Module detail"
                      aria-label="Module detail"
                      onClick={() =>
                        setYearDetailModes((current) => ({
                          ...current,
                          [point.yearIndex]:
                            current[point.yearIndex] === 'module' ? 'none' : 'module',
                        }))
                      }
                      style={detailButtonStyle(yearMode === 'module')}
                    >
                      <PieIcon />
                    </button>
                  </div>
                  <span>{formatYearLabel(yearStartDate)}</span>
                </div>
              </td>
              <td>{point.age}</td>
              <td>{formatCurrencyForDate(point.balance, point.date)}</td>
              <td>{formatCurrencyForDate(point.contribution, point.date)}</td>
              <td>{formatCurrencyForDate(point.spending, point.date)}</td>
            </tr>
            {yearMode === 'module' ? (
              <tr className="table-row-highlight">
                <td colSpan={5} className="expansion">
                  <div className="stack">
                    <div className="stack">
                      <strong>Module activity</strong>
                      <div className="table-wrap">
                        <table className="table compact selectable">
                          <thead>
                            <tr>
                              <th>Module</th>
                              <th>Cash</th>
                              <th>Ord inc</th>
                              <th>Cap gains</th>
                              <th>Deductions</th>
                              <th>Tax exempt</th>
                              <th>Deposit</th>
                              <th>Withdraw</th>
                              <th>Convert</th>
                              <th>Market</th>
                            </tr>
                          </thead>
                          <tbody>
                            {yearModuleRows.map((module) => {
                              const moduleKey = `year:${point.yearIndex}:${module.moduleId}`
                              const moduleExpanded = expandedModules.has(moduleKey)
                              const totals = module.totals
                              return (
                                <Fragment key={moduleKey}>
                                  <tr>
                                    <td>
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.5rem',
                                        }}
                                      >
                                        <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                                          <button
                                            type="button"
                                            title="No detail"
                                            aria-label="No detail"
                                            onClick={() =>
                                              setExpandedModules((current) => {
                                                const next = new Set(current)
                                                next.delete(moduleKey)
                                                return next
                                              })
                                            }
                                            style={detailButtonStyle(!moduleExpanded)}
                                          >
                                            <CancelIcon />
                                          </button>
                                          <button
                                            type="button"
                                            title="Month detail"
                                            aria-label="Month detail"
                                            onClick={() =>
                                              setExpandedModules((current) => {
                                                const next = new Set(current)
                                                if (next.has(moduleKey)) {
                                                  next.delete(moduleKey)
                                                } else {
                                                  next.add(moduleKey)
                                                }
                                                return next
                                              })
                                            }
                                            style={detailButtonStyle(moduleExpanded)}
                                          >
                                            <CalendarIcon />
                                          </button>
                                        </div>
                                        <span>{moduleLabels[module.moduleId] ?? module.moduleId}</span>
                                      </div>
                                    </td>
                                    <td>
                                      {formatSignedCurrencyForDate(totals.cash, point.date)}
                                    </td>
                                    <td>
                                      {formatSignedCurrencyForDate(
                                        totals.ordinaryIncome,
                                        point.date,
                                      )}
                                    </td>
                                    <td>
                                      {formatSignedCurrencyForDate(
                                        totals.capitalGains,
                                        point.date,
                                      )}
                                    </td>
                                    <td>
                                      {formatSignedCurrencyForDate(
                                        totals.deductions,
                                        point.date,
                                      )}
                                    </td>
                                    <td>
                                      {formatSignedCurrencyForDate(
                                        totals.taxExemptIncome,
                                        point.date,
                                      )}
                                    </td>
                                    <td>
                                      {formatSignedCurrencyForDate(
                                        totals.deposit,
                                        point.date,
                                      )}
                                    </td>
                                    <td>
                                      {formatSignedCurrencyForDate(
                                        totals.withdraw,
                                        point.date,
                                      )}
                                    </td>
                                    <td>
                                      {formatSignedCurrencyForDate(
                                        totals.convert,
                                        point.date,
                                      )}
                                    </td>
                                    <td>
                                      {totals.hasMarket
                                        ? formatSignedCurrencyForDate(
                                            totals.market,
                                            point.date,
                                          )
                                        : '-'}
                                    </td>
                                  </tr>
                                  {moduleExpanded ? (
                                    <tr>
                                      <td colSpan={10} className="expansion">
                                        <div className="stack">
                                          {(() => {
                                            const months = [...module.months].sort(
                                              (a, b) =>
                                                a.month.monthIndex - b.month.monthIndex,
                                            )
                                            const inputLabels = new Set<string>()
                                            const checkpointLabels = new Set<string>()
                                            months.forEach((entry) => {
                                              entry.module.inputs?.forEach((input) => {
                                                inputLabels.add(input.label)
                                              })
                                              entry.module.checkpoints?.forEach((checkpoint) => {
                                                checkpointLabels.add(checkpoint.label)
                                              })
                                            })
                                            const inputRows = Array.from(inputLabels)
                                            const checkpointRows = Array.from(checkpointLabels)
                                            const cashflowRows = months.flatMap((entry) =>
                                              entry.module.cashflows.map((flow) => ({
                                                month: entry.month,
                                                flow,
                                              })),
                                            )
                                            const actionRows = months.flatMap((entry) =>
                                              entry.module.actions.map((action) => ({
                                                month: entry.month,
                                                action,
                                              })),
                                            )
                                            const marketRows = months.flatMap((entry) =>
                                              (entry.module.marketReturns ?? []).map((item) => ({
                                                month: entry.month,
                                                item,
                                              })),
                                            )
                                            return (
                                              <>
                                                {inputRows.length > 0 ? (
                                                  <div className="stack">
                                                    <strong className="muted">Inputs</strong>
                                                    <div className="table-wrap">
                                                      <table className="table compact">
                                                        <thead>
                                                          <tr>
                                                            <th>Metric</th>
                                                            {months.map((entry) => (
                                                              <th key={entry.month.monthIndex}>
                                                                {formatMonthShort(entry.month.date)}
                                                              </th>
                                                            ))}
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {inputRows.map((label) => (
                                                            <tr key={label}>
                                                              <td className="muted">{label}</td>
                                                              {months.map((entry) => {
                                                                const value =
                                                                  entry.module.inputs?.find(
                                                                    (input) =>
                                                                      input.label === label,
                                                                  )?.value
                                                                return (
                                                                  <td key={entry.month.monthIndex}>
                                                                    {formatMetricValue(value)}
                                                                  </td>
                                                                )
                                                              })}
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  </div>
                                                ) : null}
                                                {checkpointRows.length > 0 ? (
                                                  <div className="stack">
                                                    <strong className="muted">Checkpoints</strong>
                                                    <div className="table-wrap">
                                                      <table className="table compact">
                                                        <thead>
                                                          <tr>
                                                            <th>Metric</th>
                                                            {months.map((entry) => (
                                                              <th key={entry.month.monthIndex}>
                                                                {formatMonthShort(entry.month.date)}
                                                              </th>
                                                            ))}
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {checkpointRows.map((label) => (
                                                            <tr key={label}>
                                                              <td className="muted">{label}</td>
                                                              {months.map((entry) => {
                                                                const value =
                                                                  entry.module.checkpoints?.find(
                                                                    (checkpoint) =>
                                                                      checkpoint.label === label,
                                                                  )?.value
                                                                return (
                                                                  <td key={entry.month.monthIndex}>
                                                                    {formatMetricValue(value)}
                                                                  </td>
                                                                )
                                                              })}
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  </div>
                                                ) : null}
                                                {cashflowRows.length > 0 ? (
                                                  <div className="stack">
                                                    <strong className="muted">Cashflows</strong>
                                                    <div className="table-wrap">
                                                      <table className="table compact">
                                                        <thead>
                                                          <tr>
                                                            <th>Month</th>
                                                            <th>Label</th>
                                                            <th>Category</th>
                                                            <th>Cash</th>
                                                            <th>Ord inc</th>
                                                            <th>Cap gains</th>
                                                            <th>Deductions</th>
                                                            <th>Tax exempt</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {cashflowRows.map(({ month, flow }) => (
                                                            <tr key={`${month.monthIndex}-${flow.id}`}>
                                                              <td>{month.date}</td>
                                                              <td>{flow.label}</td>
                                                              <td className="muted">{flow.category}</td>
                                                              <td>
                                                                {formatSignedCurrencyForDate(
                                                                  flow.cash,
                                                                  month.date,
                                                                )}
                                                              </td>
                                                              <td>
                                                                {formatSignedCurrencyForDate(
                                                                  flow.ordinaryIncome ?? 0,
                                                                  month.date,
                                                                )}
                                                              </td>
                                                              <td>
                                                                {formatSignedCurrencyForDate(
                                                                  flow.capitalGains ?? 0,
                                                                  month.date,
                                                                )}
                                                              </td>
                                                              <td>
                                                                {formatSignedCurrencyForDate(
                                                                  flow.deductions ?? 0,
                                                                  month.date,
                                                                )}
                                                              </td>
                                                              <td>
                                                                {formatSignedCurrencyForDate(
                                                                  flow.taxExemptIncome ?? 0,
                                                                  month.date,
                                                                )}
                                                              </td>
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  </div>
                                                ) : null}
                                                {actionRows.length > 0 ? (
                                                  <div className="stack">
                                                    <strong className="muted">Actions</strong>
                                                    <div className="table-wrap">
                                                      <table className="table compact">
                                                        <thead>
                                                          <tr>
                                                            <th>Month</th>
                                                            <th>Label</th>
                                                            <th>Kind</th>
                                                            <th>Amount</th>
                                                            <th>Resolved</th>
                                                            <th>Source</th>
                                                            <th>Target</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {actionRows.map(({ month, action }) => (
                                                            <tr key={`${month.monthIndex}-${action.id}`}>
                                                              <td>{formatMonthShort(month.date)}</td>
                                                              <td>{action.label ?? action.id}</td>
                                                              <td className="muted">{action.kind}</td>
                                                              <td>
                                                                {formatSignedCurrencyForDate(
                                                                  action.amount,
                                                                  month.date,
                                                                )}
                                                              </td>
                                                              <td>
                                                                {formatSignedCurrencyForDate(
                                                                  action.resolvedAmount,
                                                                  month.date,
                                                                )}
                                                              </td>
                                                              <td className="muted">
                                                                {action.sourceHoldingId
                                                                  ? getHoldingLabel(
                                                                      action.sourceHoldingId,
                                                                    )
                                                                  : '-'}
                                                              </td>
                                                              <td className="muted">
                                                                {action.targetHoldingId
                                                                  ? getHoldingLabel(
                                                                      action.targetHoldingId,
                                                                    )
                                                                  : '-'}
                                                              </td>
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  </div>
                                                ) : null}
                                                {marketRows.length > 0 ? (
                                                  <div className="stack">
                                                    <strong className="muted">Market returns</strong>
                                                    <div className="table-wrap">
                                                      <table className="table compact">
                                                        <thead>
                                                          <tr>
                                                            <th>Month</th>
                                                            <th>Account</th>
                                                            <th>Start</th>
                                                            <th>End</th>
                                                            <th>Change</th>
                                                            <th>Rate</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {marketRows.map(({ month, item }) => (
                                                            <tr key={`${month.monthIndex}-${item.id}`}>
                                                              <td>{month.date}</td>
                                                              <td>
                                                                {item.kind === 'cash'
                                                                  ? accountLookup.cashById.get(item.id) ??
                                                                    item.id
                                                                  : getHoldingLabel(item.id)}
                                                              </td>
                                                              <td>
                                                                {formatSignedCurrencyForDate(
                                                                  item.balanceStart,
                                                                  month.date,
                                                                )}
                                                              </td>
                                                              <td>
                                                                {formatSignedCurrencyForDate(
                                                                  item.balanceEnd,
                                                                  month.date,
                                                                )}
                                                              </td>
                                                              <td>
                                                                {formatSignedCurrencyForDate(
                                                                  item.amount,
                                                                  month.date,
                                                                )}
                                                              </td>
                                                              <td>{formatRate(item.rate)}</td>
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  </div>
                                                ) : null}
                                              </>
                                            )
                                          })()}
                                        </div>
                                      </td>
                                    </tr>
                                  ) : null}
                                </Fragment>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="stack">
                      <strong>Year ledger</strong>
                      <div className="table-wrap">
                        {point.ledger ? (
                          <table className="table compact">
                            <tbody>
                              <tr>
                                <td className="muted">Ordinary income</td>
                                <td>
                                  {formatSignedCurrencyForDate(
                                    point.ledger.ordinaryIncome,
                                    point.date,
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="muted">Capital gains</td>
                                <td>
                                  {formatSignedCurrencyForDate(
                                    point.ledger.capitalGains,
                                    point.date,
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="muted">Deductions</td>
                                <td>
                                  {formatSignedCurrencyForDate(
                                    point.ledger.deductions,
                                    point.date,
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="muted">Tax exempt income</td>
                                <td>
                                  {formatSignedCurrencyForDate(
                                    point.ledger.taxExemptIncome,
                                    point.date,
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="muted">Social Security benefits</td>
                                <td>
                                  {formatSignedCurrencyForDate(
                                    point.ledger.socialSecurityBenefits ?? 0,
                                    point.date,
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="muted">Penalties</td>
                                <td>
                                  {formatSignedCurrencyForDate(
                                    point.ledger.penalties,
                                    point.date,
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="muted">Tax paid</td>
                                <td>
                                  {formatSignedCurrencyForDate(
                                    point.ledger.taxPaid,
                                    point.date,
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td className="muted">Earned income</td>
                                <td>
                                  {formatSignedCurrencyForDate(
                                    point.ledger.earnedIncome,
                                    point.date,
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        ) : (
                          <p className="muted">No year ledger data available.</p>
                        )}
                      </div>
                    </div>
                    <div className="stack">
                      <strong>Account balances</strong>
                      <div className="table-wrap">
                        {yearEndExplanation ? (
                          <table className="table compact">
                            <thead>
                              <tr>
                                <th>Account</th>
                                <th>Prior</th>
                                <th>Current</th>
                                <th>Change</th>
                              </tr>
                            </thead>
                            <tbody>
                              {yearEndExplanation.accounts.map((account) => {
                                const priorBalance = priorYearEndExplanation
                                  ? priorYearEndExplanation.accounts.find(
                                      (entry) =>
                                        entry.id === account.id &&
                                        entry.kind === account.kind,
                                    )?.balance
                                  : point.yearIndex === 0
                                    ? initialBalances.get(
                                        `${account.kind}:${account.id}`,
                                      )
                                    : undefined
                                const priorDate =
                                  priorYearEndExplanation?.date ?? yearStartMonth?.date
                                const adjustedPrior =
                                  priorBalance !== undefined
                                    ? adjustForInflation(priorBalance, priorDate)
                                    : undefined
                                const adjustedCurrent = adjustForInflation(
                                  account.balance,
                                  yearEndMonth?.date,
                                )
                                const delta =
                                  adjustedPrior !== undefined
                                    ? adjustedCurrent - adjustedPrior
                                    : null
                                return (
                                  <tr key={`${account.kind}-${account.id}`}>
                                    <td>{getAccountLabel(account)}</td>
                                    <td>
                                      {adjustedPrior !== undefined
                                        ? formatSignedCurrency(adjustedPrior)
                                        : '-'}
                                    </td>
                                    <td>{formatSignedCurrency(adjustedCurrent)}</td>
                                    <td>
                                      {delta === null
                                        ? '-'
                                        : formatSignedCurrency(delta)}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        ) : (
                          <p className="muted">No account balance data available.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            ) : null}
            {yearMode === 'month'
              ? monthRows.map((month) => {
                  const monthExpanded = expandedMonths.has(month.monthIndex)
                  const explanation = explanationsByMonth.get(month.monthIndex)
                  const priorExplanation =
                    month.monthIndex > 0
                      ? explanationsByMonth.get(month.monthIndex - 1)
                      : undefined
                  return (
                    <Fragment key={`${point.yearIndex}-${month.monthIndex}`}>
                      <tr>
                        <td className="muted">
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              marginLeft: '3.375rem',
                            }}
                          >
                            <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                              <button
                                type="button"
                                title="No detail"
                                aria-label="No detail"
                                onClick={() =>
                                  setExpandedMonths((current) => {
                                    const next = new Set(current)
                                    next.delete(month.monthIndex)
                                    return next
                                  })
                                }
                                style={detailButtonStyle(!monthExpanded)}
                              >
                                <CancelIcon />
                              </button>
                              <button
                                type="button"
                                title="Module detail"
                                aria-label="Module detail"
                                onClick={() =>
                                  setExpandedMonths((current) => {
                                    const next = new Set(current)
                                    if (next.has(month.monthIndex)) {
                                      next.delete(month.monthIndex)
                                    } else {
                                      next.add(month.monthIndex)
                                    }
                                    return next
                                  })
                                }
                                style={detailButtonStyle(monthExpanded)}
                              >
                                <PieIcon />
                              </button>
                            </div>
                            <span>{formatMonthYear(month.date)}</span>
                          </div>
                        </td>
                        <td className="muted">{month.age}</td>
                        <td className="muted">
                          {formatCurrencyForDate(month.totalBalance, month.date)}
                        </td>
                        <td className="muted">
                          {formatCurrencyForDate(month.contributions, month.date)}
                        </td>
                        <td className="muted">
                          {formatCurrencyForDate(month.spending, month.date)}
                        </td>
                      </tr>
                      {monthExpanded ? (
                        <tr className="table-row-highlight">
                          <td colSpan={5} className="expansion">
                            <div className="stack">
                              {explanation ? (
                                <>
                                  <div className="stack">
                                    <strong>Module activity</strong>
                                    <div className="table-wrap">
                                      <table className="table compact selectable">
                                        <thead>
                                          <tr>
                                            <th>Module</th>
                                            <th>Cash</th>
                                            <th>Ord inc</th>
                                            <th>Cap gains</th>
                                            <th>Deductions</th>
                                            <th>Tax exempt</th>
                                            <th>Deposit</th>
                                            <th>Withdraw</th>
                                            <th>Convert</th>
                                            <th>Market</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {explanation.modules
                                            .filter((module) => {
                                              const totals = module.totals
                                              const cashflows = totals.cashflows
                                              const actions = totals.actions
                                              const marketTotal = totals.market?.total ?? 0
                                              const hasActivity =
                                                module.cashflows.length > 0 ||
                                                module.actions.length > 0 ||
                                                (module.marketReturns?.length ?? 0) > 0
                                              return (
                                                hasActivity ||
                                                cashflows.cash !== 0 ||
                                                cashflows.ordinaryIncome !== 0 ||
                                                cashflows.capitalGains !== 0 ||
                                                cashflows.deductions !== 0 ||
                                                cashflows.taxExemptIncome !== 0 ||
                                                actions.deposit !== 0 ||
                                                actions.withdraw !== 0 ||
                                                actions.convert !== 0 ||
                                                marketTotal !== 0
                                              )
                                            })
                                            .map((module) => {
                                            const moduleKey = `${month.monthIndex}:${module.moduleId}`
                                            const moduleExpanded = expandedModules.has(moduleKey)
                                            return (
                                              <Fragment key={moduleKey}>
                                                <tr>
                                                  <td>
                                                    <div
                                                      style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                      }}
                                                    >
                                                      <div
                                                        style={{ display: 'inline-flex', gap: '0.25rem' }}
                                                      >
                                                        <button
                                                          type="button"
                                                          title="No detail"
                                                          aria-label="No detail"
                                                          onClick={() =>
                                                            setExpandedModules((current) => {
                                                              const next = new Set(current)
                                                              next.delete(moduleKey)
                                                              return next
                                                            })
                                                          }
                                                          style={detailButtonStyle(!moduleExpanded)}
                                                        >
                                                          <CancelIcon />
                                                        </button>
                                                        <button
                                                          type="button"
                                                          title="Module detail"
                                                          aria-label="Module detail"
                                                          onClick={() =>
                                                            setExpandedModules((current) => {
                                                              const next = new Set(current)
                                                              if (next.has(moduleKey)) {
                                                                next.delete(moduleKey)
                                                              } else {
                                                                next.add(moduleKey)
                                                              }
                                                              return next
                                                            })
                                                          }
                                                          style={detailButtonStyle(moduleExpanded)}
                                                        >
                                                          <PieIcon />
                                                        </button>
                                                      </div>
                                                      <span>
                                                        {moduleLabels[module.moduleId] ?? module.moduleId}
                                                      </span>
                                                    </div>
                                                  </td>
                                                  <td>
                                                    {formatSignedCurrencyForDate(
                                                      module.totals.cashflows.cash,
                                                      month.date,
                                                    )}
                                                  </td>
                                                  <td>
                                                    {formatSignedCurrencyForDate(
                                                      module.totals.cashflows.ordinaryIncome,
                                                      month.date,
                                                    )}
                                                  </td>
                                                  <td>
                                                    {formatSignedCurrencyForDate(
                                                      module.totals.cashflows.capitalGains,
                                                      month.date,
                                                    )}
                                                  </td>
                                                  <td>
                                                    {formatSignedCurrencyForDate(
                                                      module.totals.cashflows.deductions,
                                                      month.date,
                                                    )}
                                                  </td>
                                                  <td>
                                                    {formatSignedCurrencyForDate(
                                                      module.totals.cashflows.taxExemptIncome,
                                                      month.date,
                                                    )}
                                                  </td>
                                                  <td>
                                                    {formatSignedCurrencyForDate(
                                                      module.totals.actions.deposit,
                                                      month.date,
                                                    )}
                                                  </td>
                                                  <td>
                                                    {formatSignedCurrencyForDate(
                                                      module.totals.actions.withdraw,
                                                      month.date,
                                                    )}
                                                  </td>
                                                  <td>
                                                    {formatSignedCurrencyForDate(
                                                      module.totals.actions.convert,
                                                      month.date,
                                                    )}
                                                  </td>
                                                  <td>
                                                    {module.totals.market
                                                      ? formatSignedCurrencyForDate(
                                                          module.totals.market.total,
                                                          month.date,
                                                        )
                                                      : '-'}
                                                  </td>
                                                </tr>
                                                {moduleExpanded ? (
                                                  <tr>
                                                    <td colSpan={10} className="expansion">
                                                      <div className="stack">
                                                        {module.inputs ? (
                                                          <div className="stack">
                                                            <strong className="muted">Inputs</strong>
                                                            <table className="table compact">
                                                              <tbody>
                                                                {module.inputs.map((input) => (
                                                                  <tr key={input.label}>
                                                                    <td className="muted">{input.label}</td>
                                                                    <td>{formatMetricValue(input.value)}</td>
                                                                  </tr>
                                                                ))}
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        ) : null}
                                                        {module.checkpoints ? (
                                                          <div className="stack">
                                                            <strong className="muted">Checkpoints</strong>
                                                            <table className="table compact">
                                                              <tbody>
                                                                {module.checkpoints.map((checkpoint) => (
                                                                  <tr key={checkpoint.label}>
                                                                    <td className="muted">{checkpoint.label}</td>
                                                                    <td>
                                                                      {formatMetricValue(checkpoint.value)}
                                                                    </td>
                                                                  </tr>
                                                                ))}
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        ) : null}
                                                        {module.cashflows.length > 0 ? (
                                                          <div className="stack">
                                                            <strong className="muted">Cashflows</strong>
                                                            <div className="table-wrap">
                                                              <table className="table compact">
                                                                <thead>
                                                                  <tr>
                                                                    <th>Label</th>
                                                                    <th>Category</th>
                                                                    <th>Cash</th>
                                                                    <th>Ord inc</th>
                                                                    <th>Cap gains</th>
                                                                    <th>Deductions</th>
                                                                    <th>Tax exempt</th>
                                                                  </tr>
                                                                </thead>
                                                                <tbody>
                                                                  {module.cashflows.map((flow) => (
                                                                    <tr key={flow.id}>
                                                                      <td>{flow.label}</td>
                                                                      <td className="muted">{flow.category}</td>
                                                                      <td>
                                                                        {formatSignedCurrencyForDate(
                                                                          flow.cash,
                                                                          month.date,
                                                                        )}
                                                                      </td>
                                                                      <td>
                                                                        {formatSignedCurrencyForDate(
                                                                          flow.ordinaryIncome ?? 0,
                                                                          month.date,
                                                                        )}
                                                                      </td>
                                                                      <td>
                                                                        {formatSignedCurrencyForDate(
                                                                          flow.capitalGains ?? 0,
                                                                          month.date,
                                                                        )}
                                                                      </td>
                                                                      <td>
                                                                        {formatSignedCurrencyForDate(
                                                                          flow.deductions ?? 0,
                                                                          month.date,
                                                                        )}
                                                                      </td>
                                                                      <td>
                                                                        {formatSignedCurrencyForDate(
                                                                          flow.taxExemptIncome ?? 0,
                                                                          month.date,
                                                                        )}
                                                                      </td>
                                                                    </tr>
                                                                  ))}
                                                                </tbody>
                                                              </table>
                                                            </div>
                                                          </div>
                                                        ) : null}
                                                        {module.actions.length > 0 ? (
                                                          <div className="stack">
                                                            <strong className="muted">Actions</strong>
                                                            <div className="table-wrap">
                                                              <table className="table compact">
                                                                <thead>
                                                                  <tr>
                                                                    <th>Label</th>
                                                                    <th>Kind</th>
                                                                    <th>Amount</th>
                                                                    <th>Resolved</th>
                                                                    <th>Source</th>
                                                                    <th>Target</th>
                                                                  </tr>
                                                                </thead>
                                                                <tbody>
                                                                  {module.actions.map((action) => (
                                                                    <tr key={action.id}>
                                                                      <td>{action.label ?? action.id}</td>
                                                                      <td className="muted">{action.kind}</td>
                                                                      <td>
                                                                        {formatSignedCurrencyForDate(
                                                                          action.amount,
                                                                          month.date,
                                                                        )}
                                                                      </td>
                                                                      <td>
                                                                        {formatSignedCurrencyForDate(
                                                                          action.resolvedAmount,
                                                                          month.date,
                                                                        )}
                                                                      </td>
                                                                      <td className="muted">
                                                                        {action.sourceHoldingId
                                                                          ? getHoldingLabel(action.sourceHoldingId)
                                                                          : '-'}
                                                                      </td>
                                                                      <td className="muted">
                                                                        {action.targetHoldingId
                                                                          ? getHoldingLabel(action.targetHoldingId)
                                                                          : '-'}
                                                                      </td>
                                                                    </tr>
                                                                  ))}
                                                                </tbody>
                                                              </table>
                                                            </div>
                                                          </div>
                                                        ) : null}
                                                        {module.marketReturns?.length ? (
                                                          <div className="stack">
                                                            <strong className="muted">Market returns</strong>
                                                            <div className="table-wrap">
                                                              <table className="table compact">
                                                                <thead>
                                                                  <tr>
                                                                    <th>Account</th>
                                                                    <th>Start</th>
                                                                    <th>End</th>
                                                                    <th>Change</th>
                                                                    <th>Rate</th>
                                                                  </tr>
                                                                </thead>
                                                                <tbody>
                                                                  {module.marketReturns.map((entry) => (
                                                                    <tr key={`${entry.kind}-${entry.id}`}>
                                                                      <td>
                                                                        {entry.kind === 'cash'
                                                                          ? accountLookup.cashById.get(entry.id) ??
                                                                            entry.id
                                                                          : getHoldingLabel(entry.id)}
                                                                      </td>
                                                                      <td>
                                                                        {formatSignedCurrencyForDate(
                                                                          entry.balanceStart,
                                                                          month.date,
                                                                        )}
                                                                      </td>
                                                                      <td>
                                                                        {formatSignedCurrencyForDate(
                                                                          entry.balanceEnd,
                                                                          month.date,
                                                                        )}
                                                                      </td>
                                                                      <td>
                                                                        {formatSignedCurrencyForDate(
                                                                          entry.amount,
                                                                          month.date,
                                                                        )}
                                                                      </td>
                                                                      <td>{formatRate(entry.rate)}</td>
                                                                    </tr>
                                                                  ))}
                                                                </tbody>
                                                              </table>
                                                            </div>
                                                          </div>
                                                        ) : null}
                                                      </div>
                                                    </td>
                                                  </tr>
                                                ) : null}
                                              </Fragment>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                  <div className="stack">
                                    <strong>Account balances</strong>
                                    <div className="table-wrap">
                                      <table className="table compact">
                                        <thead>
                                          <tr>
                                            <th>Account</th>
                                            <th>Prior</th>
                                            <th>Current</th>
                                            <th>Change</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {explanation.accounts.map((account) => {
                                            const priorBalance = priorExplanation
                                              ? priorExplanation.accounts.find(
                                                  (entry) =>
                                                    entry.id === account.id &&
                                                    entry.kind === account.kind,
                                                )?.balance
                                              : month.monthIndex === 0
                                                ? initialBalances.get(
                                                    `${account.kind}:${account.id}`,
                                                  )
                                                : undefined
                                            const priorDate = priorExplanation?.date
                                            const adjustedPrior =
                                              priorBalance !== undefined
                                                ? adjustForInflation(priorBalance, priorDate)
                                                : undefined
                                            const adjustedCurrent = adjustForInflation(
                                              account.balance,
                                              month.date,
                                            )
                                            const delta =
                                              adjustedPrior !== undefined
                                                ? adjustedCurrent - adjustedPrior
                                                : null
                                            return (
                                              <tr key={`${account.kind}-${account.id}`}>
                                                <td>{getAccountLabel(account)}</td>
                                                <td>
                                                  {adjustedPrior !== undefined
                                                    ? formatSignedCurrency(adjustedPrior)
                                                    : '-'}
                                                </td>
                                                <td>{formatSignedCurrency(adjustedCurrent)}</td>
                                                <td>
                                                  {delta === null ? '-' : formatSignedCurrency(delta)}
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <p className="muted">No explanation data available.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })
              : null}
          </Fragment>
        )
      })}
        </tbody>
      </table>
      ) : null}
    </div>
  )
}

export default RunResultsTimeline
