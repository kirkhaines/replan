import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { SocialSecurityStrategy, Person } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'
import { buildSsaEstimate } from '../../core/sim/ssa'

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

const formatNumber = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 })

const addYearsToIsoDate = (isoDate: string, years: number) => {
  const date = new Date(isoDate)
  date.setFullYear(date.getFullYear() + years)
  return date.toISOString().slice(0, 10)
}

const normalizeSocialStrategy = (
  strategy: SocialSecurityStrategy,
  person: Person,
): SocialSecurityStrategy => {
  const legacy = strategy as SocialSecurityStrategy & { startAge?: number }
  if (strategy.startDate) {
    return strategy
  }
  const startAge = legacy.startAge ?? 67
  return {
    ...strategy,
    startDate: addYearsToIsoDate(person.dateOfBirth, startAge),
  }
}

const SsaBenefitDetailsPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const backTo = (location.state as { from?: string } | null)?.from ?? `/person-strategies/${id}`
  const storage = useAppStore((state) => state.storage)
  const [estimate, setEstimate] = useState<ReturnType<typeof buildSsaEstimate> | null>(null)
  const [person, setPerson] = useState<Person | null>(null)
  const [cpiRate, setCpiRate] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError('Missing person strategy id.')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)
      const strategy = await storage.personStrategyRepo.get(id)
      if (!strategy) {
        setError('Person strategy not found.')
        setIsLoading(false)
        return
      }

      const [personRecord, socialStrategyRecord, scenario] = await Promise.all([
        storage.personRepo.get(strategy.personId),
        storage.socialSecurityStrategyRepo.get(strategy.socialSecurityStrategyId),
        storage.scenarioRepo.get(strategy.scenarioId),
      ])

      if (!personRecord || !socialStrategyRecord || !scenario) {
        setError('Missing person, Social Security strategy, or scenario data.')
        setIsLoading(false)
        return
      }

      const [earnings, spendingLineItems, futureWorkPeriods, wageIndex, bendPoints, adjustments] =
        await Promise.all([
          storage.socialSecurityEarningsRepo.listForPerson(personRecord.id),
          storage.spendingLineItemRepo.listForStrategy(scenario.spendingStrategyId),
          storage.futureWorkPeriodRepo.listForStrategy(strategy.futureWorkStrategyId),
          storage.ssaWageIndexRepo.list(),
          storage.ssaBendPointRepo.list(),
          storage.ssaRetirementAdjustmentRepo.list(),
        ])

      const normalizedSocial = normalizeSocialStrategy(socialStrategyRecord, personRecord)
      const estimateResult = buildSsaEstimate({
        person: personRecord,
        socialStrategy: normalizedSocial,
        scenario,
        earnings,
        futureWorkPeriods,
        spendingLineItems,
        wageIndex,
        bendPoints,
        retirementAdjustments: adjustments,
      })

      setPerson(personRecord)
      setCpiRate(scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0)
      setEstimate(estimateResult)
      setIsLoading(false)
    }

    void load()
  }, [id, storage])

  const summary = useMemo(() => estimate?.details ?? null, [estimate])
  const presentDayBenefit = useMemo(() => {
    if (!summary) {
      return null
    }
    const currentYear = new Date().getFullYear()
    const yearsDelta = summary.claimYear - currentYear
    if (cpiRate === 0 || yearsDelta === 0) {
      return summary.adjustment.adjustedBenefit
    }
    return summary.adjustment.adjustedBenefit / Math.pow(1 + cpiRate, yearsDelta)
  }, [cpiRate, summary])

  if (isLoading) {
    return <p className="muted">Loading benefit details...</p>
  }

  if (error) {
    return (
      <section className="stack">
        <h1>Benefit details unavailable</h1>
        <p className="error">{error}</p>
        <Link className="link" to={backTo}>
          Back
        </Link>
      </section>
    )
  }

  if (!estimate || !summary || !person) {
    return (
      <section className="stack">
        <h1>Benefit details unavailable</h1>
        <Link className="link" to={backTo}>
          Back
        </Link>
      </section>
    )
  }

  return (
    <section className="stack">
      <PageHeader
        title="Social Security benefit calculation"
        subtitle={`${person.name} · Claim date ${summary.claimDate}`}
        actions={
          <Link className="link" to={backTo}>
            Back
          </Link>
        }
      />

      <div className="card stack">
        <h2>Estimated earnings history</h2>
        {summary.earningsRows.length === 0 ? (
          <p className="muted">No earnings data available.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Age</th>
                <th>Year</th>
                <th>Earnings</th>
                <th>Months worked</th>
                <th>Source</th>
                <th>Indexed wages</th>
              </tr>
            </thead>
            <tbody>
              {summary.earningsRows.map((row) => (
                <tr
                  key={row.year}
                  className={row.includedInTop35 ? 'table-row-highlight' : undefined}
                >
                  <td>{row.age}</td>
                  <td>{row.year}</td>
                  <td>{formatCurrency(row.earnings)}</td>
                  <td>{row.monthsWorked}</td>
                  <td>{row.sourceLabel}</td>
                  <td>{formatCurrency(row.indexedWages)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card stack">
        <h2>Indexed earnings totals</h2>
        <div className="summary">
          <div>
            <span className="muted">Applicable months worked</span>
            <strong>{summary.applicableMonths}</strong>
          </div>
          <div>
            <span className="muted">Indexed wages sum</span>
            <strong>{formatCurrency(summary.indexedWagesSum)}</strong>
          </div>
          <div>
            <span className="muted">Average monthly indexed earnings (AIME)</span>
            <strong>{formatCurrency(summary.aime)}</strong>
          </div>
        </div>
      </div>

      <div className="card stack">
        <h2>AIME bend point bands</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Band</th>
              <th>Band range</th>
              <th>Band amount</th>
              <th>Rate</th>
              <th>Adjusted amount</th>
            </tr>
          </thead>
          <tbody>
            {summary.bands.map((band) => {
              const range =
                band.label === 'First'
                  ? `0 - ${formatNumber(summary.bendPoints.first)}`
                  : band.label === 'Second'
                    ? `${formatNumber(summary.bendPoints.first)} - ${formatNumber(
                        summary.bendPoints.second,
                      )}`
                    : `${formatNumber(summary.bendPoints.second)}+`
              return (
                <tr key={band.label}>
                  <td>{band.label}</td>
                  <td>{range}</td>
                  <td>{formatCurrency(band.amount)}</td>
                  <td>{Math.round(band.rate * 100)}%</td>
                  <td>{formatCurrency(band.adjustedAmount)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Primary insurance amount (PIA)</td>
              <td>{formatCurrency(summary.pia)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="card stack">
        <h2>Retirement adjustment</h2>
        <div className="summary">
          <div>
            <span className="muted">Normal retirement age (months)</span>
            <strong>{summary.adjustment.nraMonths}</strong>
          </div>
          <div>
            <span className="muted">Claim age (months)</span>
            <strong>{summary.adjustment.claimAgeMonths}</strong>
          </div>
          <div>
            <span className="muted">Months early</span>
            <strong>{summary.adjustment.monthsEarly}</strong>
          </div>
          <div>
            <span className="muted">Months delayed</span>
            <strong>{summary.adjustment.monthsDelayed}</strong>
          </div>
          <div>
            <span className="muted">Reduction factor</span>
            <strong>{formatNumber(summary.adjustment.reduction)}</strong>
          </div>
          <div>
            <span className="muted">Delayed credit per month</span>
            <strong>{formatNumber(summary.adjustment.creditPerMonth)}</strong>
          </div>
          <div>
            <span className="muted">Adjustment factor</span>
            <strong>{formatNumber(summary.adjustment.adjustmentFactor)}</strong>
          </div>
        </div>
      </div>

      <div className="card stack">
        <h2>Adjusted monthly benefit</h2>
        <div className="summary">
          <div>
            <span className="muted">Final monthly benefit (claim-year dollars)</span>
            <strong>{formatCurrency(summary.adjustment.adjustedBenefit)}</strong>
          </div>
          <div>
            <span className="muted">Final monthly benefit (present-day dollars)</span>
            <strong>{formatCurrency(presentDayBenefit ?? summary.adjustment.adjustedBenefit)}</strong>
          </div>
        </div>
      </div>
    </section>
  )
}

export default SsaBenefitDetailsPage
