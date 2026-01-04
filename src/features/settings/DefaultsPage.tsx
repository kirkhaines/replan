import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  inflationTypeSchema,
  holdingTypeSchema,
  type InflationDefault,
  type HoldingTypeDefault,
  type SsaBendPoint,
  type SsaRetirementAdjustment,
  type SsaWageIndex,
} from '../../core/models'
import { useAppStore } from '../../state/appStore'
import { createUuid } from '../../core/utils/uuid'
import { now } from '../../core/utils/time'
import PageHeader from '../../components/PageHeader'
import {
  inflationDefaultsSeed,
  holdingTypeDefaultsSeed,
} from '../../core/defaults/defaultData'

type InflationType = (typeof inflationTypeSchema.options)[number]
type HoldingType = (typeof holdingTypeSchema.options)[number]

const defaultInflationRates: Record<InflationType, number> = Object.fromEntries(
  inflationDefaultsSeed.map((seed) => [seed.type, seed.rate]),
) as Record<InflationType, number>

const holdingTypeDefaultsByType = new Map(
  holdingTypeDefaultsSeed.map((seed) => [seed.type, seed]),
)

const formatStdDevRange = (returnRate: number, returnStdDev: number) =>
  `(${(returnRate - returnStdDev).toFixed(2)} - ${(returnRate + returnStdDev).toFixed(2)})`

const DefaultsPage = () => {
  const storage = useAppStore((state) => state.storage)
  const [inflationDefaults, setInflationDefaults] = useState<InflationDefault[]>([])
  const [holdingTypeDefaults, setHoldingTypeDefaults] = useState<HoldingTypeDefault[]>([])
  const [wageIndex, setWageIndex] = useState<SsaWageIndex[]>([])
  const [bendPoints, setBendPoints] = useState<SsaBendPoint[]>([])
  const [retirementAdjustments, setRetirementAdjustments] = useState<SsaRetirementAdjustment[]>([])
  const [importText, setImportText] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const sortedWageIndex = useMemo(
    () => [...wageIndex].sort((a, b) => b.year - a.year),
    [wageIndex],
  )

  const sortedBendPoints = useMemo(
    () => [...bendPoints].sort((a, b) => b.year - a.year),
    [bendPoints],
  )

  const sortedRetirementAdjustments = useMemo(
    () => [...retirementAdjustments].sort((a, b) => a.birthYearStart - b.birthYearStart),
    [retirementAdjustments],
  )

  const loadDefaults = useCallback(async () => {
    setIsLoading(true)
    const [inflationData, holdingTypeData, wageData, bendPointData, adjustmentData] =
      await Promise.all([
      storage.inflationDefaultRepo.list(),
      storage.holdingTypeDefaultRepo.list(),
      storage.ssaWageIndexRepo.list(),
      storage.ssaBendPointRepo.list(),
      storage.ssaRetirementAdjustmentRepo.list(),
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
    const holdingByType = new Map(holdingTypeData.map((item) => [item.type, item]))
    const holdingDefaults = holdingTypeSchema.options
      .filter((type) => type !== 'other')
      .map((type) => {
        const existing = holdingByType.get(type)
        if (existing) {
          return existing
        }
        const seed = holdingTypeDefaultsByType.get(type)
        const timestamp = now()
        return {
          id: type,
          type,
          returnRate: seed?.returnRate ?? 0,
          returnStdDev: seed?.returnStdDev ?? 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
      })
    setHoldingTypeDefaults(holdingDefaults)
    setWageIndex(wageData)
    setBendPoints(bendPointData)
    setRetirementAdjustments(adjustmentData)
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

  const handleHoldingTypeChange = (
    type: HoldingType,
    field: 'returnRate' | 'returnStdDev',
    value: number,
  ) => {
    setHoldingTypeDefaults((current) =>
      current.map((item) => (item.type === type ? { ...item, [field]: value } : item)),
    )
  }

  const handleSaveHoldingTypeDefaults = async () => {
    const timestamp = now()
    await Promise.all(
      holdingTypeDefaults.map((item) =>
        storage.holdingTypeDefaultRepo.upsert({
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

  const handleAddBendPoint = () => {
    const timestamp = now()
    setBendPoints((current) => [
      {
        id: createUuid(),
        year: new Date().getFullYear(),
        first: 0,
        second: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      ...current,
    ])
  }

  const handleRemoveBendPoint = (id: string) => {
    setBendPoints((current) => current.filter((entry) => entry.id !== id))
  }

  const handleSaveBendPoints = async () => {
    const timestamp = now()
    const existing = await storage.ssaBendPointRepo.list()
    const existingIds = new Set(existing.map((entry) => entry.id))
    const nextIds = new Set(bendPoints.map((entry) => entry.id))
    const removedIds = Array.from(existingIds).filter((entryId) => !nextIds.has(entryId))

    await Promise.all(removedIds.map((entryId) => storage.ssaBendPointRepo.remove(entryId)))
    await Promise.all(
      bendPoints.map((entry) =>
        storage.ssaBendPointRepo.upsert({
          ...entry,
          createdAt: entry.createdAt || timestamp,
          updatedAt: timestamp,
        }),
      ),
    )
    await loadDefaults()
  }

  const handleAddRetirementAdjustment = () => {
    const timestamp = now()
    setRetirementAdjustments((current) => [
      {
        id: createUuid(),
        birthYearStart: 1943,
        birthYearEnd: 1943,
        normalRetirementAgeMonths: 66 * 12,
        delayedRetirementCreditPerYear: 0.08,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      ...current,
    ])
  }

  const handleRemoveRetirementAdjustment = (id: string) => {
    setRetirementAdjustments((current) => current.filter((entry) => entry.id !== id))
  }

  const handleSaveRetirementAdjustments = async () => {
    const timestamp = now()
    const existing = await storage.ssaRetirementAdjustmentRepo.list()
    const existingIds = new Set(existing.map((entry) => entry.id))
    const nextIds = new Set(retirementAdjustments.map((entry) => entry.id))
    const removedIds = Array.from(existingIds).filter((entryId) => !nextIds.has(entryId))

    await Promise.all(removedIds.map((entryId) => storage.ssaRetirementAdjustmentRepo.remove(entryId)))
    await Promise.all(
      retirementAdjustments.map((entry) =>
        storage.ssaRetirementAdjustmentRepo.upsert({
          ...entry,
          createdAt: entry.createdAt || timestamp,
          updatedAt: timestamp,
        }),
      ),
    )
    await loadDefaults()
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
          <h2>Holding type defaults</h2>
          <button className="button" type="button" onClick={handleSaveHoldingTypeDefaults}>
            Save holding defaults
          </button>
        </div>
        {holdingTypeDefaults.length === 0 ? (
          <p className="muted">No holding type defaults yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Holding type</th>
                <th>Return rate</th>
                <th>Std dev of return</th>
                <th>1 std dev range</th>
              </tr>
            </thead>
            <tbody>
              {holdingTypeDefaults.map((item) => (
                <tr key={item.type}>
                  <td>{item.type}</td>
                  <td>
                    <input
                      type="number"
                      step="0.001"
                      value={item.returnRate}
                      onChange={(event) =>
                        handleHoldingTypeChange(item.type, 'returnRate', Number(event.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.001"
                      value={item.returnStdDev}
                      onChange={(event) =>
                        handleHoldingTypeChange(
                          item.type,
                          'returnStdDev',
                          Number(event.target.value),
                        )
                      }
                    />
                  </td>
                  <td>{formatStdDevRange(item.returnRate, item.returnStdDev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card stack">
        <div className="stack">
          <div className="row">
            <h2>SSA bend points</h2>
            <div className="button-row">
              <button className="button secondary" type="button" onClick={handleAddBendPoint}>
                Add row
              </button>
              <button className="button secondary" type="button" onClick={handleSaveBendPoints}>
                Save bend points
              </button>
            </div>
          </div>
          {sortedBendPoints.length === 0 ? (
            <p className="muted">No bend points yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>First bend point</th>
                  <th>Second bend point</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedBendPoints.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <input
                        type="number"
                        value={entry.year}
                        onChange={(event) =>
                          setBendPoints((current) =>
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
                        value={entry.first}
                        onChange={(event) =>
                          setBendPoints((current) =>
                            current.map((item) =>
                              item.id === entry.id
                                ? { ...item, first: Number(event.target.value) }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={entry.second}
                        onChange={(event) =>
                          setBendPoints((current) =>
                            current.map((item) =>
                              item.id === entry.id
                                ? { ...item, second: Number(event.target.value) }
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
                        onClick={() => handleRemoveBendPoint(entry.id)}
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

        <div className="stack">
          <div className="row">
            <div>
              <h2>SSA retirement adjustments</h2>
              <p className="muted">
                Source:{' '}
                <a
                  className="link"
                  href="https://www.ssa.gov/oact/ProgData/ar_drc.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Delayed retirement credits table
                </a>
              </p>
            </div>
            <div className="button-row">
              <button
                className="button secondary"
                type="button"
                onClick={handleAddRetirementAdjustment}
              >
                Add row
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={handleSaveRetirementAdjustments}
              >
                Save adjustments
              </button>
            </div>
          </div>
          {sortedRetirementAdjustments.length === 0 ? (
            <p className="muted">No retirement adjustment data yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Birth year start</th>
                  <th>Birth year end</th>
                  <th>NRA years</th>
                  <th>NRA months</th>
                  <th>Delayed credit % / year</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRetirementAdjustments.map((entry) => {
                  const years = Math.floor(entry.normalRetirementAgeMonths / 12)
                  const months = entry.normalRetirementAgeMonths % 12
                  return (
                    <tr key={entry.id}>
                      <td>
                        <input
                          type="number"
                          value={entry.birthYearStart}
                          onChange={(event) =>
                            setRetirementAdjustments((current) =>
                              current.map((item) =>
                                item.id === entry.id
                                  ? { ...item, birthYearStart: Number(event.target.value) }
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={entry.birthYearEnd}
                          onChange={(event) =>
                            setRetirementAdjustments((current) =>
                              current.map((item) =>
                                item.id === entry.id
                                  ? { ...item, birthYearEnd: Number(event.target.value) }
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={years}
                          onChange={(event) => {
                            const nextYears = Number(event.target.value)
                            setRetirementAdjustments((current) =>
                              current.map((item) =>
                                item.id === entry.id
                                  ? {
                                      ...item,
                                      normalRetirementAgeMonths: nextYears * 12 + months,
                                    }
                                  : item,
                              ),
                            )
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={months}
                          onChange={(event) => {
                            const nextMonths = Number(event.target.value)
                            setRetirementAdjustments((current) =>
                              current.map((item) =>
                                item.id === entry.id
                                  ? {
                                      ...item,
                                      normalRetirementAgeMonths: years * 12 + nextMonths,
                                    }
                                  : item,
                              ),
                            )
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.1"
                          value={entry.delayedRetirementCreditPerYear * 100}
                          onChange={(event) =>
                            setRetirementAdjustments((current) =>
                              current.map((item) =>
                                item.id === entry.id
                                  ? {
                                      ...item,
                                      delayedRetirementCreditPerYear:
                                        Number(event.target.value) / 100,
                                    }
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
                          onClick={() => handleRemoveRetirementAdjustment(entry.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

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
