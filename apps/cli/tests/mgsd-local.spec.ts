/** Source Loader acceptance with the adapter's built workflow artifact. */
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

it('executes approved tasks, independent checks, review limits, and replanning without a model', async () => {
  const driver = fileURLToPath(new URL('./fixtures/mgsd-local/driver.ts', import.meta.url))
  const result = await runLoaderSmoke({
    label: 'local MGSD workflow', tempDirPrefix: 'dsh-mgsd-smoke-',
    binScript: driver, libBinScript: driver,
    configPath: fileURLToPath(new URL('./fixtures/codely-local/cordis.yml', import.meta.url)),
    binArgs: [fileURLToPath(new URL('./fixtures/codely-local/cordis.yml', import.meta.url))],
    tsconfigPath: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)), processTimeoutMs: 60000,
  })
  expect(result.stdout).toContain('MGSD_LOCAL_SMOKE_OK')
}, 75000)
