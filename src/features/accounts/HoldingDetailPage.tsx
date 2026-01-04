import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  investmentAccountHoldingSchema,
  holdingTypeSchema,
  taxTypeSchema,
  type InvestmentAccountHolding,
} from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'
import { now } from '../../core/utils/time'

const HoldingDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/accounts'
  const parentFrom = (location.state as { parentFrom?: string } | null)?.parentFrom
  const storage = useAppStore((state) => state.storage)
  const [holding, setHolding] = useState<InvestmentAccountHolding | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const defaultValues = useMemo<InvestmentAccountHolding>(
    () => ({
      id: '',
      name: '',
      taxType: 'taxable' as const,
      balance: 0,
      contributionBasis: 0,
      holdingType: 'sp500' as const,
      returnRate: 0,
      returnStdDev: 0,
      investmentAccountId: '',
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
  } = useForm<InvestmentAccountHolding>({
    resolver: zodResolver(investmentAccountHoldingSchema),
    defaultValues,
  })

  const loadHolding = useCallback(async () => {
    if (!id) {
      setHolding(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const data = await storage.investmentAccountHoldingRepo.get(id)
    const legacy = data as InvestmentAccountHolding & { return?: number; risk?: number }
    const normalized = data
      ? {
          ...data,
          contributionBasis: data.contributionBasis ?? 0,
          returnRate: data.returnRate ?? legacy.return ?? 0,
          returnStdDev: data.returnStdDev ?? legacy.risk ?? 0,
        }
      : null
    setHolding(normalized)
    if (normalized) {
      reset(normalized)
    }
    setIsLoading(false)
  }, [id, reset, storage])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHolding()
  }, [loadHolding])

  const onSubmit: SubmitHandler<InvestmentAccountHolding> = async (values) => {
    const timestamp = now()
    const next = {
      ...values,
      createdAt: values.createdAt || timestamp,
      updatedAt: timestamp,
    }
    await storage.investmentAccountHoldingRepo.upsert(next)
    setHolding(next)
    reset(next)
  }

  if (isLoading) {
    return <p className="muted">Loading holding...</p>
  }

  if (!holding) {
    return (
      <section className="stack">
        <h1>Holding not found</h1>
        <Link className="link" to={backTo} state={{ from: parentFrom ?? '/accounts' }}>
          Back to accounts
        </Link>
      </section>
    )
  }

  return (
    <section className="stack">
      <PageHeader
        title={holding.name}
        subtitle="Investment holding"
        actions={
          <Link className="link" to={backTo} state={{ from: parentFrom ?? '/accounts' }}>
            Back
          </Link>
        }
      />

      <form className="card stack" onSubmit={handleSubmit(onSubmit)}>
        <input type="hidden" {...register('id')} />
        <input type="hidden" {...register('investmentAccountId')} />
        <input type="hidden" {...register('createdAt', { valueAsNumber: true })} />
        <input type="hidden" {...register('updatedAt', { valueAsNumber: true })} />
        <div className="form-grid">
          <label className="field">
            <span>Name</span>
            <input {...register('name')} />
            {errors.name ? <span className="error">{errors.name.message}</span> : null}
          </label>

          <label className="field">
            <span>Holding type</span>
            <select {...register('holdingType')}>
              {holdingTypeSchema.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Tax type</span>
            <select {...register('taxType')}>
              {taxTypeSchema.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Balance</span>
            <input type="number" {...register('balance', { valueAsNumber: true })} />
            {errors.balance ? <span className="error">{errors.balance.message}</span> : null}
          </label>

          <label className="field">
            <span>Contribution basis</span>
            <input
              type="number"
              {...register('contributionBasis', { valueAsNumber: true })}
            />
            {errors.contributionBasis ? (
              <span className="error">{errors.contributionBasis.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Return</span>
            <input
              type="number"
              step="0.001"
              {...register('returnRate', { valueAsNumber: true })}
            />
            {errors.returnRate ? (
              <span className="error">{errors.returnRate.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Standard deviation of return</span>
            <input
              type="number"
              step="0.001"
              {...register('returnStdDev', { valueAsNumber: true })}
            />
            {errors.returnStdDev ? (
              <span className="error">{errors.returnStdDev.message}</span>
            ) : null}
          </label>
        </div>

        <div className="button-row">
          <button className="button" type="submit" disabled={isSubmitting || !isDirty}>
            Save holding
          </button>
        </div>
      </form>
    </section>
  )
}

export default HoldingDetailPage
