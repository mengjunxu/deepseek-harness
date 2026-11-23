/** Hold a single prompt before it reaches the real SDK transport. */
import { existsSync, writeFileSync } from 'node:fs'

export function apply(ctx, config) {
  const input = process.stdin
  const emit = input.emit
  ctx.effect(() => {
    input.emit = function (name, data, ...args) {
      if (name === 'data' && existsSync(config.arm) && data.toString().includes('"method":"session/prompt"')) {
        writeFileSync(config.marker, 'prompt withheld', { flag: 'wx' })
        return true
      }
      return emit.call(this, name, data, ...args)
    }
    return () => { input.emit = emit }
  })
}
