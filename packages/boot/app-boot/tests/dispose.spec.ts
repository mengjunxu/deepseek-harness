/** Whole-application drains finish before concurrent resource cleanup starts. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished, vi } from 'vitest'
import { disposeApplication } from '../src/dispose.ts'
import { boot, StartupError } from '../src/index.ts'

it('joins repeated shutdown calls and waits for every drain before disposing resources', async () => {
  const ctx = new Context(), entered = Promise.withResolvers<undefined>(), release = Promise.withResolvers<undefined>()
  onTestFinished(async () => { release.resolve(undefined); await ctx.fiber.dispose() })
  const resource = vi.fn(), first = vi.fn(), second = vi.fn()
  ctx.effect(() => resource)
  ctx.on('app-boot/before-dispose', async () => {
    first(); entered.resolve(undefined); await release.promise
  })
  ctx.on('app-boot/before-dispose', async () => { second() })
  const pending = disposeApplication(ctx)
  expect(disposeApplication(ctx)).toBe(pending)
  try {
    await entered.promise
    expect(first).toHaveBeenCalledOnce()
    expect(resource).not.toHaveBeenCalled()
  } finally { release.resolve(undefined); await pending }
  expect(second).toHaveBeenCalledOnce()
  expect(resource).toHaveBeenCalledOnce()
  expect(disposeApplication(ctx)).toBe(pending)
})

it('awaits the remaining drains and releases resources after a listener fails', async () => {
  const ctx = new Context(), entered = Promise.withResolvers<undefined>(), release = Promise.withResolvers<undefined>()
  onTestFinished(async () => { release.resolve(undefined); await ctx.fiber.dispose() })
  const failure = new Error('drain failed'), resource = vi.fn()
  ctx.effect(() => resource)
  ctx.on('app-boot/before-dispose', () => { throw failure })
  ctx.on('app-boot/before-dispose', async () => { entered.resolve(undefined); await release.promise })
  const pending = disposeApplication(ctx)
  const rejected = expect(pending).rejects.toMatchObject({ errors: [failure] })
  try { await entered.promise; expect(resource).not.toHaveBeenCalled() }
  finally { release.resolve(undefined); await rejected }
  expect(resource).toHaveBeenCalledOnce()
})

it('retains both a drain failure and an unexpected root cleanup rejection', async () => {
  const ctx = new Context(), first = new Error('drain failed'), second = new Error('root cleanup failed')
  ctx.on('app-boot/before-dispose', () => { throw first })
  const original = ctx.fiber.dispose
  const spy = vi.spyOn(ctx.fiber, 'dispose').mockRejectedValue(second)
  onTestFinished(async () => { spy.mockRestore(); await original() })
  await expect(disposeApplication(ctx)).rejects.toMatchObject({ errors: [{ errors: [first] }, second] })
})


it.each([false, true])('preserves a startup failure when its application drain also fails (structured=%s)', async (structured) => {
  const original = structured ? new StartupError('primary startup failure', []) : new Error('primary startup failure')
  const cleanup = new Error('secondary drain failure'), released = vi.fn()
  try {
    await boot('test', '/unreached/cordis.yml', undefined, (ctx) => {
      ctx.effect(() => released)
      ctx.on('app-boot/before-dispose', () => { throw cleanup })
      throw original
    })
    throw new Error('Startup unexpectedly completed')
  } catch (error) {
    if (!(error instanceof Error)) throw error
    expect(released).toHaveBeenCalledOnce()
    if (structured) {
      expect(error).toBe(original)
      if (!(error instanceof StartupError)) throw error
      const messages = error.startup?.messages
      expect(messages?.some(record => record.args.includes(cleanup))).toBe(true)
    } else {
      expect(error.cause).toBe(original)
      expect(error.message).toContain('secondary drain failure')
    }
  }
})
