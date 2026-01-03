import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { nonInvestmentAccountSchema, type NonInvestmentAccount } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'
import { now } from '../../core/utils/time'

const NonInvestmentAccountDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/accounts'
  const storage = useAppStore((state) => state.storage)
  const [account, setAccount] = useState<NonInvestmentAccount | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const defaultValues = useMemo(
    () => ({
      id: '',
      name: '',
      balance: 0,
      interestRate: 0,
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
  } = useForm<NonInvestmentAccount>({
    resolver: zodResolver(nonInvestmentAccountSchema),
    defaultValues,
  })

  const loadAccount = useCallback(async () => {
    if (!id) {
      setAccount(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const data = await storage.nonInvestmentAccountRepo.get(id)
    setAccount(data ?? null)
    if (data) {
      reset(data)
    }
    setIsLoading(false)
  }, [id, reset, storage])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccount()
  }, [loadAccount])

  const onSubmit = async (values: NonInvestmentAccount) => {
    const timestamp = now()
    const next = {
      ...values,
      createdAt: values.createdAt || timestamp,
      updatedAt: timestamp,
    }
    await storage.nonInvestmentAccountRepo.upsert(next)
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
        subtitle="Cash account"
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

          <label className="field">
            <span>Balance</span>
            <input type="number" {...register('balance', { valueAsNumber: true })} />
            {errors.balance ? <span className="error">{errors.balance.message}</span> : null}
          </label>

          <label className="field">
            <span>Interest rate</span>
            <input
              type="number"
              step="0.001"
              {...register('interestRate', { valueAsNumber: true })}
            />
            {errors.interestRate ? (
              <span className="error">{errors.interestRate.message}</span>
            ) : null}
          </label>
        </div>

        <div className="button-row">
          <button className="button" type="submit" disabled={isSubmitting || !isDirty}>
            Save account
          </button>
        </div>
      </form>
    </section>
  )
}

export default NonInvestmentAccountDetailPage
