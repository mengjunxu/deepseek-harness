/** Operator mistakes reject before a live budget collection is replaced. */
import { expect, it } from 'vitest'
import { Config } from '../src/config.ts'

const rule = { id: 'test', usageSource: 'local' as const, maxRequests: 5, routes: [{ provider: 'p', models: ['m'] }] }
it('defaults to no budgets and resolves an omitted execute reserve', () => {
  expect(Config({}).budgets.get()).toEqual([])
  expect(Config({ budgets: null }).budgets.get()).toEqual([])
  expect(Config({ budgets: [rule] }).budgets.get()[0]).toMatchObject({ reserveExecuteRequests: 0 })
})
it.each([
  { budgets: [rule, rule] },
  { budgets: [rule, { ...rule, id: 'other' }] },
  { budgets: [{ ...rule, reserveExecuteRequests: 6 }] },
  { budgets: [{ ...rule, maxRequests: -1 }] },
  { budgets: [{ ...rule, maxRequests: 1.2 }] },
  { budgets: [{ ...rule, maxRequests: Number.MAX_SAFE_INTEGER + 1 }] },
  { budgets: [{ ...rule, maxRequestsPerSession: -1 }] },
  { budgets: [{ ...rule, maxRequestsPerSession: 1.2 }] },
  { budgets: [{ ...rule, maxRequestsPerSession: Number.MAX_SAFE_INTEGER + 1 }] },
  { budgets: [{ ...rule, usageSource: 'free' }] },
  { budgets: [{ ...rule, id: ' ' }] },
  { budgets: [{ ...rule, routes: [] }] },
  { budgets: [{ ...rule, routes: [{ provider: 'p', models: [] }] }] },
  { budgets: [{ ...rule, routes: [{ provider: 'p', models: ['m', 'm'] }] }] },
  { budgets: [null] },
])('rejects invalid local allowance %j', (raw) => { const input: Record<string, unknown> = raw; expect(() => Config(input)).toThrow() })

it('keeps Session limits optional and accepts a zero cap', () => {
  expect(Config({ budgets: [rule] }).budgets.get()[0]?.maxRequestsPerSession).toBeUndefined()
  expect(Config({ budgets: [{ ...rule, maxRequestsPerSession: 0 }] }).budgets.get()[0]?.maxRequestsPerSession).toBe(0)
})
