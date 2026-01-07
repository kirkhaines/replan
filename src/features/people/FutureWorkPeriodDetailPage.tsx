import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { FutureWorkPeriod, InvestmentAccountHolding } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'

const FutureWorkPeriodDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/scenarios'
  const storage = useAppStore((state) => state.storage)
  const [period, setPeriod] = useState<FutureWorkPeriod | null>(null)
  const [holdings, setHoldings] = useState<InvestmentAccountHolding[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const normalizePeriod = (value: FutureWorkPeriod): FutureWorkPeriod => {
    const contributionType = value['401kContributionType']
    const employerHoldingId = value['401kEmployerMatchHoldingId']
    const hsaHoldingId = value['hsaInvestmentAccountHoldingId']
    return {
      ...value,
      '401kContributionType': contributionType ? contributionType : 'fixed',
      '401kContributionAnnual': value['401kContributionAnnual'] ?? 0,
      '401kContributionPct': value['401kContributionPct'] ?? 0,
      '401kMatchPctCap': value['401kMatchPctCap'] ?? 0,
      '401kMatchRatio': value['401kMatchRatio'] ?? 0,
      '401kEmployerMatchHoldingId': employerHoldingId
        ? employerHoldingId
        : value['401kInvestmentAccountHoldingId'],
      'hsaContributionAnnual': value['hsaContributionAnnual'] ?? 0,
      'hsaEmployerContributionAnnual': value['hsaEmployerContributionAnnual'] ?? 0,
      'hsaUseMaxLimit': value['hsaUseMaxLimit'] ?? false,
      'hsaInvestmentAccountHoldingId': hsaHoldingId ? hsaHoldingId : null,
    }
  }

  const loadPeriod = useCallback(async () => {
    if (!id) {
      setPeriod(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const [data, holdingsList] = await Promise.all([
      storage.futureWorkPeriodRepo.get(id),
      storage.investmentAccountHoldingRepo.list(),
    ])
    setPeriod(data ? normalizePeriod(data) : null)
    setHoldings(holdingsList)
    setIsLoading(false)
  }, [id, storage])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPeriod()
  }, [loadPeriod])

  const handleChange = (
    field: keyof FutureWorkPeriod,
    value: string | number | boolean | null,
  ) => {
    setPeriod((current) => (current ? { ...current, [field]: value } : current))
  }

  const handleSave = async () => {
    if (!period) {
      return
    }
    const now = Date.now()
    const next = { ...period, updatedAt: now }
    await storage.futureWorkPeriodRepo.upsert(next)
    setPeriod(next)
  }

  if (isLoading) {
    return <p className="muted">Loading future work period...</p>
  }

  if (!period) {
    return (
      <section className="stack">
        <h1>Future work period not found</h1>
        <Link className="link" to={backTo}>
          Back to scenarios
        </Link>
      </section>
    )
  }

  return (
    <section className="stack">
      <PageHeader
        title={period.name}
        subtitle="Future work period"
        actions={
          <Link className="link" to={backTo}>
            Back
          </Link>
        }
      />

      <div className="card stack">
        <div className="form-grid">
          <label className="field">
            <span>Name</span>
            <input value={period.name} onChange={(event) => handleChange('name', event.target.value)} />
          </label>

          <label className="field">
            <span>Start date</span>
            <input
              type="date"
              value={period.startDate ?? ''}
              onChange={(event) =>
                handleChange('startDate', event.target.value || null)
              }
            />
          </label>

          <label className="field">
            <span>End date</span>
            <input
              type="date"
              value={period.endDate ?? ''}
              onChange={(event) => handleChange('endDate', event.target.value || null)}
            />
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Salary</span>
            <input
              type="number"
              value={period.salary}
              onChange={(event) => handleChange('salary', Number(event.target.value))}
            />
          </label>

          <label className="field">
            <span>Bonus</span>
            <input
              type="number"
              value={period.bonus}
              onChange={(event) => handleChange('bonus', Number(event.target.value))}
            />
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>401k match pct cap</span>
            <input
              type="number"
              step="0.01"
              value={period['401kMatchPctCap']}
              onChange={(event) =>
                handleChange('401kMatchPctCap', Number(event.target.value))
              }
            />
          </label>

          <label className="field">
            <span>401k match ratio</span>
            <input
              type="number"
              step="0.01"
              value={period['401kMatchRatio']}
              onChange={(event) =>
                handleChange('401kMatchRatio', Number(event.target.value))
              }
            />
          </label>

          <label className="field">
            <span>401k employee holding</span>
            <select
              value={period['401kInvestmentAccountHoldingId']}
              onChange={(event) =>
                handleChange('401kInvestmentAccountHoldingId', event.target.value)
              }
            >
              {holdings.length === 0 ? <option value="">No holdings available</option> : null}
              {holdings.map((holding) => (
                <option key={holding.id} value={holding.id}>
                  {holding.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>401k employer match holding</span>
            <select
              value={period['401kEmployerMatchHoldingId']}
              onChange={(event) =>
                handleChange('401kEmployerMatchHoldingId', event.target.value)
              }
            >
              {holdings.length === 0 ? <option value="">No holdings available</option> : null}
              {holdings.map((holding) => (
                <option key={holding.id} value={holding.id}>
                  {holding.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>401k contribution type</span>
            <select
              value={period['401kContributionType']}
              onChange={(event) =>
                handleChange('401kContributionType', event.target.value)
              }
            >
              <option value="fixed">Fixed annual</option>
              <option value="percent">Percent of salary</option>
              <option value="max">Max allowed</option>
            </select>
          </label>

          <label className="field">
            <span>401k contribution (annual)</span>
            <input
              type="number"
              value={period['401kContributionAnnual']}
              onChange={(event) =>
                handleChange('401kContributionAnnual', Number(event.target.value))
              }
            />
          </label>

          <label className="field">
            <span>401k contribution pct</span>
            <input
              type="number"
              step="0.01"
              value={period['401kContributionPct']}
              onChange={(event) =>
                handleChange('401kContributionPct', Number(event.target.value))
              }
            />
          </label>

        </div>

        <div className="form-grid">
          <label className="field">
            <span>HSA employee contribution (annual)</span>
            <input
              type="number"
              value={period['hsaContributionAnnual']}
              onChange={(event) =>
                handleChange('hsaContributionAnnual', Number(event.target.value))
              }
            />
          </label>

          <label className="field checkbox">
            <input
              type="checkbox"
              checked={period['hsaUseMaxLimit']}
              onChange={(event) =>
                handleChange('hsaUseMaxLimit', event.target.checked)
              }
            />
            <span>Use max HSA limit</span>
          </label>

          <label className="field">
            <span>HSA employer credit (annual)</span>
            <input
              type="number"
              value={period['hsaEmployerContributionAnnual']}
              onChange={(event) =>
                handleChange('hsaEmployerContributionAnnual', Number(event.target.value))
              }
            />
          </label>

          <label className="field">
            <span>HSA holding</span>
            <select
              value={period['hsaInvestmentAccountHoldingId'] ?? ''}
              onChange={(event) =>
                handleChange('hsaInvestmentAccountHoldingId', event.target.value || null)
              }
            >
              <option value="">None</option>
              {holdings.map((holding) => (
                <option key={holding.id} value={holding.id}>
                  {holding.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Includes health insurance</span>
            <select
              value={period.includesHealthInsurance ? 'yes' : 'no'}
              onChange={(event) =>
                handleChange('includesHealthInsurance', event.target.value === 'yes')
              }
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>

        <div className="button-row">
          <button className="button" type="button" onClick={handleSave}>
            Save period
          </button>
        </div>
      </div>
    </section>
  )
}

export default FutureWorkPeriodDetailPage
