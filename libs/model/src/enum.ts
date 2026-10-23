import { ModelDefinitionError, ModelParseError, safeParseWith } from './errors'
import type { EnumJsonSchema, LiteralValue } from './json-schema'
import { buildSchema, type RequiredSchemaClass } from './schema'

export type EnumSchema<T extends LiteralValue = LiteralValue> = RequiredSchemaClass<
  T,
  EnumJsonSchema
>

function assertValues(values: readonly LiteralValue[]): void {
  if (values.length === 0) {
    throw new ModelDefinitionError('Invalid enum model: at least one value is required')
  }

  const seen = new Set<string>()
  for (const value of values) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new ModelDefinitionError('Invalid enum model: numbers must be finite')
    }
    const key = `${typeof value}:${String(value)}`
    if (seen.has(key)) {
      throw new ModelDefinitionError(
        `Invalid enum model: duplicate value ${JSON.stringify(value)}`,
      )
    }
    seen.add(key)
  }
}

function describe(values: readonly LiteralValue[]): string {
  return values.map((value) => JSON.stringify(value)).join(', ')
}

/**
 * Creates a schema that accepts one of the given literal values. `enum` is a
 * reserved word, so the direct export is `enumType`; the namespaced form is
 * `model.enum(...)`.
 *
 * ```ts
 * enumType(['admin', 'user'] as const)
 * ```
 */
export function enumType<const V extends readonly [LiteralValue, ...LiteralValue[]]>(
  values: V,
): EnumSchema<V[number]> {
  assertValues(values)

  return buildSchema({
    parse: (input) => {
      if (!values.some((value) => Object.is(value, input))) {
        throw new ModelParseError([
          { path: [], message: `Expected one of ${describe(values)}` },
        ])
      }
      return input as V[number]
    },
    safeParse: (input) =>
      safeParseWith((value) => {
        if (!values.some((candidate) => Object.is(candidate, value))) {
          throw new ModelParseError([
            { path: [], message: `Expected one of ${describe(values)}` },
          ])
        }
        return value as V[number]
      }, input),
    toJSONSchema: () => ({ enum: [...values] }),
  })
}
