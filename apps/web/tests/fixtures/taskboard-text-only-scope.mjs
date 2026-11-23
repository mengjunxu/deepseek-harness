/** The loopback model in this probe returns only text and starts no tools. */
export const inject = ['taskboardController']

export function apply(ctx) {
  const stops = ctx.taskboardController.stops
  const attach = stops.attach
  ctx.effect(() => {
    stops.attach = (owner, client) => attach.call(stops, owner, client, () => Promise.resolve({
      state: 'empty', source: 'text-only loopback model fixture',
    }))
    return () => { stops.attach = attach }
  })
}
