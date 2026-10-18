import type { Marked, Router } from '../server/types'
import type { RouterClient } from './types'

/** Sends a route call somewhere — HTTP, Convex, an in-process caller, etc. */
export type RouterLink = (path: string[], input: unknown) => Promise<unknown>

export type ClientOptions = {
  link: RouterLink
}

function buildClient(link: RouterLink, path: string[]): unknown {
  return new Proxy(() => undefined, {
    get(_target, property) {
      if (typeof property !== 'string') {
        return undefined
      }
      return buildClient(link, [...path, property])
    },
    apply(_target, _thisArg, args: unknown[]) {
      return link(path, args[0])
    },
  })
}

/**
 * Creates a typed client for a router. Nesting is mirrored: `client.posts.list(input)`
 * calls the `posts.list` route through the link.
 */
export function createClient<TRouter extends Router<Record<string, Marked>>>(
  options: ClientOptions,
): RouterClient<TRouter['routes']> {
  return buildClient(options.link, []) as RouterClient<TRouter['routes']>
}
