import { createSchemaBuilder } from '@gems-of-ts/schema'
import { describe, expect, it } from 'vitest'
import { createClient } from '../src/client'
import { RouterError, createCaller, router, world } from '../src/server'

const { number, object, string } = createSchemaBuilder()

type AppContext = { userId: string | null }

const app = world<AppContext>()

const appRouter = router({
  health: app.query({
    handler: () => ({ ok: true }),
  }),
  getUser: app.query({
    input: object({ id: string((sv) => sv.length((nv) => nv.min(1))) }),
    auth: (ctx) => ctx.userId !== null,
    handler: ({ input, ctx }) => ({ id: input.id, requestedBy: ctx.userId }),
  }),
  createUser: app.mutation({
    input: object({ name: string((sv) => sv.length((nv) => nv.min(1))) }),
    handler: ({ input }) => ({ id: input.name.toLowerCase() }),
  }),
  onUser: app.route({
    kind: 'subscription',
    handler: () => 'subscribed',
  }),
  posts: router({
    list: app.query({
      input: object({ limit: number((nv) => nv.format('int').min(0)).optional() }),
      handler: ({ input }) => ({ limit: input.limit ?? 10 }),
    }),
  }),
})

describe('route kinds', () => {
  it('sets kind via query and mutation, and allows it manually via route', () => {
    expect(appRouter.routes.health.kind).toBe('query')
    expect(appRouter.routes.getUser.kind).toBe('query')
    expect(appRouter.routes.createUser.kind).toBe('mutation')
    expect(appRouter.routes.onUser.kind).toBe('subscription')
    expect(appRouter.routes.posts.routes.list.kind).toBe('query')
  })
})

describe('createCaller', () => {
  it('runs handlers with parsed input and the context', async () => {
    const caller = createCaller(appRouter, { userId: 'u1' })
    await expect(caller.health()).resolves.toEqual({ ok: true })
    await expect(caller.getUser({ id: 'a' })).resolves.toEqual({ id: 'a', requestedBy: 'u1' })
    await expect(caller.createUser({ name: 'Ada' })).resolves.toEqual({ id: 'ada' })
    await expect(caller.posts.list({ limit: 5 })).resolves.toEqual({ limit: 5 })
  })

  it('parses input through the schema', async () => {
    const caller = createCaller(appRouter, { userId: 'u1' })
    await expect(caller.getUser({ id: '' })).rejects.toThrow()
  })

  it('enforces the auth predicate', async () => {
    const caller = createCaller(appRouter, { userId: null })
    await expect(caller.getUser({ id: 'a' })).rejects.toBeInstanceOf(RouterError)
    await expect(caller.health()).resolves.toEqual({ ok: true })
  })
})

describe('client', () => {
  function linkFrom(
    caller: Record<string, unknown>,
  ): (path: string[], input: unknown) => Promise<unknown> {
    return async (path, input) => {
      let node: unknown = caller
      for (const segment of path) {
        node = (node as Record<string, unknown>)[segment]
      }
      return (node as (input: unknown) => Promise<unknown>)(input)
    }
  }

  it('forwards through the link, mirroring nesting', async () => {
    const serverCaller = createCaller(appRouter, { userId: 'u1' })
    const client = createClient<typeof appRouter>({ link: linkFrom(serverCaller) })

    await expect(client.health()).resolves.toEqual({ ok: true })
    await expect(client.getUser({ id: 'a' })).resolves.toEqual({ id: 'a', requestedBy: 'u1' })
    await expect(client.posts.list({ limit: 2 })).resolves.toEqual({ limit: 2 })
  })
})
