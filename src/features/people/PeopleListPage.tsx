import { useCallback, useEffect, useState } from 'react'
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
  const [people, setPeople] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadPeople = useCallback(async () => {
    setIsLoading(true)
    const data = await storage.personRepo.list()
    setPeople(data)
    setIsLoading(false)
  }, [storage])

  useEffect(() => {
    void loadPeople()
  }, [loadPeople])

  const handleCreate = async () => {
    const person = createPerson()
    await storage.personRepo.upsert(person)
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
                  <td>{person.name}</td>
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
