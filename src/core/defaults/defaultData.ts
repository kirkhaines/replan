import type {
  InflationDefault,
  HoldingTypeDefault,
  ContributionLimitDefault,
  SsaBendPoint,
  SsaRetirementAdjustment,
  SsaWageIndex,
  TaxPolicy,
  IrmaaTable,
  RmdTableEntry,
} from '../models'

export const inflationDefaultsSeed: Array<Pick<InflationDefault, 'type' | 'rate'>> = [
  { type: 'none', rate: 0 },
  { type: 'cpi', rate: 0.02 },
  { type: 'medical', rate: 0.03 },
  { type: 'housing', rate: 0.025 },
  { type: 'education', rate: 0.03 },
]

export const holdingTypeDefaultsSeed: Array<
  Pick<HoldingTypeDefault, 'type' | 'returnRate' | 'returnStdDev'>
> = [
  { type: 'bonds', returnRate: 0.04, returnStdDev: 0.06 },
  { type: 'sp500', returnRate: 0.1, returnStdDev: 0.16 },
  { type: 'nasdaq', returnRate: 0.12, returnStdDev: 0.22 },
  { type: 'dow', returnRate: 0.08, returnStdDev: 0.14 },
  { type: 'non_us_developed', returnRate: 0.08, returnStdDev: 0.17 },
  { type: 'emerging_markets', returnRate: 0.1, returnStdDev: 0.22 },
  { type: 'real_estate', returnRate: 0.07, returnStdDev: 0.15 },
  { type: 'cash', returnRate: 0.02, returnStdDev: 0.01 },
]

export const contributionLimitDefaultsSeed: Array<
  Pick<ContributionLimitDefault, 'type' | 'year' | 'amount'>
> = [
  { type: '401k', year: 2024, amount: 23000 },
  { type: 'hsa', year: 2024, amount: 4150 },
]

export const ssaWageIndexSeed: Array<Pick<SsaWageIndex, 'year' | 'index'>> = [
  { year: 1951, index: 2799.16 },
  { year: 1952, index: 2973.32 },
  { year: 1953, index: 3139.44 },
  { year: 1954, index: 3155.64 },
  { year: 1955, index: 3301.44 },
  { year: 1956, index: 3532.36 },
  { year: 1957, index: 3641.72 },
  { year: 1958, index: 3673.8 },
  { year: 1959, index: 3855.8 },
  { year: 1960, index: 4007.12 },
  { year: 1961, index: 4086.76 },
  { year: 1962, index: 4291.4 },
  { year: 1963, index: 4396.64 },
  { year: 1964, index: 4576.32 },
  { year: 1965, index: 4658.72 },
  { year: 1966, index: 4938.36 },
  { year: 1967, index: 5213.44 },
  { year: 1968, index: 5571.76 },
  { year: 1969, index: 5893.76 },
  { year: 1970, index: 6186.24 },
  { year: 1971, index: 6497.08 },
  { year: 1972, index: 7133.8 },
  { year: 1973, index: 7580.16 },
  { year: 1974, index: 8030.76 },
  { year: 1975, index: 8630.92 },
  { year: 1976, index: 9226.48 },
  { year: 1977, index: 9779.44 },
  { year: 1978, index: 10556.03 },
  { year: 1979, index: 11479.46 },
  { year: 1980, index: 12513.46 },
  { year: 1981, index: 13773.1 },
  { year: 1982, index: 14531.34 },
  { year: 1983, index: 15239.24 },
  { year: 1984, index: 16135.07 },
  { year: 1985, index: 16822.51 },
  { year: 1986, index: 17321.82 },
  { year: 1987, index: 18426.51 },
  { year: 1988, index: 19334.04 },
  { year: 1989, index: 20099.55 },
  { year: 1990, index: 21027.98 },
  { year: 1991, index: 21811.6 },
  { year: 1992, index: 22935.42 },
  { year: 1993, index: 23132.67 },
  { year: 1994, index: 23753.53 },
  { year: 1995, index: 24705.66 },
  { year: 1996, index: 25913.9 },
  { year: 1997, index: 27426.0 },
  { year: 1998, index: 28861.44 },
  { year: 1999, index: 30469.84 },
  { year: 2000, index: 32154.82 },
  { year: 2001, index: 32921.92 },
  { year: 2002, index: 33252.09 },
  { year: 2003, index: 34064.95 },
  { year: 2004, index: 35648.55 },
  { year: 2005, index: 36952.94 },
  { year: 2006, index: 38651.41 },
  { year: 2007, index: 40405.48 },
  { year: 2008, index: 41334.97 },
  { year: 2009, index: 40711.61 },
  { year: 2010, index: 41673.83 },
  { year: 2011, index: 42979.61 },
  { year: 2012, index: 44321.67 },
  { year: 2013, index: 44888.16 },
  { year: 2014, index: 46481.52 },
  { year: 2015, index: 48098.63 },
  { year: 2016, index: 48642.15 },
  { year: 2017, index: 50321.89 },
  { year: 2018, index: 52145.8 },
  { year: 2019, index: 54099.99 },
  { year: 2020, index: 55628.6 },
  { year: 2021, index: 60575.07 },
  { year: 2022, index: 63795.13 },
  { year: 2023, index: 66621.8 },
  { year: 2024, index: 69846.57 },
]

export const ssaBendPointSeed: Array<Pick<SsaBendPoint, 'year' | 'first' | 'second'>> = [
  { year: 2026, first: 1286, second: 7749 },
]

export const ssaRetirementAdjustmentSeed: Array<
  Pick<
    SsaRetirementAdjustment,
    | 'birthYearStart'
    | 'birthYearEnd'
    | 'normalRetirementAgeMonths'
    | 'delayedRetirementCreditPerYear'
  >
> = [
  { birthYearStart: 1917, birthYearEnd: 1918, normalRetirementAgeMonths: 65 * 12, delayedRetirementCreditPerYear: 0.015 },
  { birthYearStart: 1919, birthYearEnd: 1920, normalRetirementAgeMonths: 65 * 12, delayedRetirementCreditPerYear: 0.02 },
  { birthYearStart: 1921, birthYearEnd: 1922, normalRetirementAgeMonths: 65 * 12, delayedRetirementCreditPerYear: 0.025 },
  { birthYearStart: 1923, birthYearEnd: 1924, normalRetirementAgeMonths: 65 * 12, delayedRetirementCreditPerYear: 0.03 },
  { birthYearStart: 1925, birthYearEnd: 1926, normalRetirementAgeMonths: 65 * 12, delayedRetirementCreditPerYear: 0.035 },
  { birthYearStart: 1927, birthYearEnd: 1928, normalRetirementAgeMonths: 65 * 12, delayedRetirementCreditPerYear: 0.04 },
  { birthYearStart: 1929, birthYearEnd: 1930, normalRetirementAgeMonths: 65 * 12, delayedRetirementCreditPerYear: 0.045 },
  { birthYearStart: 1931, birthYearEnd: 1932, normalRetirementAgeMonths: 65 * 12, delayedRetirementCreditPerYear: 0.05 },
  { birthYearStart: 1933, birthYearEnd: 1934, normalRetirementAgeMonths: 65 * 12, delayedRetirementCreditPerYear: 0.055 },
  { birthYearStart: 1935, birthYearEnd: 1936, normalRetirementAgeMonths: 65 * 12, delayedRetirementCreditPerYear: 0.06 },
  { birthYearStart: 1937, birthYearEnd: 1937, normalRetirementAgeMonths: 65 * 12, delayedRetirementCreditPerYear: 0.065 },
  { birthYearStart: 1938, birthYearEnd: 1938, normalRetirementAgeMonths: 65 * 12 + 2, delayedRetirementCreditPerYear: 0.065 },
  { birthYearStart: 1939, birthYearEnd: 1939, normalRetirementAgeMonths: 65 * 12 + 4, delayedRetirementCreditPerYear: 0.07 },
  { birthYearStart: 1940, birthYearEnd: 1940, normalRetirementAgeMonths: 65 * 12 + 6, delayedRetirementCreditPerYear: 0.07 },
  { birthYearStart: 1941, birthYearEnd: 1941, normalRetirementAgeMonths: 65 * 12 + 8, delayedRetirementCreditPerYear: 0.075 },
  { birthYearStart: 1942, birthYearEnd: 1942, normalRetirementAgeMonths: 65 * 12 + 10, delayedRetirementCreditPerYear: 0.075 },
  { birthYearStart: 1943, birthYearEnd: 1954, normalRetirementAgeMonths: 66 * 12, delayedRetirementCreditPerYear: 0.08 },
  { birthYearStart: 1955, birthYearEnd: 1955, normalRetirementAgeMonths: 66 * 12 + 2, delayedRetirementCreditPerYear: 0.08 },
  { birthYearStart: 1956, birthYearEnd: 1956, normalRetirementAgeMonths: 66 * 12 + 4, delayedRetirementCreditPerYear: 0.08 },
  { birthYearStart: 1957, birthYearEnd: 1957, normalRetirementAgeMonths: 66 * 12 + 6, delayedRetirementCreditPerYear: 0.08 },
  { birthYearStart: 1958, birthYearEnd: 1958, normalRetirementAgeMonths: 66 * 12 + 8, delayedRetirementCreditPerYear: 0.08 },
  { birthYearStart: 1959, birthYearEnd: 1959, normalRetirementAgeMonths: 66 * 12 + 10, delayedRetirementCreditPerYear: 0.08 },
  { birthYearStart: 1960, birthYearEnd: 9999, normalRetirementAgeMonths: 67 * 12, delayedRetirementCreditPerYear: 0.08 },
]

export const taxPolicySeed: TaxPolicy[] = [
  {
    year: 2024,
    filingStatus: 'single',
    standardDeduction: 14600,
    ordinaryBrackets: [
      { upTo: 11600, rate: 0.1 },
      { upTo: 47150, rate: 0.12 },
      { upTo: 100525, rate: 0.22 },
      { upTo: 191950, rate: 0.24 },
      { upTo: 243725, rate: 0.32 },
      { upTo: 609350, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
    capitalGainsBrackets: [
      { upTo: 47025, rate: 0 },
      { upTo: 518900, rate: 0.15 },
      { upTo: null, rate: 0.2 },
    ],
  },
  {
    year: 2024,
    filingStatus: 'married_joint',
    standardDeduction: 29200,
    ordinaryBrackets: [
      { upTo: 23200, rate: 0.1 },
      { upTo: 94300, rate: 0.12 },
      { upTo: 201050, rate: 0.22 },
      { upTo: 383900, rate: 0.24 },
      { upTo: 487450, rate: 0.32 },
      { upTo: 731200, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
    capitalGainsBrackets: [
      { upTo: 94050, rate: 0 },
      { upTo: 583750, rate: 0.15 },
      { upTo: null, rate: 0.2 },
    ],
  },
  {
    year: 2024,
    filingStatus: 'married_separate',
    standardDeduction: 14600,
    ordinaryBrackets: [
      { upTo: 11600, rate: 0.1 },
      { upTo: 47150, rate: 0.12 },
      { upTo: 100525, rate: 0.22 },
      { upTo: 191950, rate: 0.24 },
      { upTo: 243725, rate: 0.32 },
      { upTo: 365600, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
    capitalGainsBrackets: [
      { upTo: 47025, rate: 0 },
      { upTo: 291850, rate: 0.15 },
      { upTo: null, rate: 0.2 },
    ],
  },
  {
    year: 2024,
    filingStatus: 'head_of_household',
    standardDeduction: 21900,
    ordinaryBrackets: [
      { upTo: 16550, rate: 0.1 },
      { upTo: 63100, rate: 0.12 },
      { upTo: 100500, rate: 0.22 },
      { upTo: 191950, rate: 0.24 },
      { upTo: 243700, rate: 0.32 },
      { upTo: 609350, rate: 0.35 },
      { upTo: null, rate: 0.37 },
    ],
    capitalGainsBrackets: [
      { upTo: 63000, rate: 0 },
      { upTo: 551350, rate: 0.15 },
      { upTo: null, rate: 0.2 },
    ],
  },
]

export const irmaaTableSeed: IrmaaTable[] = [
  {
    year: 2024,
    filingStatus: 'single',
    lookbackYears: 2,
    tiers: [
      { maxMagi: 103000, partBMonthly: 174.7, partDMonthly: 0 },
      { maxMagi: 129000, partBMonthly: 244.6, partDMonthly: 12.9 },
      { maxMagi: 161000, partBMonthly: 349.4, partDMonthly: 33.3 },
      { maxMagi: 193000, partBMonthly: 454.2, partDMonthly: 53.8 },
      { maxMagi: 500000, partBMonthly: 559, partDMonthly: 74.2 },
      { maxMagi: null, partBMonthly: 594, partDMonthly: 81 },
    ],
  },
  {
    year: 2024,
    filingStatus: 'married_joint',
    lookbackYears: 2,
    tiers: [
      { maxMagi: 206000, partBMonthly: 174.7, partDMonthly: 0 },
      { maxMagi: 258000, partBMonthly: 244.6, partDMonthly: 12.9 },
      { maxMagi: 322000, partBMonthly: 349.4, partDMonthly: 33.3 },
      { maxMagi: 386000, partBMonthly: 454.2, partDMonthly: 53.8 },
      { maxMagi: 750000, partBMonthly: 559, partDMonthly: 74.2 },
      { maxMagi: null, partBMonthly: 594, partDMonthly: 81 },
    ],
  },
  {
    year: 2024,
    filingStatus: 'married_separate',
    lookbackYears: 2,
    tiers: [
      { maxMagi: 103000, partBMonthly: 174.7, partDMonthly: 0 },
      { maxMagi: 129000, partBMonthly: 244.6, partDMonthly: 12.9 },
      { maxMagi: 161000, partBMonthly: 349.4, partDMonthly: 33.3 },
      { maxMagi: 193000, partBMonthly: 454.2, partDMonthly: 53.8 },
      { maxMagi: 500000, partBMonthly: 559, partDMonthly: 74.2 },
      { maxMagi: null, partBMonthly: 594, partDMonthly: 81 },
    ],
  },
  {
    year: 2024,
    filingStatus: 'head_of_household',
    lookbackYears: 2,
    tiers: [
      { maxMagi: 103000, partBMonthly: 174.7, partDMonthly: 0 },
      { maxMagi: 129000, partBMonthly: 244.6, partDMonthly: 12.9 },
      { maxMagi: 161000, partBMonthly: 349.4, partDMonthly: 33.3 },
      { maxMagi: 193000, partBMonthly: 454.2, partDMonthly: 53.8 },
      { maxMagi: 500000, partBMonthly: 559, partDMonthly: 74.2 },
      { maxMagi: null, partBMonthly: 594, partDMonthly: 81 },
    ],
  },
]

const buildRmdTableSeed = () => {
  const table: RmdTableEntry[] = []
  let divisor = 26.5
  for (let age = 73; age <= 100; age += 1) {
    table.push({ age, divisor })
    divisor = Math.max(1, divisor - 1)
  }
  return table
}

export const rmdTableSeed: RmdTableEntry[] = buildRmdTableSeed()
