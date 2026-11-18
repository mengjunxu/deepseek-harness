/** Failed configured model policies remain enforced before the post-load audit. */
import { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import Loader, { Entry } from '@deepseek-ai/cordis-plugin-loader'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { expect, it, onTestFinished } from 'vitest'
import { Adapter } from '../../../guard/paid-route-policy/tests/adapter.ts'
import { auditStartupEntries, StartupError } from '../src/index.ts'
import { installAdmissionPolicyActivation, isRequiredAdmissionPolicy } from '../src/admission-policies.ts'

const call = { provider: 'local', model: 'm', messages: [] }
async function fixture(options: {
  valid?: boolean
  pending?: boolean
  disabled?: boolean
  policy?: 'paid-route-policy' | 'request-budget-policy'
} = {}) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(Loader)
  await ctx.plugin(LlmRuntime)
  const adapter = new Adapter('local')
  ctx.effect(() => ctx.llm.registerAdapter(['local'], adapter))
  ctx.loader.builtins.policy = {
    name: options.policy ?? 'request-budget-policy',
    Config: Schema.object({ accepted: Schema.boolean().required() }),
    inject: options.pending ? ['missingAdmissionDependency'] : [],
    apply() {},
  }
  const declaration = { id: 'renamed-policy', name: 'cordis:policy',
    disabled: options.disabled ?? false, config: { accepted: options.valid === false ? 'invalid' : true } }
  const id = await ctx.loader.create(declaration)
  const entry = ctx.loader.resolve(id)
  if (options.valid === false && !options.disabled && !options.pending) {
    await expect(entry.fiber!.await()).rejects.toThrow()
  } else await entry.fiber?.await()
  installAdmissionPolicyActivation(ctx)
  return { ctx, entry, adapter }
}

it.each(['paid-route-policy', 'request-budget-policy'] as const)(
  'blocks failed %s under a custom id before model lookup and makes its audit fatal', async (policy) => {
    const { ctx, adapter } = await fixture({ valid: false, policy })
    await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'ADMISSION_POLICY_INACTIVE' })
    expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1))
      .toMatchObject({ reason: { failure: { code: 'ADMISSION_POLICY_INACTIVE' } } })
    expect(adapter.resolutions).toBe(0)
    expect(adapter.calls).toBe(0)
    await expect(auditStartupEntries(ctx, 'test')).rejects.toBeInstanceOf(StartupError)
  })

it('blocks a policy pending its injection and delegates after activation', async () => {
  const { ctx, adapter } = await fixture({ pending: true })
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'ADMISSION_POLICY_INACTIVE' })
  ctx.provide('missingAdmissionDependency', {})
  await ctx.loader.await()
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1)).toMatchObject({ reason: { kind: 'stop' } })
  expect(adapter.calls).toBe(1)
})

it('permits an explicitly disabled declaration and still refuses a disabled-expression failure', async () => {
  const { ctx, entry, adapter } = await fixture({ disabled: true, valid: false })
  entry.options.name = '@deepseek-ai/dsh-request-budget-policy'
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1)).toMatchObject({ reason: { kind: 'stop' } })
  Reflect.set(entry.options, 'disabled', { __jsExpr: 'throw new Error("disabled expression failed")' })
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'ADMISSION_POLICY_INACTIVE' })
  expect(adapter.calls).toBe(1)
})

it('identifies a standard package even before import, while ignoring unrelated modules', async () => {
  const { ctx, adapter } = await fixture()
  const entry = new Entry(ctx.loader)
  entry.options = { id: 'another-id', name: '@deepseek-ai/dsh-paid-route-policy' }
  expect(isRequiredAdmissionPolicy(entry)).toBe(true)
  entry.options.name = 'unrelated-module'
  expect(isRequiredAdmissionPolicy(entry)).toBe(false)
  ctx.loader.builtins.unrelated = { name: 'unrelated-module', apply() {} }
  await ctx.loader.create({ name: 'cordis:unrelated' })
  await ctx.loader.await()
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1)).toMatchObject({ reason: { kind: 'stop' } })
  expect(adapter.calls).toBe(1)
})
