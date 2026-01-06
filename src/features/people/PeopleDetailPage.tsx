import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { personSchema, type Person, type SocialSecurityEarnings } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'
import { now } from '../../core/utils/time'
import { createUuid } from '../../core/utils/uuid'
import useUnsavedChangesWarning from '../../hooks/useUnsavedChangesWarning'

const PeopleDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/people'
  const storage = useAppStore((state) => state.storage)
  const [person, setPerson] = useState<Person | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [strategyCount, setStrategyCount] = useState(0)
  const [earnings, setEarnings] = useState<SocialSecurityEarnings[]>([])
  const [importText, setImportText] = useState('')

  const sortedEarnings = useMemo(
    () => [...earnings].sort((a, b) => b.year - a.year),
    [earnings],
  )

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

  useUnsavedChangesWarning(isDirty)

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
      const [strategies, earningsData] = await Promise.all([
        storage.personStrategyRepo.listForPerson(data.id),
        storage.socialSecurityEarningsRepo.listForPerson(data.id),
      ])
      setStrategyCount(strategies.length)
      setEarnings(earningsData)
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

  const handleAddEarning = () => {
    if (!person) {
      return
    }
    const timestamp = now()
    const next: SocialSecurityEarnings = {
      id: createUuid(),
      personId: person.id,
      year: new Date().getFullYear(),
      amount: 0,
      months: 12,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    setEarnings((current) => [next, ...current])
  }

  const handleRemoveEarning = (earningId: string) => {
    setEarnings((current) => current.filter((entry) => entry.id !== earningId))
  }

  const handleSaveEarnings = async () => {
    if (!person) {
      return
    }
    const timestamp = now()
    const existing = await storage.socialSecurityEarningsRepo.listForPerson(person.id)
    const existingIds = new Set(existing.map((entry) => entry.id))
    const nextIds = new Set(earnings.map((entry) => entry.id))
    const removedIds = Array.from(existingIds).filter((entryId) => !nextIds.has(entryId))

    await Promise.all(removedIds.map((entryId) => storage.socialSecurityEarningsRepo.remove(entryId)))
    await Promise.all(
      earnings.map((entry) =>
        storage.socialSecurityEarningsRepo.upsert({
          ...entry,
          personId: person.id,
          createdAt: entry.createdAt || timestamp,
          updatedAt: timestamp,
        }),
      ),
    )
    const refreshed = await storage.socialSecurityEarningsRepo.listForPerson(person.id)
    setEarnings(refreshed)
  }

  const parseImport = (): SocialSecurityEarnings[] => {
    if (!person) {
      return []
    }
    const lines = importText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) {
      return []
    }

    const headerParts = lines[0].includes('\t')
      ? lines[0].split('\t')
      : lines[0].split(/\s{2,}/)
    const headers = headerParts.map((value) => value.trim().toLowerCase())

    const findHeaderIndex = (predicate: (value: string) => boolean) =>
      headers.findIndex(predicate)

    const yearIndex =
      headers.findIndex((value) => value === 'work year') >= 0
        ? headers.findIndex((value) => value === 'work year')
        : findHeaderIndex((value) => value.includes('year'))

    const earningsIndex =
      headers.findIndex((value) => value === 'taxed social security earnings') >= 0
        ? headers.findIndex((value) => value === 'taxed social security earnings')
        : findHeaderIndex(
            (value) =>
              (value.includes('social security') || value.includes('ssa')) &&
              (value.includes('wages') || value.includes('earnings')),
          )

    const monthsIndex =
      headers.findIndex((value) => value === 'worked months') >= 0
        ? headers.findIndex((value) => value === 'worked months')
        : findHeaderIndex((value) => value.includes('months'))

    const parseAmount = (value: string) => {
      const cleaned = value.replace(/\$/g, '').replace(/,/g, '').trim().toLowerCase()
      if (!cleaned || cleaned.includes('not yet recorded')) {
        return 0
      }
      const parsed = Number(cleaned)
      return Number.isNaN(parsed) ? 0 : parsed
    }

    const parseMonths = (value?: string, amount = 0) => {
      if (!value || !value.trim()) {
        return amount > 0 ? 12 : 0
      }
      const parsed = Number(value.trim())
      if (Number.isNaN(parsed)) {
        return amount > 0 ? 12 : 0
      }
      return parsed
    }

    const timestamp = now()
    return lines.slice(1).flatMap((line) => {
      const parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/)
      const yearValue = parts[yearIndex] ?? ''
      const earningsValue = parts[earningsIndex] ?? ''
      const monthsValue = monthsIndex >= 0 ? parts[monthsIndex] : undefined

      const year = Number(yearValue.trim())
      if (Number.isNaN(year)) {
        return []
      }
      const amount = parseAmount(earningsValue)
      const months = parseMonths(monthsValue, amount)

      return [
        {
          id: createUuid(),
          personId: person.id,
          year,
          amount,
          months,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]
    })
  }

  const handleImport = async () => {
    if (!person) {
      return
    }
    const next = parseImport()
    if (next.length === 0) {
      return
    }
    const existing = await storage.socialSecurityEarningsRepo.listForPerson(person.id)
    await Promise.all(existing.map((entry) => storage.socialSecurityEarningsRepo.remove(entry.id)))
    await Promise.all(next.map((entry) => storage.socialSecurityEarningsRepo.upsert(entry)))
    setImportText('')
    const refreshed = await storage.socialSecurityEarningsRepo.listForPerson(person.id)
    setEarnings(refreshed)
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

      <div className="card stack">
        <div className="row">
          <h2>Social Security earnings</h2>
          <div className="button-row">
            <button className="button secondary" type="button" onClick={handleAddEarning}>
              Add earnings row
            </button>
            <button className="button secondary" type="button" onClick={handleSaveEarnings}>
              Save earnings
            </button>
          </div>
        </div>

        <label className="field">
          <span>Import earnings table</span>
          <textarea
            rows={6}
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="Paste SSA export table here"
          />
        </label>
        <button className="button" type="button" onClick={handleImport}>
          Replace with import
        </button>

        {sortedEarnings.length === 0 ? (
          <p className="muted">No earnings recorded.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Amount</th>
                <th>Months</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedEarnings.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <input
                      type="number"
                      value={entry.year}
                      onChange={(event) =>
                        setEarnings((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? { ...item, year: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={entry.amount}
                      onChange={(event) =>
                        setEarnings((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? { ...item, amount: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={entry.months}
                      onChange={(event) =>
                        setEarnings((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? { ...item, months: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => handleRemoveEarning(entry.id)}
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

export default PeopleDetailPage
