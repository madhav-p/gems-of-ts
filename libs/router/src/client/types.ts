import type { RouteCall } from '../server/types'

export type { RouteCall }

export type RouterClient<TRoutes> = {
  [K in keyof TRoutes]: RouterClientNode<TRoutes[K]>
}

export type RouterClientNode<T> = T extends {
  readonly __node: 'router'
  readonly routes: infer R
}
  ? RouterClient<R>
  : T extends { readonly __types?: { input: infer I; output: infer O } }
    ? RouteCall<I, O>
    : never
