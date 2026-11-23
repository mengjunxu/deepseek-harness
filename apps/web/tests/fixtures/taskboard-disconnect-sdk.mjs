/** Close the SDK stream after committing a turn whose ending the Host did not receive. */
export const inject = ['sessionPersistence']

export function apply(ctx) {
  const output = process.stdout
  const write = output.write
  let disconnected = false
  ctx.effect(() => {
    output.write = function (chunk, ...args) {
      if (disconnected) return true
      if (typeof chunk === 'string' && chunk.startsWith('{"jsonrpc":"2.0","method":"session.event"')) {
        const { params } = JSON.parse(chunk)
        if (params.event.type === 'turn/end') {
          disconnected = true
          setImmediate(async () => {
            await ctx.sessionPersistence.flush()
            process.exit(78)
          })
          return true
        }
      }
      return write.call(this, chunk, ...args)
    }
    return () => { output.write = write }
  })
}
