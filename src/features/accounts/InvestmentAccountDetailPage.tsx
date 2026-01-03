import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  investmentAccountSchema,
  type InvestmentAccount,
  type InvestmentAccountHolding,
} from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'
import { createUuid } from '../../core/utils/uuid'
import { now } from '../../core/utils/time'

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

const createHolding = (investmentAccountId: string): InvestmentAccountHolding => {
  const now = Date.now()
  return {
    id: createUuid(),
    name: 'S&P 500',
    taxType: 'taxable',
    balance: 50000,
    holdingType: 'sp500',
    return: 0.05,
    risk: 0.15,
    investmentAccountId,
    createdAt: now,
    updatedAt: now,
  }
}

const InvestmentAccountDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const storage = useAppStore((state) => state.storage)
  const [account, setAccount] = useState<InvestmentAccount | null>(null)
  const [holdings, setHoldings] = useState<InvestmentAccountHolding[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const defaultValues = useMemo(
    () => ({
      id: '',
      name: '',
      createdAt: 0,
      updatedAt: 0,
    }),
    [],
  )

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<InvestmentAccount>({
    resolver: zodResolver(investmentAccountSchema),
    defaultValues,
  })

  const loadAccount = useCallback(async () => {
    if (!id) {
      setAccount(null)
      setHoldings([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const data = await storage.investmentAccountRepo.get(id)
    setAccount(data ?? null)
    if (data) {
      reset(data)
      const items = await storage.investmentAccountHoldingRepo.listForAccount(data.id)
      setHoldings(items)
    }
    setIsLoading(false)
  }, [id, reset, storage])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccount()
  }, [loadAccount])

  const handleAddHolding = async () => {
    if (!account) {
      return
    }
    const holding = createHolding(account.id)
    await storage.investmentAccountHoldingRepo.upsert(holding)
    await loadAccount()
  }

  const onSubmit = async (values: InvestmentAccount) => {
    const timestamp = now()
    const next = {
      ...values,
      createdAt: values.createdAt || timestamp,
      updatedAt: timestamp,
    }
    await storage.investmentAccountRepo.upsert(next)
    setAccount(next)
    reset(next)
  }

  if (isLoading) {
    return <p className="muted">Loading account...</p>
  }

  if (!account) {
    return (
      <section className="stack">
        <h1>Account not found</h1>
        <Link className="link" to="/accounts">
          Back to accounts
        </Link>
      </section>
    )
  }

  return (
    <section className="stack">
      <PageHeader
        title={account.name}
        subtitle="Investment account"
        actions={
          <Link className="link" to="/accounts">
            Back
          </Link>
        }
      />

      <form className="card stack" onSubmit={handleSubmit(onSubmit)}>
        <input type="hidden" {...register('id')} />
        <input type="hidden" {...register('createdAt', { valueAsNumber: true })} />
        <input type="hidden" {...register('updatedAt', { valueAsNumber: true })} />
        <div className="form-grid">
          <label className="field">
            <span>Name</span>
            <input {...register('name')} />
            {errors.name ? <span className="error">{errors.name.message}</span> : null}
          </label>
        </div>

        <div className="button-row">
          <button className="button" type="submit" disabled={isSubmitting || !isDirty}>
            Save account
          </button>
        </div>
      </form>

      <div className="card stack">
        <div className="row">
          <h2>Holdings</h2>
          <span className="muted">{holdings.length} total</span>
        </div>
        <button className="button secondary" type="button" onClick={handleAddHolding}>
          Add holding
        </button>
        {holdings.length === 0 ? (
          <p className="muted">No holdings yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Tax type</th>
                <th>Balance</th>
                <th>Return</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => (
                <tr key={holding.id}>
                  <td>
                    <Link className="link" to={`/accounts/holding/${holding.id}`}>
                      {holding.name}
                    </Link>
                  </td>
                  <td>{holding.taxType}</td>
                  <td>{formatCurrency(holding.balance)}</td>
                  <td>{holding.return}</td>
                  <td>{holding.risk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default InvestmentAccountDetailPage
