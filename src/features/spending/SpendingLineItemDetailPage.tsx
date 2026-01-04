import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { FutureWorkPeriod, InvestmentAccountHolding, SpendingLineItem } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'
import { inflationTypeSchema } from '../../core/models/enums'

const SpendingLineItemDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const storage = useAppStore((state) => state.storage)
  const backTo = (location.state as { from?: string } | null)?.from ?? '/scenarios'
  const parentFrom = (location.state as { parentFrom?: string } | null)?.parentFrom
  const [item, setItem] = useState<SpendingLineItem | null>(null)
  const [periods, setPeriods] = useState<FutureWorkPeriod[]>([])
  const [holdings, setHoldings] = useState<InvestmentAccountHolding[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadItem = useCallback(async () => {
    if (!id) {
      setItem(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const data = await storage.spendingLineItemRepo.get(id)
    if (!data) {
      setItem(null)
      setPeriods([])
      setHoldings([])
      setCategories([])
      setIsLoading(false)
      return
    }
    const [
      allLineItems,
      scenarioList,
      allPersonStrategies,
      allFutureWorkPeriods,
      allHoldings,
    ] = await Promise.all([
      storage.spendingLineItemRepo.listForStrategy(data.spendingStrategyId),
      storage.scenarioRepo.list(),
      storage.personStrategyRepo.list(),
      storage.futureWorkPeriodRepo.list(),
      storage.investmentAccountHoldingRepo.list(),
    ])

    const scenarioMatches = scenarioList.filter(
      (scenario) => scenario.spendingStrategyId === data.spendingStrategyId,
    )
    const personStrategyIds = new Set(
      scenarioMatches.flatMap((scenario) => scenario.personStrategyIds),
    )
    const investmentAccountIds = new Set(
      scenarioMatches.flatMap((scenario) => scenario.investmentAccountIds),
    )

    const filteredPersonStrategies = allPersonStrategies.filter((strategy) =>
      personStrategyIds.has(strategy.id),
    )
    const futureWorkStrategyIds = new Set(
      filteredPersonStrategies.map((strategy) => strategy.futureWorkStrategyId),
    )
    const filteredPeriods = allFutureWorkPeriods.filter((period) =>
      futureWorkStrategyIds.has(period.futureWorkStrategyId),
    )
    const filteredHoldings = allHoldings.filter((holding) =>
      investmentAccountIds.has(holding.investmentAccountId),
    )

    const normalized = {
      ...data,
      inflationType:
        data.inflationType ? data.inflationType : 'cpi',
    }
    setItem(normalized)
    setCategories(Array.from(new Set(allLineItems.map((item) => item.category))).filter(Boolean))
    setPeriods(filteredPeriods)
    setHoldings(filteredHoldings)
    setIsLoading(false)
  }, [id, storage])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadItem()
  }, [loadItem])

  const handleChange = (
    field: keyof SpendingLineItem,
    value: string | number | boolean | undefined,
  ) => {
    setItem((current) => (current ? { ...current, [field]: value } : current))
  }

  const baseCategories = useMemo(
    () => [
      'Housing',
      'Utilities',
      'Groceries',
      'Transportation',
      'Insurance',
      'Healthcare',
      'Debt',
      'Savings',
      'Entertainment',
      'Travel',
      'Education',
      'Childcare',
      'Taxes',
      'Gifts',
      'Charity',
      'Other',
    ],
    [],
  )

  const categoryOptions = useMemo(
    () => Array.from(new Set([...categories, ...baseCategories])),
    [baseCategories, categories],
  )

  const wantTotal = useMemo(() => {
    if (!item) {
      return 0
    }
    return item.needAmount + item.wantAmount
  }, [item])

  const handleWantTotalChange = (value: number) => {
    if (!item) {
      return
    }
    const nextWant = Math.max(0, value - item.needAmount)
    setItem({ ...item, wantAmount: nextWant })
  }

  const handleFutureWorkPeriodChange = (periodId: string) => {
    if (!item) {
      return
    }
    if (!periodId) {
      setItem({
        ...item,
        futureWorkPeriodId: undefined,
        startDate: '',
        endDate: '',
      })
      return
    }
    const period = periods.find((entry) => entry.id === periodId)
    if (!period) {
      return
    }
    setItem({
      ...item,
      futureWorkPeriodId: periodId,
      startDate: period.startDate,
      endDate: period.endDate,
    })
  }

  const handleSave = async () => {
    if (!item) {
      return
    }
    const now = Date.now()
    const next = { ...item, updatedAt: now }
    await storage.spendingLineItemRepo.upsert(next)
    setItem(next)
  }

  if (isLoading) {
    return <p className="muted">Loading spending line item...</p>
  }

  if (!item) {
    return (
      <section className="stack">
        <h1>Spending line item not found</h1>
        <Link className="link" to={backTo} state={{ from: parentFrom ?? '/scenarios' }}>
          Back
        </Link>
      </section>
    )
  }

  return (
    <section className="stack">
      <PageHeader
        title={item.name}
        subtitle="Spending line item"
        actions={
          <Link className="link" to={backTo} state={{ from: parentFrom ?? '/scenarios' }}>
            Back
          </Link>
        }
      />

      <div className="card stack">
        <div className="line-item-layout">
          <div className="line-item-fields">
            <div className="line-item-row">
              <label className="field">
                <span>Category</span>
                <input
                  list="category-options"
                  value={item.category}
                  onChange={(event) => handleChange('category', event.target.value)}
                />
                <datalist id="category-options">
                  {categoryOptions.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                <span>Name</span>
                <input
                  value={item.name}
                  onChange={(event) => handleChange('name', event.target.value)}
                />
              </label>
            </div>

            <div className="line-item-row">
              <label className="field">
                <span>Need (monthly)</span>
                <input
                  type="number"
                  value={item.needAmount}
                  onChange={(event) => handleChange('needAmount', Number(event.target.value))}
                />
              </label>
              <label className="field">
                <span>Want (monthly)</span>
                <input
                  type="number"
                  value={item.wantAmount}
                  onChange={(event) => handleChange('wantAmount', Number(event.target.value))}
                />
              </label>
              <label className="field">
                <span>Want total (monthly)</span>
                <input
                  type="number"
                  value={wantTotal}
                  onChange={(event) => handleWantTotalChange(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="line-item-row">
              <label className="field">
                <span>Future work period</span>
                <select
                  value={item.futureWorkPeriodId ?? ''}
                  onChange={(event) => handleFutureWorkPeriodChange(event.target.value)}
                >
                  <option value="">None</option>
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Start date</span>
                <input
                  type="date"
                  value={item.startDate}
                  readOnly={Boolean(item.futureWorkPeriodId)}
                  onChange={(event) => handleChange('startDate', event.target.value)}
                />
              </label>
              <label className="field">
                <span>End date</span>
                <input
                  type="date"
                  value={item.endDate}
                  readOnly={Boolean(item.futureWorkPeriodId)}
                  onChange={(event) => handleChange('endDate', event.target.value)}
                />
              </label>
            </div>

            <div className="line-item-row">
              <label className="field">
                <span>Investment target holding</span>
                <select
                  value={item.targetInvestmentAccountHoldingId ?? ''}
                  onChange={(event) =>
                    handleChange('targetInvestmentAccountHoldingId', event.target.value || undefined)
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

            <div className="line-item-row">
              <label className="field">
                <span>Inflation type</span>
                <select
                  value={item.inflationType}
                  onChange={(event) => handleChange('inflationType', event.target.value)}
                >
                  {inflationTypeSchema.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="line-item-flags">
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={item.isPreTax}
                onChange={(event) => handleChange('isPreTax', event.target.checked)}
              />
              <span>Pre-tax</span>
            </label>
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={item.isCharitable}
                onChange={(event) => handleChange('isCharitable', event.target.checked)}
              />
              <span>Charitable</span>
            </label>
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={item.isWork}
                onChange={(event) => handleChange('isWork', event.target.checked)}
              />
              <span>Work</span>
            </label>
          </div>
        </div>

        <div className="button-row">
          <button className="button" type="button" onClick={handleSave}>
            Save line item
          </button>
        </div>
      </div>
    </section>
  )
}

export default SpendingLineItemDetailPage
