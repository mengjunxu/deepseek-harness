/**
 * Install packed tarballs into a throwaway consumer outside the repository and
 * drive the installed executable with plain Node.
 *
 * Every tarball the installed tree needs comes from `--from`, so the only
 * registry traffic is for external dependencies. That matters beyond hermetic
 * verification: the harness packages declare the vendored framework as a peer,
 * those packages live in another release sequence, and this job must not depend
 * on the registry already carrying versions that match — one pull request may
 * bump both families before either publishes — so a dsh verification passes the
 * vendored family's pack output too, while publishing only its own
 * ([rationale](../../.agents/notes/implemented/process/2026-08-10-npm-release-sequences.md)).
 *
 * What this proves is that `files` selected a complete payload and that the
 * published dependency ranges resolve. A workspace link or a stale `lib/` in the
 * checkout cannot stand in for a missing file here.
 */

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { releaseFamily } from './families.ts'
import { capture, isEntry } from './process.ts'
import { packedIdentity } from './tarball.ts'
import { verifyInstalledProductIsolation } from './installed-product-isolation.ts'

const taskboardScenarios = new Map<string, string[][]>([
  ['history', [[]]],
  ['backup', [['--backup']]],
  ['openai', [['--openai-deployment']]],
  ['validation', [['--no-model-review'], ['--browser-run'], ['--script-scope']]],
  ['review', [['--reviewed-repair']]],
])

/**
 * Environment for the installed artifact: no host Node hooks, no host DeepSeek
 * Harness home, and no ambient npm user agent that would confuse npm.
 * @param consumerRoot - the throwaway consumer directory.
 * @returns The child environment.
 */
function consumerEnvironment(consumerRoot: string): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  delete environment.npm_config_user_agent
  delete environment.NPM_CONFIG_USER_AGENT
  delete environment.NODE_OPTIONS
  delete environment.NODE_PATH
  environment.DSH_HOME = resolve(consumerRoot, '.dsh')
  environment.DSH_AGENTS_HOME = resolve(consumerRoot, '.agents')
  environment.DSH_TELEMETRY_DISABLED = '1'
  return environment
}

/**
 * Every packed tarball in the given directories, as `file:` dependency entries.
 *
 * The directories are read by their contents rather than a pack order file: a
 * directory here can hold tarballs packed only to satisfy a cross-sequence
 * dependency, which no release order describes.
 * @param directories - absolute directories holding packed tarballs.
 * @returns Package name to tarball file URL, and the version each carries.
 */
function packedDependencies(directories: readonly string[]): Map<string, { url: string; version: string }> {
  const dependencies = new Map<string, { url: string; version: string }>()
  for (const directory of directories) {
    const tarballs = readdirSync(directory).filter(name => name.endsWith('.tgz')).sort()
    if (tarballs.length === 0) throw new Error(`${directory} holds no packed tarball`)
    for (const filename of tarballs) {
      const tarball = join(directory, filename)
      const { name, version } = packedIdentity(tarball)
      dependencies.set(name, { url: pathToFileURL(tarball).href, version })
    }
  }
  return dependencies
}

/** Install every tarball under `--from` and drive the `--family` entry. */
function main(): void {
  const { values } = parseArgs({
    options: { family: { type: 'string' }, from: { type: 'string', multiple: true }, taskboard: { type: 'string' } },
    allowPositionals: false,
  })
  if (values.family === undefined || values.from === undefined || values.from.length === 0) {
    throw new Error('supply --family <dsh|vendor> and at least one --from <packed directory>')
  }
  const probe = values.taskboard
  const scenarios = probe === undefined ? undefined : taskboardScenarios.get(probe)
  if (probe !== undefined && (values.family !== 'dsh' || scenarios === undefined)) {
    throw new Error(`--taskboard requires --family dsh and one of ${[...taskboardScenarios.keys()].join(', ')}`)
  }
  if (probe !== undefined && probe !== 'history' && process.platform !== 'darwin') {
    throw new Error('Taskboard SDK probes require macOS')
  }

  const family = releaseFamily(values.family)
  const entry = family.installedEntry
  if (entry === undefined) {
    console.log(`release verify-packed-install: family ${family.id} publishes no executable, nothing to drive`)
    return
  }

  const root = process.cwd()
  const packed = packedDependencies(values.from.map(directory => resolve(root, directory)))
  const expected = packed.get(entry.packageName)
  if (expected === undefined) throw new Error(`${entry.packageName} is not among the packed tarballs`)

  const consumerRoot = mkdtempSync(join(tmpdir(), `dsh-packed-${family.id}-`))
  try {
    const localPackages = Object.fromEntries([...packed].map(([name, artifact]) => [name, artifact.url]))
    writeFileSync(join(consumerRoot, 'package.json'), `${JSON.stringify({
      name: `dsh-packed-install-${family.id}`,
      version: '0.0.0',
      private: true,
      ...(probe === undefined ? { dependencies: localPackages } : {
        dependencies: { [entry.packageName]: expected.url },
        overrides: localPackages,
      }),
    }, null, 2)}\n`)

    const environment = consumerEnvironment(consumerRoot)
    console.log(`release verify-packed-install: resolving from ${String(packed.size)} local tarball(s) in ${consumerRoot}`)
    // The CLI version probe also covers missing optional native binaries. The Web
    // profile uses the ordinary platform install, including native dependencies.
    const optional = probe === undefined ? '--omit=optional' : '--include=optional'
    capture('npm', ['install', '--no-audit', '--no-fund', '--package-lock=false', optional, '--loglevel=http'],
      { cwd: consumerRoot, env: environment })

    const installedEntry = join(consumerRoot, 'node_modules', entry.packageName)
    const packageCount = verifyInstalledProductIsolation(installedEntry)
    console.log(`release verify-packed-install: ${String(packageCount)} default-product packages exclude experimental packages`)
    const bin = join(consumerRoot, 'node_modules', ...entry.packageName.split('/'), entry.binPath)
    const version = capture(process.execPath, [bin, '--version'], { cwd: consumerRoot, env: environment })
    if (version !== expected.version) {
      throw new Error(`installed ${entry.packageName} --version reported ${JSON.stringify(version)}, expected ${expected.version}`)
    }
    console.log(`release verify-packed-install: installed ${entry.packageName} reports ${version}`)
    if (scenarios) {
      const fixture = join(root, 'apps/web/tests/fixtures/taskboard-smoke.mjs')
      for (const flags of scenarios) {
        console.log(capture(process.execPath, [fixture, '--installed-cli', bin, ...flags], { cwd: consumerRoot, env: environment }))
      }
    }
  } finally {
    rmSync(consumerRoot, { recursive: true, force: true })
  }
}

if (isEntry(import.meta.url)) main()
