import { describe, expect, it } from 'vitest'
import {
  calculateSeppDistribution,
  getLifeExpectancyFactor,
} from './sepp72tCalculator'

describe('sepp72tCalculator', () => {
  it('looks up Single Life Expectancy correctly', () => {
    expect(getLifeExpectancyFactor(50, 'single')).toBe(36.2)
    expect(getLifeExpectancyFactor(55, 'single')).toBe(31.6)
    expect(getLifeExpectancyFactor(60, 'single')).toBe(27.1)
  })

  it('looks up Uniform Lifetime table correctly', () => {
    expect(getLifeExpectancyFactor(50, 'uniform')).toBe(48.0)
    expect(getLifeExpectancyFactor(60, 'uniform')).toBe(38.7)
  })

  it('calculates RMD method distribution', () => {
    // Balance 500,000 at age 50 with Single Life factor 36.2
    // 500,000 / 36.2 = 13,812.15
    const result = calculateSeppDistribution({
      age: 50,
      balance: 500000,
      method: 'rmd',
      interestOrSinkRate: 0,
      tableType: 'single',
    })
    expect(result.lifeExpectancy).toBe(36.2)
    expect(result.annualDistribution).toBeCloseTo(13812.15, 1)
    expect(result.monthlyDistribution).toBeCloseTo(1151.01, 1)
  })

  it('calculates Fixed Amortization method distribution', () => {
    // Balance 500,000 at age 50, rate 5%, Single Life factor 36.2
    // Annuity factor = (1 - (1.05)^(-36.2)) / 0.05 ≈ 16.586
    // Payment = 500,000 / 16.586 ≈ 30,145.8
    const result = calculateSeppDistribution({
      age: 50,
      balance: 500000,
      method: 'amortization',
      interestOrSinkRate: 5,
      tableType: 'single',
    })
    expect(result.annualDistribution).toBeGreaterThan(30000)
    expect(result.annualDistribution).toBeLessThan(30300)
  })

  it('calculates Fixed Annuitization / Sinking Fund method distribution', () => {
    const result = calculateSeppDistribution({
      age: 50,
      balance: 500000,
      method: 'annuitization',
      interestOrSinkRate: 5,
      tableType: 'single',
    })
    expect(result.annualDistribution).toBeGreaterThan(30000)
    expect(result.annualDistribution).toBeLessThan(30300)
  })

  it('returns zeros for invalid inputs', () => {
    const result = calculateSeppDistribution({
      age: 0,
      balance: 0,
      method: 'amortization',
      interestOrSinkRate: 5,
    })
    expect(result.annualDistribution).toBe(0)
    expect(result.monthlyDistribution).toBe(0)
  })
})
