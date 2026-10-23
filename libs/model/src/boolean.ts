import { ModelParseError, safeParseWith, typeName } from './errors'
import type { BooleanJsonSchema } from './json-schema'
import { buildSchema, type RequiredSchemaClass } from './schema'

export type BooleanSchema = RequiredSchemaClass<boolean, BooleanJsonSchema>

function parseBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new ModelParseError([
      { path: [], message: `Expected boolean, received ${typeName(value)}` },
    ])
  }
  return value
}

/** A schema that accepts only `true` or `false`. */
export function boolean(): BooleanSchema {
  return buildSchema({
    parse: parseBoolean,
    safeParse: (value) => safeParseWith(parseBoolean, value),
    toJSONSchema: () => ({ type: 'boolean' }),
  })
}
