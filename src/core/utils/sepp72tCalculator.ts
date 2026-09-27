/**
 * 72(t) / SEPP (Substantially Equal Periodic Payments) Calculator
 *
 * Implements the three IRS approved calculation methods under IRC § 72(t) / Notice 2022-6:
 * 1. Required Minimum Distribution (RMD) method
 * 2. Fixed Amortization method
 * 3. Fixed Annuitization / Sinking Fund method
 *
 * Uses IRS Single Life Expectancy (Table I) and Uniform Lifetime (Table III) tables
 * (Treas. Reg. § 1.401(a)(9)-9 updated 2022).
 */

export type SeppCalculationMethod = 'amortization' | 'annuitization' | 'rmd'
export type SeppTableType = 'single' | 'uniform'

/**
 * IRS Single Life Expectancy Table (Table I) - Ages 18 to 85.
 */
export const IRS_SINGLE_LIFE_TABLE: Record<number, number> = {
  18: 67.0, 19: 66.0, 20: 65.0, 21: 64.1, 22: 63.1, 23: 62.1, 24: 61.1, 25: 60.2,
  26: 59.2, 27: 58.2, 28: 57.3, 29: 56.3, 30: 55.3, 31: 54.4, 32: 53.4, 33: 52.5,
  34: 51.5, 35: 50.5, 36: 49.6, 37: 48.6, 38: 47.7, 39: 46.7, 40: 45.7, 41: 44.8,
  42: 43.8, 43: 42.9, 44: 41.9, 45: 41.0, 46: 40.0, 47: 39.0, 48: 38.1, 49: 37.1,
  50: 36.2, 51: 35.3, 52: 34.3, 53: 33.4, 54: 32.5, 55: 31.6, 56: 30.6, 57: 29.8,
  58: 28.9, 59: 28.0, 60: 27.1, 61: 26.2, 62: 25.4, 63: 24.5, 64: 23.7, 65: 22.9,
  66: 22.1, 67: 21.4, 68: 20.6, 69: 19.9, 70: 19.1, 71: 18.4, 72: 17.7, 73: 17.0,
  74: 16.4, 75: 15.7, 76: 15.0, 77: 14.3, 78: 13.7, 79: 13.1, 80: 12.5, 81: 11.9,
  82: 11.3, 83: 10.7, 84: 10.1, 85: 9.6,
}

/**
 * IRS Uniform Lifetime Table (Table III) - Ages 30 to 85.
 */
export const IRS_UNIFORM_LIFETIME_TABLE: Record<number, number> = {
  30: 67.4, 31: 66.4, 32: 65.4, 33: 64.4, 34: 63.4, 35: 62.4, 36: 61.4, 37: 60.4,
  38: 59.4, 39: 58.4, 40: 57.5, 41: 56.5, 42: 55.5, 43: 54.5, 44: 53.5, 45: 52.7,
  46: 51.7, 47: 50.7, 48: 49.7, 49: 48.7, 50: 48.0, 51: 47.0, 52: 46.0, 53: 45.1,
  54: 44.1, 55: 43.3, 56: 42.3, 57: 41.4, 58: 40.5, 59: 39.6, 60: 38.7, 61: 37.9,
  62: 37.0, 63: 36.1, 64: 35.3, 65: 34.2, 66: 33.4, 67: 32.5, 68: 31.6, 69: 30.7,
  70: 29.8, 71: 28.9, 72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9,
  78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0,
}

export const getLifeExpectancyFactor = (
  age: number,
  tableType: SeppTableType = 'single',
): number => {
  const roundedAge = Math.round(age)
  const table = tableType === 'uniform' ? IRS_UNIFORM_LIFETIME_TABLE : IRS_SINGLE_LIFE_TABLE

  if (table[roundedAge] !== undefined) {
    return table[roundedAge]
  }

  // Graceful fallback for boundaries
  const ages = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b)
  const minAge = ages[0]
  const maxAge = ages[ages.length - 1]

  if (roundedAge < minAge) {
    const factorAtMin = table[minAge]
    return factorAtMin + (minAge - roundedAge)
  }
  if (roundedAge > maxAge) {
    const factorAtMax = table[maxAge]
    return Math.max(1, factorAtMax - (roundedAge - maxAge) * 0.5)
  }

  return 30.0
}

export type SeppCalculationInput = {
  age: number
  balance: number
  method: SeppCalculationMethod
  interestOrSinkRate: number // entered as percentage, e.g. 5 for 5%
  tableType?: SeppTableType
}

export type SeppCalculationResult = {
  annualDistribution: number
  monthlyDistribution: number
  lifeExpectancy: number
  factorUsed: number
  methodLabel: string
}

export const calculateSeppDistribution = ({
  age,
  balance,
  method,
  interestOrSinkRate,
  tableType = 'single',
}: SeppCalculationInput): SeppCalculationResult => {
  if (balance <= 0 || age <= 0) {
    return {
      annualDistribution: 0,
      monthlyDistribution: 0,
      lifeExpectancy: 0,
      factorUsed: 0,
      methodLabel: getMethodLabel(method),
    }
  }

  const lifeExpectancy = getLifeExpectancyFactor(age, tableType)
  const rateFraction = Math.max(0, interestOrSinkRate) / 100

  let annualDistribution = 0
  let factorUsed = lifeExpectancy

  switch (method) {
    case 'rmd': {
      annualDistribution = lifeExpectancy > 0 ? balance / lifeExpectancy : 0
      factorUsed = lifeExpectancy
      break
    }
    case 'amortization': {
      if (rateFraction <= 0) {
        annualDistribution = lifeExpectancy > 0 ? balance / lifeExpectancy : 0
        factorUsed = lifeExpectancy
      } else {
        const annuityFactor = (1 - Math.pow(1 + rateFraction, -lifeExpectancy)) / rateFraction
        annualDistribution = annuityFactor > 0 ? balance / annuityFactor : 0
        factorUsed = annuityFactor
      }
      break
    }
    case 'annuitization': {
      if (rateFraction <= 0) {
        annualDistribution = lifeExpectancy > 0 ? balance / lifeExpectancy : 0
        factorUsed = lifeExpectancy
      } else {
        // Sinking fund factor + interest rate = Capital recovery / annuity factor inverse
        const sinkingFundFactor =
          rateFraction / (Math.pow(1 + rateFraction, lifeExpectancy) - 1)
        const totalFactor = sinkingFundFactor + rateFraction
        annualDistribution = balance * totalFactor
        factorUsed = totalFactor > 0 ? 1 / totalFactor : lifeExpectancy
      }
      break
    }
  }

  const roundedAnnual = Math.round(annualDistribution * 100) / 100
  const roundedMonthly = Math.round((annualDistribution / 12) * 100) / 100

  return {
    annualDistribution: roundedAnnual,
    monthlyDistribution: roundedMonthly,
    lifeExpectancy,
    factorUsed: Math.round(factorUsed * 1000) / 1000,
    methodLabel: getMethodLabel(method),
  }
}

export const getMethodLabel = (method: SeppCalculationMethod): string => {
  switch (method) {
    case 'amortization':
      return 'Fixed Amortization'
    case 'annuitization':
      return 'Fixed Annuitization / Sinking Fund'
    case 'rmd':
      return 'Required Minimum Distribution (RMD)'
  }
}
