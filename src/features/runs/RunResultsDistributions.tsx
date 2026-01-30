import { useMemo, useState } from 'react'
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

type DistributionBin = {
  bucket: number
  start: number
  end: number
  x: number
  count: number
  probability: number
}

type RunResultsDistributionsProps = {
  stochasticRuns: SimulationResult['stochasticRuns']
  formatAxisValue: (value: number) => string
  formatCurrency: (value: number) => string
}

const metricOptions: Array<{ value: DistributionMetric; label: string }> = [
  { value: 'minBalance', label: 'Minimum balance' },
  { value: 'endingBalance', label: 'Ending balance' },
]

const logLinearThreshold = 1000

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

const buildHistogram = (
  values: number[],
  bins: number,
): { bins: DistributionBin[]; domain: [number, number] | null } => {
  if (values.length === 0) {
    return { bins: [], domain: null }
  }
  const transformed = values.map((value) => symlog(value))
  const min = Math.min(...transformed)
  const max = Math.max(...transformed)
  if (min === max) {
    return {
      bins: [
        {
          bucket: 0,
          start: symexp(min),
          end: symexp(max),
          x: min,
          count: values.length,
          probability: 1,
        },
      ],
      domain: [min, max],
    }
  }

  const span = max - min
  const binSize = span / bins
  const buckets = Array.from({ length: bins }, (_, index) => ({
    bucket: index,
    start: min + index * binSize,
    end: index === bins - 1 ? max : min + (index + 1) * binSize,
    count: 0,
  }))
  transformed.forEach((value) => {
    const rawIndex = Math.floor((value - min) / binSize)
    const index = Math.min(Math.max(rawIndex, 0), bins - 1)
    buckets[index].count += 1
  })

  return {
    bins: buckets.map((bucket) => ({
      bucket: bucket.bucket,
      start: symexp(bucket.start),
      end: symexp(bucket.end),
      x: (bucket.start + bucket.end) / 2,
      count: bucket.count,
      probability: bucket.count / values.length,
    })),
    domain: [min, max],
  }
}

const RunResultsDistributions = ({
  stochasticRuns,
  formatAxisValue,
  formatCurrency,
}: RunResultsDistributionsProps) => {
  const [metric, setMetric] = useState<DistributionMetric>('endingBalance')
  const [showChart, setShowChart] = useState(true)

  const values = useMemo(
    () =>
      (stochasticRuns ?? [])
        .map((run) => run[metric])
        .filter((value) => Number.isFinite(value)),
    [metric, stochasticRuns],
  )

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
    if (values.length === 0) {
      return { bins: [], domain: null }
    }
    const binCount = Math.min(24, Math.max(6, Math.round(Math.sqrt(values.length))))
    return buildHistogram(values, binCount)
  }, [values])

  return (
    <div className="card" id="section-distributions">
      <div className="row">
        <h2>Balance distributions</h2>
        <div className="row" style={{ gap: '0.75rem' }}>
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram.bins}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  tickFormatter={(value) => formatAxisValue(symexp(Number(value)))}
                  domain={histogram.domain ?? ['dataMin', 'dataMax']}
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
                      </div>
                    )
                  }}
                  wrapperStyle={{ zIndex: 10, pointerEvents: 'none' }}
                />
                <Bar dataKey="probability" name="Probability" fill="var(--accent)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="muted">
            No stochastic runs available yet. Increase the stochastic run count and rerun the
            simulation.
          </p>
        )
      ) : null}
    </div>
  )
}

export default RunResultsDistributions
