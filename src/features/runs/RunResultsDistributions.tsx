import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SimulationResult } from '../../core/models'

type DistributionMetric = 'minBalance' | 'endingBalance'
type ColorMetric =
  | 'none'
  | 'guardrailFactorAvg'
  | 'guardrailFactorMin'
  | 'guardrailFactorBelowPct'

type DistributionBin = {
  bucket: number
  start: number
  end: number
  x: number
  count: number
  probability: number
  guardrailMin: number | null
  guardrailMax: number | null
  representativeRun: NonNullable<SimulationResult['stochasticRuns']>[number] | null
  members: NonNullable<SimulationResult['stochasticRuns']>
  bandValues: number[]
  bandCounts: number[]
}

type HistogramBucket = {
  bucket: number
  start: number
  end: number
  count: number
  bandCounts: number[]
  members: NonNullable<SimulationResult['stochasticRuns']>
}

type RunResultsDistributionsProps = {
  stochasticRuns: SimulationResult['stochasticRuns']
  formatAxisValue: (value: number) => string
  formatCurrency: (value: number) => string
  stochasticCancelled: boolean
  onSelectRepresentative?: (selection: RepresentativeSelection | null) => void
}

export type RepresentativeSelection = {
  metric: DistributionMetric
  rangeStart: number
  rangeEnd: number
  segmentMetric: ColorMetric
  segmentRange: { start: number; end: number } | null
  guardrailMin: number | null
  guardrailMax: number | null
  run: NonNullable<SimulationResult['stochasticRuns']>[number]
}

const metricOptions: Array<{ value: DistributionMetric; label: string }> = [
  { value: 'minBalance', label: 'Minimum balance' },
  { value: 'endingBalance', label: 'Ending balance' },
]
const colorOptions: Array<{ value: ColorMetric; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'guardrailFactorAvg', label: 'Guardrail avg' },
  { value: 'guardrailFactorMin', label: 'Guardrail min' },
  { value: 'guardrailFactorBelowPct', label: 'Guardrail active' },
]

const logLinearThreshold = 10000

const symlog = (value: number) => {
  if (value === 0) {
    return 0
  }
  const sign = Math.sign(value)
  const scaled = Math.abs(value) / logLinearThreshold
  return sign * Math.log10(1 + scaled)
}

const symexp = (value: number) => {
  if (value === 0) {
    return 0
  }
  const sign = Math.sign(value)
  const scaled = Math.pow(10, Math.abs(value)) - 1
  return sign * scaled * logLinearThreshold
}

type ReferenceLineLabelProps = {
  viewBox?: { x: number; y: number; width: number; height: number }
  value: string
}

const ZeroLineLabel = ({ viewBox, value }: ReferenceLineLabelProps) => {
  if (!viewBox) {
    return null
  }
  return (
    <text
      x={viewBox.x - 6}
      y={viewBox.y + 12}
      textAnchor="end"
      fill="var(--text-muted)"
      fontSize={12}
      dominantBaseline="hanging"
    >
      {value}
    </text>
  )
}

const bandCount = 10

const buildHistogram = (
  runs: NonNullable<SimulationResult['stochasticRuns']>,
  metric: DistributionMetric,
  colorMetric: ColorMetric,
  bins: number,
): { bins: DistributionBin[]; domain: [number, number] | null } => {
  const values = runs
    .map((run) => run[metric])
    .filter((value) => Number.isFinite(value))
  if (values.length === 0) {
    return { bins: [], domain: null }
  }
  const transformed = values.map((value) => symlog(value))
  const min = Math.min(...transformed)
  const max = Math.max(...transformed)
  const bands = colorMetric === 'none' ? 1 : bandCount
  const toBandIndex = (value: number) => {
    if (colorMetric === 'none') {
      return 0
    }
    const clamped = Math.min(1, Math.max(0, value))
    return Math.min(bandCount - 1, Math.floor(clamped * bandCount))
  }
  if (min === max) {
    const bandCounts = Array.from({ length: bands }, () => 0)
    runs.forEach((run) => {
      const colorValue =
        colorMetric === 'none' ? 0 : run[colorMetric] ?? 0
      bandCounts[toBandIndex(colorValue)] += 1
    })
    let guardrailMin: number | null = null
    let guardrailMax: number | null = null
    runs.forEach((run) => {
      const guardrail = run.guardrailFactorBelowPct
      if (!Number.isFinite(guardrail)) {
        return
      }
      guardrailMin = guardrailMin === null ? guardrail : Math.min(guardrailMin, guardrail)
      guardrailMax = guardrailMax === null ? guardrail : Math.max(guardrailMax, guardrail)
    })
    const bandValues =
      values.length === 0 ? bandCounts.map(() => 0) : bandCounts.map((count) => count / values.length)
    const bandEntries = Object.fromEntries(
      bandValues.map((value, index) => [`band${index}`, value]),
    )
    return {
      bins: [
        {
          bucket: 0,
          start: symexp(min),
          end: symexp(max),
          x: min,
          count: values.length,
          probability: 1,
          guardrailMin,
          guardrailMax,
          representativeRun: runs[0] ?? null,
          members: runs,
          bandCounts,
          bandValues,
          ...bandEntries,
        },
      ],
      domain: [min, max],
    }
  }

  const span = max - min
  const binSize = span / bins
  const buckets: HistogramBucket[] = Array.from({ length: bins }, (_, index) => ({
    bucket: index,
    start: min + index * binSize,
    end: index === bins - 1 ? max : min + (index + 1) * binSize,
    count: 0,
    bandCounts: Array.from({ length: bands }, () => 0),
    members: [],
  }))
  transformed.forEach((value, valueIndex) => {
    const rawIndex = Math.floor((value - min) / binSize)
    const bucketIndex = Math.min(Math.max(rawIndex, 0), bins - 1)
    buckets[bucketIndex].count += 1
    const colorValue =
      colorMetric === 'none' ? 0 : runs[valueIndex]?.[colorMetric] ?? 0
    buckets[bucketIndex].bandCounts[toBandIndex(colorValue)] += 1
    if (runs[valueIndex]) {
      buckets[bucketIndex].members.push(runs[valueIndex])
    }
  })

  return {
    bins: buckets.map((bucket) => {
      const bucketMid = (bucket.start + bucket.end) / 2
      const targetValue = symexp(bucketMid)
      let representativeRun: NonNullable<SimulationResult['stochasticRuns']>[number] | null =
        null
      let bestDistance = Number.POSITIVE_INFINITY
      let guardrailMin: number | null = null
      let guardrailMax: number | null = null
      bucket.members.forEach((member) => {
        const value = member[metric]
        if (Number.isFinite(value)) {
          const distance = Math.abs(value - targetValue)
          if (distance < bestDistance) {
            bestDistance = distance
            representativeRun = member
          }
        }
        const guardrail = member.guardrailFactorBelowPct
        if (Number.isFinite(guardrail)) {
          guardrailMin = guardrailMin === null ? guardrail : Math.min(guardrailMin, guardrail)
          guardrailMax = guardrailMax === null ? guardrail : Math.max(guardrailMax, guardrail)
        }
      })
      const bandValues =
        values.length === 0
          ? bucket.bandCounts.map(() => 0)
          : bucket.bandCounts.map((count) => count / values.length)
      const bandEntries = Object.fromEntries(
        bandValues.map((value, index) => [`band${index}`, value]),
      )
      return {
        bucket: bucket.bucket,
        start: symexp(bucket.start),
        end: symexp(bucket.end),
        x: (bucket.start + bucket.end) / 2,
        count: bucket.count,
        probability: bucket.count / values.length,
        guardrailMin,
        guardrailMax,
        representativeRun,
        members: bucket.members,
        bandCounts: bucket.bandCounts,
        bandValues,
        ...bandEntries,
      }
    }),
    domain: [min, max],
  }
}

const RunResultsDistributions = ({
  stochasticRuns,
  formatAxisValue,
  formatCurrency,
  stochasticCancelled,
  onSelectRepresentative,
}: RunResultsDistributionsProps) => {
  const [metric, setMetric] = useState<DistributionMetric>('endingBalance')
  const [colorMetric, setColorMetric] = useState<ColorMetric>('guardrailFactorAvg')
  const [showChart, setShowChart] = useState(true)
  const canSelectRepresentative = Boolean(onSelectRepresentative)

  const isLowerBetter = colorMetric === 'guardrailFactorBelowPct'
  const bands = colorMetric === 'none' ? 1 : bandCount
  const bandOrder = useMemo(() => {
    if (bands === 1) {
      return [0]
    }
    return isLowerBetter
      ? Array.from({ length: bands }, (_, index) => index)
      : Array.from({ length: bands }, (_, index) => bands - 1 - index)
  }, [bands, isLowerBetter])
  const getBandColor = (bandIndex: number) => {
    const ratio = bands === 1 ? 1 : bandIndex / (bands - 1)
    const effective = isLowerBetter ? 1 - ratio : ratio
    const hue = 20 + (140 - 20) * effective
    return `hsl(${hue}, 70%, 50%)`
  }

  const endingBelowZeroLabel = useMemo(() => {
    const endingValues =
      (stochasticRuns ?? [])
        .map((run) => run.endingBalance)
        .filter((value) => Number.isFinite(value)) ?? []
    if (endingValues.length === 0) {
      return null
    }
    const belowCount = endingValues.filter((value) => value < 0).length
    const percent = (belowCount / endingValues.length) * 100
    return `${percent.toFixed(1)}% of runs < $0`
  }, [stochasticRuns])

  const histogram = useMemo(() => {
    const runs = (stochasticRuns ?? []).filter((run) =>
      Number.isFinite(run[metric]),
    )
    if (runs.length === 0) {
      return { bins: [], domain: null }
    }
    const binCount = Math.min(24, Math.max(6, Math.round(Math.sqrt(runs.length))))
    return buildHistogram(runs, metric, colorMetric, binCount)
  }, [colorMetric, metric, stochasticRuns])

  useEffect(() => {
    if (!onSelectRepresentative) {
      return
    }
    onSelectRepresentative(null)
  }, [colorMetric, metric, onSelectRepresentative])

  const handleSelectRepresentative = useCallback(
    (bin: DistributionBin | undefined, bandIndex: number | null) => {
      if (!onSelectRepresentative || !bin?.representativeRun) {
        return
      }
      const targetValue = (bin.start + bin.end) / 2
      const segmentRange =
        colorMetric === 'none' || bandIndex === null
          ? null
          : {
              start: bandIndex / bandCount,
              end: (bandIndex + 1) / bandCount,
            }
      const matchesBand = (value: number | null | undefined) => {
        if (colorMetric === 'none' || bandIndex === null) {
          return true
        }
        const safeValue = Number.isFinite(value) ? (value as number) : 0
        const clamped = Math.min(1, Math.max(0, safeValue))
        const index = Math.min(
          bandCount - 1,
          Math.floor(clamped * bandCount),
        )
        return index === bandIndex
      }
      const candidates =
        colorMetric === 'none'
          ? bin.members
          : bin.members.filter((member) => matchesBand(member[colorMetric]))
      const selectFrom = candidates.length > 0 ? candidates : bin.members
      let representative = bin.representativeRun
      let bestDistance = Number.POSITIVE_INFINITY
      selectFrom.forEach((member) => {
        const value = member[metric]
        if (!Number.isFinite(value)) {
          return
        }
        const distance = Math.abs(value - targetValue)
        if (distance < bestDistance) {
          bestDistance = distance
          representative = member
        }
      })
      onSelectRepresentative({
        metric,
        rangeStart: bin.start,
        rangeEnd: bin.end,
        segmentMetric: colorMetric,
        segmentRange,
        guardrailMin: bin.guardrailMin,
        guardrailMax: bin.guardrailMax,
        run: representative,
      })
    },
    [colorMetric, metric, onSelectRepresentative],
  )

  const xTicks = useMemo(() => {
    if (!histogram.domain) {
      return undefined
    }
    const [min, max] = histogram.domain
    const maxAbs = Math.max(Math.abs(min), Math.abs(max))
    if (maxAbs === 0) {
      return [0]
    }
    const halfTicks = 6
    const step = maxAbs / halfTicks
    const ticks = new Set<number>()
    ticks.add(0)
    for (let i = 1; i <= halfTicks; i += 1) {
      const value = step * i
      if (value <= max) {
        ticks.add(value)
      }
      if (-value >= min) {
        ticks.add(-value)
      }
    }
    return Array.from(ticks).sort((a, b) => a - b)
  }, [histogram.domain])

  return (
    <div className="card" id="section-distributions">
      <div className="row">
        <h2>Balance distributions</h2>
        <div className="row" style={{ gap: '0.75rem' }}>
          {canSelectRepresentative ? (
            <span className="muted">Click a bar to preview a representative run.</span>
          ) : null}
          <label className="field">
            <select
              value={metric}
              onChange={(event) => setMetric(event.target.value as DistributionMetric)}
            >
              {metricOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <select
              value={colorMetric}
              onChange={(event) => setColorMetric(event.target.value as ColorMetric)}
            >
              {colorOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="link-button"
            type="button"
            onClick={() => setShowChart((current) => !current)}
          >
            {showChart ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {showChart ? (
        histogram.bins.length > 0 ? (
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%" minHeight={320} minWidth={300}>
              <BarChart data={histogram.bins}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  tickFormatter={(value) => formatAxisValue(symexp(Number(value)))}
                  domain={histogram.domain ?? ['dataMin', 'dataMax']}
                  ticks={xTicks}
                />
                <YAxis
                  tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`}
                  width={60}
                />
                {metric === 'endingBalance' && endingBelowZeroLabel ? (
                  <ReferenceLine
                    x={0}
                    stroke="var(--text-muted)"
                    strokeDasharray="4 4"
                    label={<ZeroLineLabel value={endingBelowZeroLabel} />}
                  />
                ) : null}
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) {
                      return null
                    }
                    const entry = payload[0]?.payload as DistributionBin | undefined
                    if (!entry) {
                      return null
                    }
                    const bandEntries =
                      colorMetric === 'none'
                        ? []
                        : bandOrder
                            .map((bandIndex) => ({
                              bandIndex,
                              value:
                                entry.count > 0
                                  ? (entry.bandCounts?.[bandIndex] ?? 0) / entry.count
                                  : 0,
                              color: getBandColor(bandIndex),
                            }))
                            .filter((band) => band.value > 0)
                    return (
                      <div
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          boxShadow: '0 12px 24px rgba(25, 32, 42, 0.12)',
                          padding: '10px 12px',
                        }}
                      >
                        <div className="tooltip-label">
                          {formatCurrency(entry.start)} - {formatCurrency(entry.end)}
                        </div>
                        <div>Probability: {(entry.probability * 100).toFixed(1)}%</div>
                        <div>Samples: {entry.count}</div>
                        {colorMetric !== 'none' && bandEntries.length > 0 ? (
                          <div style={{ marginTop: '6px' }}>
                            {bandEntries.map((band) => (
                              <div
                                key={band.bandIndex}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  fontSize: '12px',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                <span
                                  style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: band.color,
                                  }}
                                />
                                <span>
                                  {`${band.bandIndex * 10}-${(band.bandIndex + 1) * 10}%`}:{' '}
                                  {(band.value * 100).toFixed(1)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  }}
                  wrapperStyle={{ zIndex: 10, pointerEvents: 'none' }}
                />
                {bandOrder.map((bandIndex) => {
                  const dataKey = `band${bandIndex}`
                  return (
                    <Bar
                      key={dataKey}
                      dataKey={dataKey}
                      name="Probability"
                      stackId="probability"
                      fill={getBandColor(bandIndex)}
                      radius={4}
                      cursor={canSelectRepresentative ? 'pointer' : 'default'}
                      onClick={(data) => {
                        if (!canSelectRepresentative) {
                          return
                        }
                        const payload = (data as { payload?: DistributionBin })?.payload
                        handleSelectRepresentative(payload, bandIndex)
                      }}
                    />
                  )
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="muted">
            {stochasticCancelled
              ? 'Stochastic trials were cancelled. Partial results were saved.'
              : 'No stochastic runs available yet. Increase the stochastic run count and rerun the simulation.'}
          </p>
        )
      ) : null}
    </div>
  )
}

export default RunResultsDistributions
