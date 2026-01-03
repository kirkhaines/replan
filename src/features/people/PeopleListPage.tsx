import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAppStore } from '../../state/appStore'
import type { Person } from '../../core/models'
import { createUuid } from '../../core/utils/uuid'
import PageHeader from '../../components/PageHeader'

const createPerson = (): Person => {
  const now = Date.now()
  return {
    id: createUuid(),
    name: 'New Person',
    dateOfBirth: '1985-01-01',
    lifeExpectancy: 90,
    createdAt: now,
    updatedAt: now,
  }
}

const PeopleListPage = () => {
  const storage = useAppStore((state) => state.storage)
  const location = useLocation()
  const [people, setPeople] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadPeople = useCallback(async () => {
    setIsLoading(true)
    const data = await storage.personRepo.list()
    setPeople(data)
    setIsLoading(false)
  }, [storage])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPeople()
  }, [loadPeople])

  const handleCreate = async () => {
    const person = createPerson()
    const now = Date.now()
    const socialSecurityStrategyId = createUuid()
    const futureWorkStrategyId = createUuid()
    const futureWorkPeriodId = createUuid()
    const today = new Date()
    const tenYears = new Date()
    tenYears.setFullYear(today.getFullYear() + 10)
    const toIsoDate = (value: Date) => value.toISOString().slice(0, 10)

    await storage.personRepo.upsert(person)
    await storage.socialSecurityStrategyRepo.upsert({
      id: socialSecurityStrategyId,
      personId: person.id,
      startAge: 67,
      createdAt: now,
      updatedAt: now,
    })
    await storage.futureWorkStrategyRepo.upsert({
      id: futureWorkStrategyId,
      name: 'Work plan',
      personId: person.id,
      createdAt: now,
      updatedAt: now,
    })
    await storage.futureWorkPeriodRepo.upsert({
      id: futureWorkPeriodId,
      name: 'Primary job',
      futureWorkStrategyId,
      salary: 90000,
      bonus: 5000,
      startDate: toIsoDate(today),
      endDate: toIsoDate(tenYears),
      '401kMatchPctCap': 0.05,
      '401kMatchRatio': 1,
      '401kInvestmentAccountHoldingId': createUuid(),
      includesHealthInsurance: true,
      createdAt: now,
      updatedAt: now,
    })
    await loadPeople()
  }

  return (
    <section className="stack">
      <PageHeader
        title="People"
        subtitle="Create and manage people used in scenarios."
        actions={
          <button className="button" onClick={handleCreate}>
            Add Person
          </button>
        }
      />

      <div className="card">
        {isLoading ? (
          <p className="muted">Loading people...</p>
        ) : people.length === 0 ? (
          <p className="muted">No people yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Date of birth</th>
                <th>Life expectancy</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td>
                    <Link
                      className="link"
                      to={`/people/${person.id}`}
                      state={{ from: location.pathname }}
                    >
                      {person.name}
                    </Link>
                  </td>
                  <td>{person.dateOfBirth}</td>
                  <td>{person.lifeExpectancy}</td>
                  <td>{new Date(person.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default PeopleListPage
