// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Panel } from '../src/client/Panel.tsx'
import { en } from '../src/client/locales.ts'
import type { ChatgptPlanState } from '../src/types.ts'
import type { ComponentProps } from 'react'

afterEach(cleanup)
function show(state: ChatgptPlanState) {
  const actions = { start: vi.fn(), cancel: vi.fn(), disconnect: vi.fn(), acknowledge: vi.fn() }
  const props = { ...actions, usePlan: (selector: (value: ChatgptPlanState) => unknown) => selector(state),
    t: (key: keyof typeof en) => en[key] } as ComponentProps<typeof Panel>
  render(<Panel {...props} />)
  return actions
}
it('offers subscription login and usage management without an API-key field', () => {
  const actions = show({ connected: false, authorizing: false })
  fireEvent.click(screen.getByRole('button', { name: en.connect }))
  expect(actions.start).toHaveBeenCalledOnce()
  expect(screen.getByRole('link', { name: en.manage }).getAttribute('href')).toBe('https://chatgpt.com/settings/usage')
  expect(screen.queryByRole('textbox')).toBeNull()
})
it('offers cancellation while browser consent is pending', () => {
  const actions = show({ connected: false, authorizing: true, authorizationUrl: 'https://auth.openai.com/example' })
  expect(screen.getByRole('link', { name: en.open }).getAttribute('href')).toBe('https://auth.openai.com/example')
  fireEvent.click(screen.getByRole('button', { name: en.cancel }))
  expect(actions.cancel).toHaveBeenCalledOnce()
})
it('keeps the connected account visible after a failed disconnect', () => {
  show({ connected: true, authorizing: false, email: 'fixture@example.test', error: 'AUTH' })
  expect(screen.getByText('fixture@example.test')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toBe(en.failed)
  expect(screen.getByRole('button', { name: en.disconnect })).toBeTruthy()
})
