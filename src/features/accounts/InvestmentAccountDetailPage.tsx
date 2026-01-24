import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useFieldArray, useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  investmentAccountSchema,
  taxTypeSchema,
  type InvestmentAccount,
  type InvestmentAccountHolding,
} from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'
import { createUuid } from '../../core/utils/uuid'
import { now } from '../../core/utils/time'
import useUnsavedChangesWarning from '../../hooks/useUnsavedChangesWarning'

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

const createHolding = (investmentAccountId: string): InvestmentAccountHolding => {
  const now = Date.now()
  const nowIso = new Date(now).toISOString().slice(0, 10)
  return {
    id: createUuid(),
    name: 'S&P 500',
    taxType: 'taxable',
    balance: 50000,
    costBasisEntries: [{ date: nowIso, amount: 50000 }],
    holdingType: 'sp500',
    returnRate: 0.1,
    returnStdDev: 0.16,
    investmentAccountId,
    createdAt: now,
    updatedAt: now,
  }
}

const InvestmentAccountDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/accounts'
  const storage = useAppStore((state) => state.storage)
  const [account, setAccount] = useState<InvestmentAccount | null>(null)
  const [holdings, setHoldings] = useState<InvestmentAccountHolding[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const defaultValues = useMemo(
    () => ({
      id: '',
      name: '',
      contributionEntries: [],
      createdAt: 0,
      updatedAt: 0,
    }),
    [],
  )

  const resolver = zodResolver(investmentAccountSchema) as unknown as Resolver<InvestmentAccount>

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<InvestmentAccount>({
    resolver,
    defaultValues,
  })

  const {
    fields: contributionFields,
    append: appendContribution,
    remove: removeContribution,
  } = useFieldArray({
    control,
    name: 'contributionEntries',
  })

  useUnsavedChangesWarning(isDirty)

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
      contributionEntries: values.contributionEntries ?? account?.contributionEntries ?? [],
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
        <Link className="link" to={backTo}>
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
          <Link className="link" to={backTo}>
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

        <div className="stack">
          <div className="row">
            <h3>Contribution entries</h3>
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                appendContribution({
                  date: new Date().toISOString().slice(0, 10),
                  amount: 0,
                  taxType: 'roth',
                })
              }
            >
              Add entry
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Tax type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contributionFields.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No contribution entries yet.
                  </td>
                </tr>
              ) : (
                contributionFields.map((field, index) => (
                  <tr key={field.id}>
                    <td>
                      <input
                        type="date"
                        {...register(`contributionEntries.${index}.date`)}
                      />
                      {errors.contributionEntries?.[index]?.date ? (
                        <span className="error">
                          {errors.contributionEntries[index]?.date?.message}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        {...register(`contributionEntries.${index}.amount`, {
                          valueAsNumber: true,
                        })}
                      />
                      {errors.contributionEntries?.[index]?.amount ? (
                        <span className="error">
                          {errors.contributionEntries[index]?.amount?.message}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <select {...register(`contributionEntries.${index}.taxType`)}>
                        {taxTypeSchema.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {errors.contributionEntries?.[index]?.taxType ? (
                        <span className="error">
                          {errors.contributionEntries[index]?.taxType?.message}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => removeContribution(index)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
                <th>Std dev of return</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => (
                <tr key={holding.id}>
                  <td>
                    <Link
                      className="link"
                      to={`/accounts/holding/${holding.id}`}
                      state={{ from: location.pathname, parentFrom: backTo }}
                    >
                      {holding.name}
                    </Link>
                  </td>
                  <td>{holding.taxType}</td>
                  <td>{formatCurrency(holding.balance)}</td>
                  <td>{holding.returnRate}</td>
                  <td>{holding.returnStdDev}</td>
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
