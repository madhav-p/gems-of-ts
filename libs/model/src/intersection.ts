import {
  ModelDefinitionError,
  ModelParseError,
  safeParseWith,
  type Issue,
} from './errors'
import type { AllOfJsonSchema, JsonSchema } from './json-schema'
import {
  buildSchema,
  deepFreeze,
  type DeepUnbrand,
  type InferSchema,
  type RequiredSchemaClass,
} from './schema'

export type IntersectionElement = RequiredSchemaClass<unknown, JsonSchema>

type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never

export type IntersectionOutput<S extends readonly IntersectionElement[]> =
  DeepUnbrand<UnionToIntersection<InferSchema<S[number]>>>

export type IntersectionSchema<S extends readonly IntersectionElement[]> =
  RequiredSchemaClass<IntersectionOutput<S>, AllOfJsonSchema> & {
    readonly items: S
  }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeResults(results: readonly unknown[]): unknown {
  const first = results[0]
  if (
    first !== undefined &&
    isObject(first) &&
    results.every(isObject)
  ) {
    const output: Record<string, unknown> = {}
    for (const result of results) {
      if (!isObject(result)) {
        continue
      }
      for (const key of Object.keys(result)) {
        output[key] = result[key]
      }
    }
    return deepFreeze(output)
  }
  return first
}

function parseIntersection<S extends readonly IntersectionElement[]>(
  schemas: S,
  value: unknown,
): IntersectionOutput<S> {
  const results: unknown[] = []
  const issues: Issue[] = []

  for (const schema of schemas) {
    try {
      results.push(schema.parse(value))
    } catch (error) {
      if (error instanceof ModelParseError) {
        issues.push(...error.issues)
      } else {
        throw error
      }
    }
  }

  if (issues.length > 0) {
    throw new ModelParseError(issues)
  }
  return mergeResults(results) as IntersectionOutput<S>
}

/**
 * Creates an intersection (`allOf`) of one or more schemas. Object results are
 * merged into a plain readonly object.
 *
 * ```ts
 * const Named = object({ name: string() })
 * const Aged = object({ age: number() })
 * const Person = intersection([Named, Aged])
 * ```
 */
export function intersection<
  const S extends readonly [IntersectionElement, ...IntersectionElement[]],
>(items: S): IntersectionSchema<S> {
  const schemas = items
  if (schemas.length === 0) {
    throw new ModelDefinitionError(
      'Invalid intersection model: at least one schema is required',
    )
  }

  return buildSchema(
    {
      parse: (value) => parseIntersection(schemas, value),
      safeParse: (value) =>
        safeParseWith((input) => parseIntersection(schemas, input), value),
      toJSONSchema: () => ({
        allOf: schemas.map((schema) => schema.toJSONSchema()),
      }),
    },
    { items: schemas },
  ) as unknown as IntersectionSchema<S>
}
