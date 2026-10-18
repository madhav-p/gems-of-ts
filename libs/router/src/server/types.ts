import type { SchemaClass } from '@gems-of-ts/schema'

export type MaybePromise<T> = T | Promise<T>

export type RouteKind = 'query' | 'mutation' | 'subscription'

/**
 * The object accepted by the world's route methods: an optional `input` schema
 * (from `@gems-of-ts/schema`), an optional `auth` predicate, the `handler`, and
 * an optional `kind` (set automatically by `query`/`mutation`/`subscription`).
 */
export type RouteDefinition<TInput, TOutput, TContext> = {
  kind?: RouteKind
  input?: SchemaClass<TInput>
  auth?: (context: TContext) => MaybePromise<boolean>
  handler: (args: { input: TInput; ctx: TContext }) => MaybePromise<TOutput>
}

export type KindedRouteDefinition<TInput, TOutput, TContext> = Omit<
  RouteDefinition<TInput, TOutput, TContext>,
  'kind'
>

/**
 * A route. `__node` distinguishes routes from routers; `__types` is a phantom
 * that carries the input/output types to the client. Neither is user-facing.
 */
export type Route<TInput = undefined, TOutput = unknown, TContext = unknown> = {
  readonly __node: 'route'
  readonly kind?: RouteKind
  readonly input?: SchemaClass<TInput>
  readonly auth?: (context: TContext) => MaybePromise<boolean>
  readonly handler: (args: { input: TInput; ctx: TContext }) => MaybePromise<TOutput>
  readonly __types?: { input: TInput; output: TOutput }
}

/**
 * The route-defining context object. Distinct from the per-request context that
 * route handlers receive (`ctx`).
 */
export type World<TContext> = {
  route<TInput = undefined, TOutput = unknown>(
    definition: RouteDefinition<TInput, TOutput, TContext>,
  ): Route<TInput, TOutput, TContext>
  query<TInput = undefined, TOutput = unknown>(
    definition: KindedRouteDefinition<TInput, TOutput, TContext>,
  ): Route<TInput, TOutput, TContext>
  mutation<TInput = undefined, TOutput = unknown>(
    definition: KindedRouteDefinition<TInput, TOutput, TContext>,
  ): Route<TInput, TOutput, TContext>
  subscription<TInput = undefined, TOutput = unknown>(
    definition: KindedRouteDefinition<TInput, TOutput, TContext>,
  ): Route<TInput, TOutput, TContext>
}

export type Marked = { readonly __node: 'route' | 'router' }

export type Router<TRoutes extends Record<string, Marked> = Record<string, Marked>> = {
  readonly __node: 'router'
  readonly routes: TRoutes
}

export type RouteCall<I, O> = [I] extends [undefined]
  ? (input?: undefined) => Promise<O>
  : (input: I) => Promise<O>

export type CallerNode<T> = T extends { readonly __node: 'router'; readonly routes: infer R }
  ? Caller<R>
  : T extends { readonly __types?: { input: infer I; output: infer O } }
    ? RouteCall<I, O>
    : never

export type Caller<TRoutes> = {
  [K in keyof TRoutes]: CallerNode<TRoutes[K]>
}
