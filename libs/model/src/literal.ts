import { ModelDefinitionError, ModelParseError, safeParseWith } from './errors'
import type { LiteralJsonSchema, LiteralValue } from './json-schema'
import { buildSchema, type RequiredSchemaClass } from './schema'

export type LiteralSchema<T extends LiteralValue = LiteralValue> = RequiredSchemaClass<
  T,
  LiteralJsonSchema
>

function assertLiteral(value: LiteralValue): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new ModelDefinitionError('Invalid literal model: numbers must be finite')
  }
}

function parseLiteral<T extends LiteralValue>(expected: T, value: unknown): T {
  if (!Object.is(value, expected)) {
    throw new ModelParseError([
      { path: [], message: `Expected ${JSON.stringify(expected)}` },
    ])
  }
  return expected
}

/**
 * Creates a schema that accepts exactly one literal value.
 *
 * ```ts
 * literal('admin') // 'admin'
 * literal(42)      // 42
 * literal(null)    // null
 * ```
 */
export function literal<const T extends LiteralValue>(value: T): LiteralSchema<T> {
  assertLiteral(value)

  return buildSchema({
    parse: (input) => parseLiteral(value, input),
    safeParse: (input) => safeParseWith((v) => parseLiteral(value, v), input),
    toJSONSchema: () => ({ const: value }),
  })
}
