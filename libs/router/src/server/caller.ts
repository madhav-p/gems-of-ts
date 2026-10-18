import { RouterError } from './errors'
import type { Caller, Marked, MaybePromise, Router } from './types'

type RuntimeRoute = {
  __node: 'route'
  kind?: string
  input?: { parse(value: unknown): unknown }
  auth?: (context: unknown) => MaybePromise<boolean>
  handler: (args: { input: unknown; ctx: unknown }) => MaybePromise<unknown>
}

type RuntimeRouter = {
  __node: 'router'
  routes: Record<string, RuntimeRoute | RuntimeRouter>
}

function callRoute(
  route: RuntimeRoute,
  context: unknown,
  path: string[],
): (input: unknown) => Promise<unknown> {
  return async (input: unknown) => {
    const parsed = route.input ? route.input.parse(input) : input
    if (route.auth) {
      const allowed = await route.auth(context)
      if (!allowed) {
        throw new RouterError('UNAUTHORIZED', `Not authorized: ${path.join('.') || '(root)'}`)
      }
    }
    return route.handler({ input: parsed, ctx: context })
  }
}

function build(node: RuntimeRoute | RuntimeRouter, context: unknown, path: string[]): unknown {
  if (node.__node === 'router') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(node.routes)) {
      out[key] = build(child, context, [...path, key])
    }
    return out
  }
  return callRoute(node, context, path)
}

/**
 * Builds a typed, in-process caller for a router. Handlers receive the parsed
 * input and the given context; `auth` is checked first.
 */
export function createCaller<TRoutes extends Record<string, Marked>, TContext>(
  root: Router<TRoutes>,
  context: TContext,
): Caller<TRoutes> {
  return build(root as unknown as RuntimeRouter, context, []) as Caller<TRoutes>
}
