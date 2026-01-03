import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { inflationTypeSchema, type InflationDefault, type SsaWageIndex } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import { createUuid } from '../../core/utils/uuid'
import { now } from '../../core/utils/time'
import PageHeader from '../../components/PageHeader'
import { inflationDefaultsSeed } from '../../core/defaults/defaultData'

type InflationType = (typeof inflationTypeSchema.options)[number]

const defaultInflationRates: Record<InflationType, number> = Object.fromEntries(
  inflationDefaultsSeed.map((seed) => [seed.type, seed.rate]),
) as Record<InflationType, number>

const DefaultsPage = () => {
  const storage = useAppStore((state) => state.storage)
  const [inflationDefaults, setInflationDefaults] = useState<InflationDefault[]>([])
  const [wageIndex, setWageIndex] = useState<SsaWageIndex[]>([])
  const [importText, setImportText] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const sortedWageIndex = useMemo(
    () => [...wageIndex].sort((a, b) => b.year - a.year),
    [wageIndex],
  )

  const loadDefaults = useCallback(async () => {
    setIsLoading(true)
    const [inflationData, wageData] = await Promise.all([
      storage.inflationDefaultRepo.list(),
      storage.ssaWageIndexRepo.list(),
    ])
    const inflationByType = new Map(inflationData.map((item) => [item.type, item]))
    const filled = inflationTypeSchema.options.map((type) => {
      const existing = inflationByType.get(type)
      if (existing) {
        return existing
      }
      const timestamp = now()
      return {
        id: type,
        type,
        rate: defaultInflationRates[type] ?? 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    })
    setInflationDefaults(filled)
    setWageIndex(wageData)
    setIsLoading(false)
  }, [storage])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDefaults()
  }, [loadDefaults])

  const handleInflationChange = (type: InflationType, value: number) => {
    setInflationDefaults((current) =>
      current.map((item) => (item.type === type ? { ...item, rate: value } : item)),
    )
  }

  const handleSaveInflation = async () => {
    const timestamp = now()
    await Promise.all(
      inflationDefaults.map((item) =>
        storage.inflationDefaultRepo.upsert({
          ...item,
          id: item.id || item.type,
          updatedAt: timestamp,
          createdAt: item.createdAt || timestamp,
        }),
      ),
    )
    await loadDefaults()
  }

  const handleAddWageIndex = () => {
    const timestamp = now()
    setWageIndex((current) => [
      {
        id: createUuid(),
        year: new Date().getFullYear(),
        index: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      ...current,
    ])
  }

  const handleRemoveWageIndex = (id: string) => {
    setWageIndex((current) => current.filter((entry) => entry.id !== id))
  }

  const handleSaveWageIndex = async () => {
    const timestamp = now()
    const existing = await storage.ssaWageIndexRepo.list()
    const existingIds = new Set(existing.map((entry) => entry.id))
    const nextIds = new Set(wageIndex.map((entry) => entry.id))
    const removedIds = Array.from(existingIds).filter((entryId) => !nextIds.has(entryId))

    await Promise.all(removedIds.map((entryId) => storage.ssaWageIndexRepo.remove(entryId)))
    await Promise.all(
      wageIndex.map((entry) =>
        storage.ssaWageIndexRepo.upsert({
          ...entry,
          createdAt: entry.createdAt || timestamp,
          updatedAt: timestamp,
        }),
      ),
    )
    await loadDefaults()
  }

  const parseWageIndexImport = () => {
    const lines = importText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) {
      return []
    }

    const timestamp = now()
    const rows: SsaWageIndex[] = []
    lines.forEach((line) => {
      const lower = line.toLowerCase()
      if (lower.includes('year') && lower.includes('index')) {
        return
      }
      const parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/)
      if (parts.length < 2) {
        return
      }
      const year = Number(parts[0].replace(/[^0-9]/g, ''))
      const index = Number(parts[1].replace(/,/g, '').trim())
      if (Number.isNaN(year) || Number.isNaN(index)) {
        return
      }
      rows.push({
        id: createUuid(),
        year,
        index,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    })

    const byYear = new Map<number, SsaWageIndex>()
    rows.forEach((row) => {
      byYear.set(row.year, row)
    })
    return Array.from(byYear.values())
  }

  const handleImportWageIndex = async () => {
    const next = parseWageIndexImport()
    if (next.length === 0) {
      return
    }
    const existing = await storage.ssaWageIndexRepo.list()
    await Promise.all(existing.map((entry) => storage.ssaWageIndexRepo.remove(entry.id)))
    await Promise.all(next.map((entry) => storage.ssaWageIndexRepo.upsert(entry)))
    setImportText('')
    await loadDefaults()
  }

  if (isLoading) {
    return <p className="muted">Loading defaults...</p>
  }

  return (
    <section className="stack">
      <PageHeader
        title="Defaults & reference"
        subtitle="Manage baseline assumptions and reference data."
        actions={
          <Link className="link" to="/scenarios">
            Back
          </Link>
        }
      />

      <div className="card stack">
        <div className="row">
          <h2>Inflation defaults</h2>
          <button className="button" type="button" onClick={handleSaveInflation}>
            Save inflation defaults
          </button>
        </div>
        <div className="form-grid">
          {inflationDefaults.map((item) => (
            <label className="field" key={item.type}>
              <span>{item.type}</span>
              <input
                type="number"
                step="0.001"
                value={item.rate}
                onChange={(event) => handleInflationChange(item.type, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="card stack">
        <div className="row">
          <div>
            <h2>SSA wage index</h2>
            <p className="muted">
              Source:{' '}
              <a
                className="link"
                href="https://www.ssa.gov/oact/cola/AWI.html"
                target="_blank"
                rel="noreferrer"
              >
                SSA wage index series
              </a>
            </p>
          </div>
          <div className="button-row">
            <button className="button secondary" type="button" onClick={handleAddWageIndex}>
              Add row
            </button>
            <button className="button secondary" type="button" onClick={handleSaveWageIndex}>
              Save grid
            </button>
          </div>
        </div>

        <label className="field">
          <span>Import wage index table</span>
          <textarea
            rows={6}
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="Paste SSA wage index table here"
          />
        </label>
        <button className="button" type="button" onClick={handleImportWageIndex}>
          Replace with import
        </button>

        {sortedWageIndex.length === 0 ? (
          <p className="muted">No wage index entries yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Index</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedWageIndex.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <input
                      type="number"
                      value={entry.year}
                      onChange={(event) =>
                        setWageIndex((current) =>
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
                      step="0.01"
                      value={entry.index}
                      onChange={(event) =>
                        setWageIndex((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? { ...item, index: Number(event.target.value) }
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
                      onClick={() => handleRemoveWageIndex(entry.id)}
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

export default DefaultsPage
