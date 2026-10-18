import type {
  KindedRouteDefinition,
  Route,
  RouteDefinition,
  RouteKind,
  World,
} from './types'

/**
 * Creates the world: the route-defining context object. Its methods accept
 * `{ input?, handler, auth? }` and return routes. `query`, `mutation`, and
 * `subscription` set the route `kind`; `route` leaves it to you.
 */
export function world<TContext>(): World<TContext> {
  const make = <TInput, TOutput>(
    kind: RouteKind | undefined,
    definition: RouteDefinition<TInput, TOutput, TContext>,
  ): Route<TInput, TOutput, TContext> => ({ __node: 'route', ...definition, kind })

  return {
    route<TInput = undefined, TOutput = unknown>(
      definition: RouteDefinition<TInput, TOutput, TContext>,
    ): Route<TInput, TOutput, TContext> {
      return make(definition.kind, definition)
    },
    query<TInput = undefined, TOutput = unknown>(
      definition: KindedRouteDefinition<TInput, TOutput, TContext>,
    ): Route<TInput, TOutput, TContext> {
      return make('query', definition)
    },
    mutation<TInput = undefined, TOutput = unknown>(
      definition: KindedRouteDefinition<TInput, TOutput, TContext>,
    ): Route<TInput, TOutput, TContext> {
      return make('mutation', definition)
    },
    subscription<TInput = undefined, TOutput = unknown>(
      definition: KindedRouteDefinition<TInput, TOutput, TContext>,
    ): Route<TInput, TOutput, TContext> {
      return make('subscription', definition)
    },
  }
}
