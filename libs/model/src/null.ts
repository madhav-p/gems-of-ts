import { ModelParseError, safeParseWith, typeName } from './errors'
import type { NullJsonSchema } from './json-schema'
import { buildSchema, type RequiredSchemaClass } from './schema'

export type NullSchema = RequiredSchemaClass<null, NullJsonSchema>

function parseNull(value: unknown): null {
  if (value !== null) {
    throw new ModelParseError([
      { path: [], message: `Expected null, received ${typeName(value)}` },
    ])
  }
  return null
}

/**
 * A schema that accepts only `null`.
 *
 * `null` is a reserved word, so the direct export is {@link nullType}. The
 * namespaced form is `model.null()`.
 */
export function nullType(): NullSchema {
  return buildSchema({
    parse: parseNull,
    safeParse: (value) => safeParseWith(parseNull, value),
    toJSONSchema: () => ({ type: 'null' }),
  })
}
