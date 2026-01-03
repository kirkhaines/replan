import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { personSchema, type Person } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'
import { now } from '../../core/utils/time'

const PeopleDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/people'
  const storage = useAppStore((state) => state.storage)
  const [person, setPerson] = useState<Person | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [strategyCount, setStrategyCount] = useState(0)

  const defaultValues = useMemo(
    () => ({
      id: '',
      name: '',
      dateOfBirth: '1985-01-01',
      lifeExpectancy: 90,
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
  } = useForm<Person>({
    resolver: zodResolver(personSchema),
    defaultValues,
  })

  const loadPerson = useCallback(async () => {
    if (!id) {
      setPerson(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const data = await storage.personRepo.get(id)
    setPerson(data ?? null)
    if (data) {
      reset(data)
      const strategies = await storage.personStrategyRepo.listForPerson(data.id)
      setStrategyCount(strategies.length)
    }
    setIsLoading(false)
  }, [id, reset, storage])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPerson()
  }, [loadPerson])

  const onSubmit = async (values: Person) => {
    const timestamp = now()
    const next = {
      ...values,
      createdAt: values.createdAt || timestamp,
      updatedAt: timestamp,
    }
    await storage.personRepo.upsert(next)
    setPerson(next)
    reset(next)
  }

  if (isLoading) {
    return <p className="muted">Loading person...</p>
  }

  if (!person) {
    return (
      <section className="stack">
        <h1>Person not found</h1>
        <Link className="link" to={backTo}>
          Back to people
        </Link>
      </section>
    )
  }

  return (
    <section className="stack">
      <PageHeader
        title={person.name}
        subtitle={`${strategyCount} linked strategies`}
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
            <span>Date of birth</span>
            <input type="date" {...register('dateOfBirth')} />
            {errors.dateOfBirth ? (
              <span className="error">{errors.dateOfBirth.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Life expectancy</span>
            <input type="number" {...register('lifeExpectancy', { valueAsNumber: true })} />
            {errors.lifeExpectancy ? (
              <span className="error">{errors.lifeExpectancy.message}</span>
            ) : null}
          </label>
        </div>

        <div className="button-row">
          <button className="button" type="submit" disabled={isSubmitting || !isDirty}>
            Save person
          </button>
        </div>
      </form>
    </section>
  )
}

export default PeopleDetailPage
