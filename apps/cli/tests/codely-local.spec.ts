import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { execa } from 'execa'

it('covers executor outcome and cancellation races without a model', async () => {
  const tests = fileURLToPath(new URL('./fixtures/codely-local/run.test.mjs', import.meta.url))
  const result = await execa(process.execPath, ['--test', tests])
  expect(result.exitCode).toBe(0)
})

it.each(['lifecycle', 'deadline'])('executes the %s scenario through Loader without a model turn', async (scenario) => {
  const driver = fileURLToPath(new URL('./fixtures/codely-local/driver.ts', import.meta.url))
  const configPath = fileURLToPath(new URL('./fixtures/codely-local/cordis.yml', import.meta.url))
  const configBefore = await readFile(configPath, 'utf8')
  const result = await runLoaderSmoke({
    label: 'local Codely commands', tempDirPrefix: 'dsh-codely-loader-',
    binScript: driver, libBinScript: driver, configPath, binArgs: [configPath, scenario],
    tsconfigPath: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)),
    processTimeoutMs: 60000,
  })
  expect(result.stdout).toContain('CODELY_LOCAL_SMOKE_OK')
  expect(await readFile(configPath, 'utf8')).toBe(configBefore)
}, 75000)
