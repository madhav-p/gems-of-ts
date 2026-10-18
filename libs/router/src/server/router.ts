import type { Marked, Router } from './types'

/**
 * A router is just a function that accepts an object of routes and/or nested
 * routers.
 */
export function router<TRoutes extends Record<string, Marked>>(routes: TRoutes): Router<TRoutes> {
  return { __node: 'router', routes }
}
