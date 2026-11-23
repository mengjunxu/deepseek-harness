/** Drop a single accepted SDK prompt reply while retaining its real Session notifications. */
import { writeFileSync } from 'node:fs'

export function apply(ctx, config) {
  const output = process.stdout
  const write = output.write
  let dropped = false
  ctx.effect(() => {
    output.write = function (chunk, ...args) {
      if (!dropped && typeof chunk === 'string' && chunk.startsWith('{"jsonrpc":"2.0","id":')) {
        const { result } = JSON.parse(chunk)
        if (typeof result?.messageId === 'string') {
          dropped = true
          try {
            writeFileSync(config.marker, result.messageId, { flag: 'wx' })
            return true
          } catch (error) {
            if (error.code !== 'EEXIST') throw error
          }
        }
      }
      return write.call(this, chunk, ...args)
    }
    return () => { output.write = write }
  })
}
