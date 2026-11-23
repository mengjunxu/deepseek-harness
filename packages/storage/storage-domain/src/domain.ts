/**
 * Runtime of one open domain: authoritative in-memory state, the single
 * per-domain write chain, and change-event emission. Reads are synchronous
 * from memory; every write queues on the chain, awaits backend durability
 * FIRST, then mutates memory, then emits `domain/changed` — a rejected
 * backend write leaves the local cache untouched. Atomic modification reads
 * fresh persisted records; events carry values that equal the local cache at
 * emission, in write order.
 * @module @deepseek-ai/dsh-storage-domain/src/domain
 */

import type { Context } from '@deepseek-ai/cordis'
import type { KvTransaction, KvUnit } from '@deepseek-ai/dsh-storage'
import type { ZodType } from 'zod'
import { DomainError, parseRecord } from './error.ts'
import type { DomainSpec, DomainGlobalSpec, TableKeyOf, TableValueOf } from './spec.ts'
import type { DomainChanged } from './events.ts'

/** Handle on a domain's global singleton. */
export interface DomainGlobal<G> {
  /**
   * Current value, synchronously from the authoritative in-memory state.
   * Before the first `set` this is the spec's `initial`.
   * @returns the current global value.
   */
  get(): G

  /**
   * Replace the value durably. Queued on the domain's write chain; the first
   * `set` is what materializes the global on the medium.
   * @param value - New value; must satisfy the spec's schema (not re-checked
   * here — validation happens at the durable read boundary).
   * @returns resolution after durability and event emission.
   */
  set(value: G): Promise<void>
}

/**
 * Handle on one declared table. Records are plain immutable data: returned
 * values are the stored objects themselves (no defensive copies) and must not
 * be mutated in place — replace via `put`/`update`.
 */
export interface KvTable<K extends string, V> {
  /**
   * Read one record, synchronously from memory.
   * @param key - Record key.
   * @returns the record, or `undefined` when absent.
   */
  get(key: K): V | undefined

  /**
   * Snapshot iterator over `[key, record]` pairs. A snapshot, not a live
   * view: iteration stays stable while queued writes land.
   * @returns the pair iterator.
   */
  entries(): IterableIterator<[K, V]>

  /**
   * Snapshot iterator over keys.
   * @returns the key iterator.
   */
  keys(): IterableIterator<K>

  /** Current record count. */
  readonly size: number

  /**
   * Insert or overwrite one record durably.
   * @param key - Record key.
   * @param value - The full new record (no partial merge).
   * @returns resolution after durability and event emission.
   */
  put(key: K, value: V): Promise<void>

  /**
   * Delete one record durably.
   * @param key - Record key.
   * @returns `true` when the record existed, `false` when it was already
   * absent (no write and no event in that case).
   */
  delete(key: K): Promise<boolean>

  /**
   * Update the cached record on this domain's process-local write chain.
   * The callback sees the local value current at its queue slot.
   * @param key - Record key; a missing key rejects with `missing-key`.
   * @param fn - Synchronous pure transform from current to next record.
   * @returns the stored next record.
   */
  update(key: K, fn: (current: V) => V): Promise<V>

  /**
   * Atomically modify the latest persisted record across independent medium
   * owners. The callback receives schema-validated data, not this handle's
   * cached value, and must be synchronous, pure and must not call storage.
   * Unsupported backends reject atomic-modify-unsupported without a fallback.
   * Reads retain their local cached value until this call commits; the result
   * updates that cache and emits the ordinary change event after durability.
   * @param key - Record key.
   * @param fn - Current record or undefined when absent; returning undefined deletes it.
   * @returns the committed callback result, or undefined after deletion.
   */
  modify(key: K, fn: (current: V | undefined) => V | undefined): Promise<V | undefined>
}

/** Global handle of a spec: typed when declared, `never` (inaccessible) when not. */
export type DomainGlobalHandleOf<S extends DomainSpec> =
  S extends { readonly global: DomainGlobalSpec<infer G> } ? DomainGlobal<G> : never

/** Schema-validated access to records of one open domain during a synchronous transaction. */
export interface DomainTransaction<S extends DomainSpec> {
  /**
   * Read the current persisted value, including earlier writes in this transaction.
   * @param table - Declared table.
   * @param key - Record identity in that table.
   * @returns the validated record or undefined.
   */
  get<N extends keyof S['tables'] & string>(table: N, key: TableKeyOf<S, N>): TableValueOf<S, N> | undefined
  /**
   * Enumerate validated records from the persisted transaction view, including earlier writes in this transaction.
   * @param table - Declared table.
   * @returns the keys and values in unspecified order.
   */
  entries<N extends keyof S['tables'] & string>(table: N): ReadonlyArray<readonly [TableKeyOf<S, N>, TableValueOf<S, N>]>
  /**
   * Replace or remove a record atomically with the other writes.
   * @param table - Declared table.
   * @param key - Record identity.
   * @param value - Next record or undefined for deletion.
   */
  set<N extends keyof S['tables'] & string>(table: N, key: TableKeyOf<S, N>, value: TableValueOf<S, N> | undefined): void
}

/** One open domain, typed by its spec. */
export interface Domain<S extends DomainSpec> {
  /** Domain name from the spec. */
  readonly name: string
  /** Global singleton handle; a spec without `global` has no usable handle (`never`). */
  readonly global: DomainGlobalHandleOf<S>
  /**
   * Resolve one declared table handle. Handles are stable — repeated calls
   * return the same instance.
   * @param name - Declared table name.
   * @returns the typed table handle.
   */
  table<N extends keyof S['tables'] & string>(name: N): KvTable<TableKeyOf<S, N>, TableValueOf<S, N>>

  /**
   * Commit changes to multiple records and update the complete local cache before publishing events.
   * @param operation - Synchronous operation against the latest persisted records.
   * @returns the callback result after commit. An unsupported medium rejects before calling the operation.
   */
  transaction<T>(operation: (tx: DomainTransaction<S>) => T): Promise<T>

  /**
   * Close this domain: reject new writes immediately, drain already-queued
   * writes (their events still emit), release the backend unit, then free
   * the domain name for a later open. Idempotent — repeated calls share one
   * teardown. The consumer owns this call (typically as its own `ctx.effect`
   * disposer); the facility closes any domain left open when it unmounts.
   * @returns resolution after the unit is released.
   */
  close(): Promise<void>
}

/** Internal boundary handing table handles their domain-owned write machinery. */
interface TableHost {
  readonly domainName: string
  readonly unit: KvUnit
  /** Queue one job on the domain's single write chain. */
  enqueue<T>(job: () => Promise<T>): Promise<T>
  /** Throw `closed` once the domain has fully closed (reads stay valid while draining). */
  assertReadable(): void
  /** Emit `domain/changed` for one durably landed write. */
  emitChanged(change: DomainChanged): void
}

/** Validated records paired with the schema used for fresh persisted reads. */
export interface DomainTableData {
  /** Records parsed when the domain opened. */
  readonly records: Map<string, unknown>
  /** Schema of every record in this table. */
  readonly valueSchema: ZodType
}

const noop = () => {}

/**
 * The single domain implementation behind the {@link Domain} interface. The
 * facility constructs it from a validated `loadAll` snapshot and erases it to
 * `Domain<S>`; nothing outside this package constructs one.
 */
export class DomainImpl {
  /** Domain name from the spec. */
  readonly name: string

  private readonly tables = new Map<string, KvTableImpl<string, unknown>>()
  private globalValue: unknown
  private readonly globalHandle?: DomainGlobal<unknown>

  /** Tail of the write chain; every link settles (rejections are observed by the caller's slice). */
  private chain: Promise<void> = Promise.resolve()
  /** Set when close begins: new writes reject while already-queued writes drain. */
  private disposing = false
  /** Set when close finishes (chain drained, unit closed): reads reject from here on. */
  private closed = false
  private disposal?: Promise<void>

  /**
   * @param ctx - Context that carries `domain/changed` emissions.
   * @param spec - The domain declaration.
   * @param unit - The opened backend unit; this instance owns its lifecycle.
   * @param records - Validated records and their schemas, one entry
   * per declared table (empty maps included) — the facility builds it from
   * the spec, so the entry set IS the table set.
   * @param globalValue - Validated stored global, or the spec's `initial`
   * when the medium held none; `undefined` when the spec declares no global.
   * @param onClosed - Facility hook run once after teardown completes; frees
   * the domain name for a later open.
   */
  constructor(
    private readonly ctx: Context,
    spec: DomainSpec,
    private readonly unit: KvUnit,
    private readonly records: Map<string, DomainTableData>,
    globalValue: unknown,
    private readonly onClosed: () => void,
  ) {
    this.name = spec.name
    const host: TableHost = {
      domainName: spec.name,
      unit,
      enqueue: job => this.enqueue(job),
      assertReadable: () => { this.assertReadable() },
      emitChanged: (change) => { this.emitChanged(change) },
    }
    for (const [table, data] of records) {
      this.tables.set(table, new KvTableImpl(host, table, data.records, data.valueSchema))
    }
    if (spec.global !== undefined) {
      this.globalValue = globalValue
      this.globalHandle = {
        get: () => {
          this.assertReadable()
          return this.globalValue
        },
        set: value => this.enqueue(async () => {
          await this.unit.setGlobal(value)
          this.globalValue = value
          this.emitChanged({ domain: this.name, table: '', key: '', operation: 'put', value })
        }),
      }
    }
  }

  /** Global singleton handle; accessing it on a spec that declares no global is a caller bug and throws. */
  get global(): DomainGlobal<unknown> {
    if (this.globalHandle === undefined) {
      throw new Error(`domain '${this.name}' declares no global`)
    }
    return this.globalHandle
  }

  /**
   * Resolve one declared table handle; an undeclared name is a caller bug
   * and throws.
   * @param name - Declared table name.
   * @returns the stable table handle.
   */
  table(name: string): KvTable<string, unknown> {
    const table = this.tables.get(name)
    if (table === undefined) {
      throw new Error(`domain '${this.name}' declares no table '${name}'`)
    }
    return table
  }

  /**
   * Apply one synchronous multi-record command on the domain's write chain.
   * @param operation - Reads and writes records within the storage transaction.
   * @returns the callback result once records and caches are committed.
   */
  transaction<T>(operation: (tx: KvTransaction) => T): Promise<T> {
    return this.enqueue(async () => {
      if (!this.unit.transaction) throw new DomainError('atomic-modify-unsupported', `domain '${this.name}' requires transactions`)
      const changed = new Map<string, Map<string, unknown>>()
      const parse = (table: string, key: string, value: unknown) => {
        const schema = this.records.get(table)?.valueSchema
        if (!schema) throw new Error(`domain '${this.name}' declares no table '${table}'`)
        return value === undefined ? undefined : parseRecord(this.name, table, key, () => schema.parse(value))
      }
      const result = await this.unit.transaction(tx => operation({
        get: (table, key) => parse(table, key, tx.get(table, key)),
        entries: table => tx.entries(table).map(([key, value]) => [key, parse(table, key, value)]),
        set: (table, key, value) => {
          const parsed = parse(table, key, value)
          tx.set(table, key, parsed)
          let tableChanges = changed.get(table)
          if (!tableChanges) {
            tableChanges = new Map()
            changed.set(table, tableChanges)
          }
          tableChanges.set(key, parsed)
        },
      }))
      const events: DomainChanged[] = []
      for (const [table, writes] of changed) {
        const data = this.records.get(table)
        if (!data) throw new Error(`domain '${this.name}' lost table '${table}'`)
        for (const [key, value] of writes) {
          if (value === undefined) {
            data.records.delete(key)
            events.push({ domain: this.name, table, key, operation: 'deleted' })
          } else {
            data.records.set(key, value)
            events.push({ domain: this.name, table, key, operation: 'put', value })
          }
        }
      }
      for (const event of events) this.emitChanged(event)
      return result
    })
  }

  /**
   * Close this domain: reject new writes immediately, drain already-queued
   * writes (their events still emit), close the unit, then free the name via
   * the facility hook. Idempotent — repeated calls share one teardown.
   * @returns resolution after the unit is released.
   */
  close(): Promise<void> {
    this.disposal ??= this.runClose()
    return this.disposal
  }

  private async runClose(): Promise<void> {
    this.disposing = true
    // Chain links never reject (each is settled via then(noop, noop)), so
    // this await is a pure drain barrier.
    await this.chain
    await this.unit.close()
    this.closed = true
    this.onClosed()
  }

  /**
   * Dispatch one post-durability change notification, containing observer
   * failures: the write is already committed (medium and memory both hold
   * the new state), so a throwing listener must not retroactively reject it.
   */
  private emitChanged(change: DomainChanged): void {
    try {
      this.ctx.emit('domain/changed', change)
    } catch (error) {
      // Swallows synchronous observer exceptions only: emit dispatches
      // listeners inline and nothing else runs in the try. The event is a
      // notification, not a transaction participant — the commit point has
      // passed, so containment (with a log) is the only correct outcome.
      this.ctx.logger.warn(`domain '${this.name}': domain/changed listener failed: ${String(error)}`)
    }
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    if (this.disposing) {
      return Promise.reject(new DomainError('closed', `domain '${this.name}' is closed`))
    }
    const result = this.chain.then(job)
    this.chain = result.then(noop, noop)
    return result
  }

  private assertReadable(): void {
    if (this.closed) {
      throw new DomainError('closed', `domain '${this.name}' is closed`)
    }
  }
}

/** Table handle bound to one in-memory record map and its domain's write chain. */
class KvTableImpl<K extends string, V> implements KvTable<K, V> {
  constructor(
    private readonly host: TableHost,
    private readonly tableName: string,
    private readonly records: Map<string, unknown>,
    private readonly valueSchema: ZodType<V>,
  ) {}

  get(key: K): V | undefined {
    this.host.assertReadable()
    return this.records.get(key) as V | undefined
  }

  entries(): IterableIterator<[K, V]> {
    this.host.assertReadable()
    return ([...this.records.entries()] as [K, V][])[Symbol.iterator]()
  }

  keys(): IterableIterator<K> {
    this.host.assertReadable()
    return ([...this.records.keys()] as K[])[Symbol.iterator]()
  }

  get size(): number {
    this.host.assertReadable()
    return this.records.size
  }

  put(key: K, value: V): Promise<void> {
    return this.host.enqueue(async () => {
      await this.host.unit.putRecord(this.tableName, key, value)
      this.records.set(key, value)
      this.emitPut(key, value)
    })
  }

  delete(key: K): Promise<boolean> {
    return this.host.enqueue(async () => {
      // Existence is decided at this job's chain slot, not at call time: an
      // earlier queued put of the same key makes this delete observe it.
      if (!this.records.has(key)) return false
      await this.host.unit.deleteRecord(this.tableName, key)
      this.records.delete(key)
      this.host.emitChanged({
        domain: this.host.domainName,
        table: this.tableName,
        key,
        operation: 'deleted',
      })
      return true
    })
  }

  update(key: K, fn: (current: V) => V): Promise<V> {
    return this.host.enqueue(async () => {
      if (!this.records.has(key)) {
        throw new DomainError(
          'missing-key',
          `domain '${this.host.domainName}' table '${this.tableName}' has no record '${key}' to update`,
        )
      }
      const next = fn(this.records.get(key) as V)
      await this.host.unit.putRecord(this.tableName, key, next)
      this.records.set(key, next)
      this.emitPut(key, next)
      return next
    })
  }

  modify(key: K, fn: (current: V | undefined) => V | undefined): Promise<V | undefined> {
    return this.host.enqueue(async () => {
      const unit = this.host.unit
      if (unit.modifyRecord === undefined) {
        throw new DomainError('atomic-modify-unsupported', `domain '${this.host.domainName}' backend cannot modify records atomically`)
      }
      let existed = this.records.has(key)
      const next = await unit.modifyRecord(this.tableName, key, (raw) => {
        if (raw !== undefined) existed = true
        return fn(raw === undefined ? undefined : parseRecord(this.host.domainName, this.tableName, key, () => this.valueSchema.parse(raw)))
      }) as V | undefined
      if (next === undefined) {
        this.records.delete(key)
        if (existed) this.host.emitChanged({ domain: this.host.domainName, table: this.tableName, key, operation: 'deleted' })
      } else {
        this.records.set(key, next)
        this.emitPut(key, next)
      }
      return next
    })
  }

  private emitPut(key: K, value: V): void {
    this.host.emitChanged({
      domain: this.host.domainName,
      table: this.tableName,
      key,
      operation: 'put',
      value,
    })
  }
}
