import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useFieldArray, useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  investmentAccountHoldingSchema,
  holdingTypeSchema,
  taxTypeSchema,
  type HoldingTypeDefault,
  type InvestmentAccountHolding,
} from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'
import { now } from '../../core/utils/time'
import { holdingTypeDefaultsSeed } from '../../core/defaults/defaultData'
import useUnsavedChangesWarning from '../../hooks/useUnsavedChangesWarning'

const formatStdDevRange = (returnRate: number, returnStdDev: number) =>
  `(${(returnRate - returnStdDev).toFixed(2)} - ${(returnRate + returnStdDev).toFixed(2)})`

const HoldingDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/accounts'
  const parentFrom = (location.state as { parentFrom?: string } | null)?.parentFrom
  const storage = useAppStore((state) => state.storage)
  const [holding, setHolding] = useState<InvestmentAccountHolding | null>(null)
  const [holdingDefaults, setHoldingDefaults] = useState<HoldingTypeDefault[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const defaultValues = useMemo<InvestmentAccountHolding>(
    () => ({
      id: '',
      name: '',
      taxType: 'taxable' as const,
      balance: 0,
      contributionBasisEntries: [],
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
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<InvestmentAccountHolding>({
    resolver: zodResolver(investmentAccountHoldingSchema),
    defaultValues,
  })

  const { fields: basisFields, append: appendBasis, remove: removeBasis } = useFieldArray({
    control,
    name: 'contributionBasisEntries',
  })

  useUnsavedChangesWarning(isDirty)

  const selectedHoldingType = watch('holdingType')
  const returnRate = watch('returnRate')
  const returnStdDev = watch('returnStdDev')

  const holdingDefaultsByType = useMemo(
    () => new Map(holdingDefaults.map((item) => [item.type, item])),
    [holdingDefaults],
  )

  const loadHolding = useCallback(async () => {
    if (!id) {
      setHolding(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const [data, defaultData] = await Promise.all([
      storage.investmentAccountHoldingRepo.get(id),
      storage.holdingTypeDefaultRepo.list(),
    ])
    const timestamp = now()
    const normalizedDefaults =
      defaultData.length > 0
        ? defaultData
        : holdingTypeDefaultsSeed.map((seed) => ({
            id: seed.type,
            type: seed.type,
            returnRate: seed.returnRate,
            returnStdDev: seed.returnStdDev,
            createdAt: timestamp,
            updatedAt: timestamp,
          }))
    setHoldingDefaults(normalizedDefaults)
    const normalized = data ?? null
    setHolding(normalized)
    if (normalized) {
      reset(normalized)
    }
    setIsLoading(false)
  }, [id, reset, storage])

  useEffect(() => {
     
    void loadHolding()
  }, [loadHolding])

  useEffect(() => {
    if (!selectedHoldingType || selectedHoldingType === 'other') {
      return
    }
    const defaults = holdingDefaultsByType.get(selectedHoldingType)
    if (!defaults) {
      return
    }
    if (returnRate !== defaults.returnRate) {
      setValue('returnRate', defaults.returnRate, { shouldDirty: true })
    }
    if (returnStdDev !== defaults.returnStdDev) {
      setValue('returnStdDev', defaults.returnStdDev, { shouldDirty: true })
    }
  }, [
    holdingDefaultsByType,
    returnRate,
    returnStdDev,
    selectedHoldingType,
    setValue,
  ])

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
            <span>Return</span>
            <input
              type="number"
              step="0.001"
              {...register('returnRate', { valueAsNumber: true })}
              disabled={selectedHoldingType !== 'other'}
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
              disabled={selectedHoldingType !== 'other'}
            />
            {errors.returnStdDev ? (
              <span className="error">{errors.returnStdDev.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>1 std dev range</span>
            <input
              type="text"
              readOnly
              value={formatStdDevRange(returnRate ?? 0, returnStdDev ?? 0)}
            />
          </label>
        </div>

        <div className="stack">
          <div className="row">
            <h3>Contribution basis</h3>
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                appendBasis({
                  date: new Date().toISOString().slice(0, 10),
                  amount: 0,
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {basisFields.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    No contribution basis entries yet.
                  </td>
                </tr>
              ) : (
                basisFields.map((field, index) => (
                  <tr key={field.id}>
                    <td>
                      <input
                        type="date"
                        {...register(`contributionBasisEntries.${index}.date`)}
                      />
                      {errors.contributionBasisEntries?.[index]?.date ? (
                        <span className="error">
                          {errors.contributionBasisEntries[index]?.date?.message}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        {...register(`contributionBasisEntries.${index}.amount`, {
                          valueAsNumber: true,
                        })}
                      />
                      {errors.contributionBasisEntries?.[index]?.amount ? (
                        <span className="error">
                          {errors.contributionBasisEntries[index]?.amount?.message}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => removeBasis(index)}
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
            Save holding
          </button>
        </div>
      </form>
    </section>
  )
}

export default HoldingDetailPage
