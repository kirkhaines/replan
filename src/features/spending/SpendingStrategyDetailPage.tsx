import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { SpendingLineItem, SpendingStrategy } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import { createUuid } from '../../core/utils/uuid'
import PageHeader from '../../components/PageHeader'

const SpendingStrategyDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const storage = useAppStore((state) => state.storage)
  const backTo = (location.state as { from?: string } | null)?.from ?? '/scenarios'
  const [strategy, setStrategy] = useState<SpendingStrategy | null>(null)
  const [lineItems, setLineItems] = useState<SpendingLineItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const formatCurrency = (value: number) =>
    value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

  const categoryOptions = useMemo(() => {
    const baseCategories = [
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
    ]
    const fromItems = lineItems.map((item) => item.category).filter(Boolean)
    const unique = Array.from(new Set([...fromItems, ...baseCategories]))
    return unique
  }, [lineItems])

  const loadStrategy = useCallback(async () => {
    if (!id) {
      setStrategy(null)
      setLineItems([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const data = await storage.spendingStrategyRepo.get(id)
    if (!data) {
      setStrategy(null)
      setLineItems([])
      setIsLoading(false)
      return
    }
    const items = await storage.spendingLineItemRepo.listForStrategy(data.id)
    setStrategy(data)
    setLineItems(items)
    setIsLoading(false)
  }, [id, storage])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStrategy()
  }, [loadStrategy])

  const handleSave = async () => {
    if (!strategy) {
      return
    }
    const now = Date.now()
    const next = { ...strategy, updatedAt: now }
    await storage.spendingStrategyRepo.upsert(next)
    setStrategy(next)
  }

  const handleAddLineItem = async () => {
    if (!strategy) {
      return
    }
    const now = Date.now()
    const item: SpendingLineItem = {
      id: createUuid(),
      name: 'New item',
      spendingStrategyId: strategy.id,
      category: 'General',
      needAmount: 0,
      wantAmount: 0,
      startDate: '',
      endDate: '',
      futureWorkPeriodId: undefined,
      isPreTax: false,
      isCharitable: false,
      isWork: false,
      targetInvestmentAccountHoldingId: undefined,
      inflationType: 'cpi',
      createdAt: now,
      updatedAt: now,
    }
    await storage.spendingLineItemRepo.upsert(item)
    await loadStrategy()
    navigate(`/spending-line-items/${item.id}`, {
      state: { from: location.pathname, parentFrom: backTo },
    })
  }

  const handleRemoveLineItem = async (itemId: string) => {
    const confirmed = window.confirm('Remove this spending line item?')
    if (!confirmed) {
      return
    }
    await storage.spendingLineItemRepo.remove(itemId)
    await loadStrategy()
  }

  if (isLoading) {
    return <p className="muted">Loading spending strategy...</p>
  }

  if (!strategy) {
    return (
      <section className="stack">
        <h1>Spending strategy not found</h1>
        <Link className="link" to={backTo}>
          Back
        </Link>
      </section>
    )
  }

  return (
    <section className="stack">
      <PageHeader
        title="Spending strategy"
        subtitle="Edit spending strategy details and line items."
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
            <input
              value={strategy.name}
              onChange={(event) => setStrategy({ ...strategy, name: event.target.value })}
            />
          </label>
        </div>
        <div className="button-row">
          <button className="button" type="button" onClick={handleSave}>
            Save strategy
          </button>
        </div>
      </div>

      <div className="card stack">
        <div className="row">
          <h2>Spending line items</h2>
          <button className="button secondary" type="button" onClick={handleAddLineItem}>
            Add spending line item
          </button>
        </div>
        {lineItems.length === 0 ? (
          <p className="muted">No spending line items yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Need</th>
                <th>Want</th>
                <th>Start</th>
                <th>End</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link
                      className="link"
                      to={`/spending-line-items/${item.id}`}
                      state={{ from: location.pathname, parentFrom: backTo }}
                    >
                      {item.name}
                    </Link>
                  </td>
                  <td>{item.category}</td>
                  <td>{formatCurrency(item.needAmount)}</td>
                  <td>{formatCurrency(item.wantAmount)}</td>
                  <td>{item.startDate || 'Open'}</td>
                  <td>{item.endDate || 'Open'}</td>
                  <td>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => void handleRemoveLineItem(item.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default SpendingStrategyDetailPage
