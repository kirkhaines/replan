import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
  const storage = useAppStore((state) => state.storage)
  const [holding, setHolding] = useState<InvestmentAccountHolding | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const defaultValues = useMemo<InvestmentAccountHolding>(
    () => ({
      id: '',
      name: '',
      taxType: 'taxable' as const,
      balance: 0,
      holdingType: 'sp500' as const,
      return: 0,
      risk: 0,
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
    setHolding(data ?? null)
    if (data) {
      reset(data)
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
        <Link className="link" to="/accounts">
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
          <Link className="link" to="/accounts">
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
            <span>Return</span>
            <input type="number" step="0.001" {...register('return', { valueAsNumber: true })} />
            {errors.return ? <span className="error">{errors.return.message}</span> : null}
          </label>

          <label className="field">
            <span>Risk</span>
            <input type="number" step="0.001" {...register('risk', { valueAsNumber: true })} />
            {errors.risk ? <span className="error">{errors.risk.message}</span> : null}
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
