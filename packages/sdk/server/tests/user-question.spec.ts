import { describe, expect, it, vi } from 'vitest'
import { askClient } from '../src/user-question.ts'

const questions = [{ id: 'color', question: 'Choose a color', options: [{ label: 'blue' }, { label: 'green' }] }]
function reply(value: unknown) {
  return askClient({ request: async () => value, notify: vi.fn() }, 'root', { questions }, new AbortController().signal)
}

describe('SDK question replies', () => {
  it('returns one answer for the question that requested it', async () => {
    const value = { answers: [{ id: 'color', selected: ['blue'] }] }
    await expect(reply(value)).resolves.toEqual(value)
    const custom = { answers: [{ id: 'color', selected: [], custom: 'amber' }] }
    await expect(reply(custom)).resolves.toEqual(custom)
    await expect(reply({ cancelled: true })).rejects.toMatchObject({ code: 'ASK_CANCELLED' })
  })

  it.each([
    null, {}, { cancelled: true, answers: [] }, { answers: [] },
    { answers: [{ id: 'other', selected: ['blue'] }] },
    { answers: [{ id: 'color', selected: ['red'] }] },
    { answers: [{ id: 'color', selected: ['blue', 'green'] }] },
    { answers: [{ id: 'color', selected: [1] }] },
    { answers: [{ id: 'color', selected: [] }] },
    { answers: [{ id: 'color', selected: [], custom: '   ' }] },
    { answers: [{ id: 'color', selected: ['blue'], custom: 'amber' }] },
    { answers: [{ id: 'color', selected: [], custom: 1 }] },
  ])('refuses malformed or mismatched answers', async (value) => {
    await expect(reply(value)).rejects.toMatchObject({ code: 'BAD_ANSWER' })
  })

  it('withdraws the outstanding request when the tool cancels', async () => {
    const tool = new AbortController()
    const notify = vi.fn()
    const request = vi.fn((_method: string, _params: object, signal?: AbortSignal) =>
      new Promise<unknown>((_resolve, reject) => signal?.addEventListener('abort', () => { reject(new Error('cancelled')) })))
    const answer = askClient({ request, notify }, 'root', { questions, signal: tool.signal }, new AbortController().signal)
    const identity = request.mock.calls[0]?.[1]
    tool.abort(new Error('cancelled'))
    await expect(answer).rejects.toThrow('cancelled')
    expect(notify).toHaveBeenCalledWith('user-question.cancelled', expect.objectContaining({ sessionId: 'root' }))
    expect(identity).toMatchObject(notify.mock.calls[0]?.[1] as object)
  })
})
