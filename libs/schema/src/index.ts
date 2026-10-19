export { SchemaParseError } from './schema'
export type {
  Branded,
  Constructable,
  FormatBrand,
  OptionalSchema,
  OutputOfShape,
  ParseResult,
  SchemaClass,
  SchemaIssue,
} from './schema'

export type {
  ArrayJsonSchema,
  BooleanJsonSchema,
  JsonSchema,
  NumberJsonSchema,
  ObjectJsonSchema,
  StringJsonSchema,
} from './json-schema'

export type { BooleanSchema } from './boolean'
export type { ArraySchema } from './array'
export type { ObjectSchema } from './object'

export { createFormatRegistry } from './formats'
export type {
  FormatConfig,
  FormatRegistry,
  NumberFormatSpec,
  StringFormatSpec,
} from './formats'

export { createString } from './string'
export type {
  StringDef,
  StringFactory,
  StringRefinement,
  StringSchema,
  StringView,
} from './string'

export { createNumber } from './number'
export type { NumberDef, NumberFactory, NumberSchema, NumberView } from './number'

export { literal } from './literal'
export type { LiteralSchema, LiteralValue } from './literal'

import { array } from './array'
import { boolean } from './boolean'
import { createFormatRegistry, type FormatConfig } from './formats'
import { literal } from './literal'
import { createNumber, type NumberFactory } from './number'
import { object } from './object'
import { createString, type StringFactory } from './string'

export type SchemaBuilderConfig = FormatConfig

/**
 * The set of constructors a builder exposes. Create one with
 * {@link createSchemaBuilder}, passing any extra formats up front.
 */
export type SchemaBuilder = {
  object: typeof object
  array: typeof array
  boolean: typeof boolean
  string: StringFactory
  number: NumberFactory
  literal: typeof literal
}

/**
 * Creates a schema builder. Built-in formats (`email`, `url`, `int`) are always
 * available; pass `stringFormats` / `numberFormats` to add or override formats.
 * Registries are fixed at creation time and scoped to the builder, so formats
 * never leak between builders.
 *
 * ```ts
 * const t = createSchemaBuilder({
 *   stringFormats: { ip: { validate: (v) => (isIPv4(v) ? undefined : 'Expected an IP') } },
 * })
 *
 * class Device extends t.object({ address: t.string((s) => s.format('ip')) }) {}
 * ```
 */
export function createSchemaBuilder(config: SchemaBuilderConfig = {}): SchemaBuilder {
  const formats = createFormatRegistry(config)
  return {
    object,
    array,
    boolean,
    string: createString(formats),
    number: createNumber(formats),
    literal,
  }
}
