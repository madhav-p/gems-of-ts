import { ModelDefinitionError, ModelParseError, type ParseResult } from './errors'
import type { AnyOfJsonSchema, JsonSchema } from './json-schema'

export const MODEL = Symbol('model')

/** The nominal brand shared by parsed object/list values. */
export type ModelBrand = { readonly [MODEL]: unknown }

/** Base class for parsed object values. */
export class Model {
  declare readonly [MODEL]: true
}

Object.defineProperty(Model.prototype, MODEL, { value: true })

/** Base class for parsed list values (arrays cannot also extend `Model`). */
export class ModelList extends Array<unknown> {
  declare readonly [MODEL]: true

  static override get [Symbol.species](): ArrayConstructor {
    return Array
  }
}

Object.defineProperty(ModelList.prototype, MODEL, { value: true })

/** Runtime check used by `mutate` to reject raw input. */
export function isParsed(value: unknown): value is ModelBrand {
  return value instanceof Model || value instanceof ModelList
}

/** A public construct signature — required for polymorphic `this` typing. */
export type Constructable = abstract new (...args: never[]) => object

/** The parsed type of a schema class. */
export type InferSchema<S> = S extends { parse(value: unknown): infer T } ? T : never

/**
 * The output of a schema value. For a concrete object/list class this uses
 * `InstanceType`, preserving subclass methods; for primitives it falls back to
 * `parse`'s return type.
 */
export type OutputOf<S> = S extends abstract new (...args: never[]) => infer I
  ? DeepReadonly<I>
  : S extends { parse(value: unknown): infer T }
    ? T
    : never

/** Recursively readonly view of a parsed value. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T

/** Recursively mutable view. */
export type DeepMutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlyArray<infer U>
    ? DeepMutable<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
      : T

/** Removes parsed-value brands recursively, retaining the shape. */
export type DeepUnbrand<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepUnbrand<U>>
    : T extends { readonly [MODEL]: unknown }
      ? { readonly [K in keyof Omit<T, typeof MODEL>]: DeepUnbrand<T[K]> }
      : T extends object
        ? { readonly [K in keyof T]: DeepUnbrand<T[K]> }
        : T

/** The mutable draft type used inside `mutate`. */
export type Draft<T> = DeepMutable<DeepUnbrand<T>>

/**
 * Freezes a parsed value recursively. Parsed object/list values are immutable
 * at runtime; use `mutate` to produce a new validated value.
 */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}

/** The implementation surface every schema supplies. */
export type SchemaImpl<T, J extends JsonSchema> = {
  parse(value: unknown): T
  safeParse(value: unknown): ParseResult<T>
  toJSONSchema(): J
}

/** The static surface shared by every schema class. */
export type SchemaClass<T, J extends JsonSchema = JsonSchema> = {
  parse(value: unknown): T
  safeParse(value: unknown): ParseResult<T>
  toJSONSchema(): J
  readonly isOptional: boolean
  readonly hasDefault?: boolean
  optional(): OptionalSchema<T, J>
  nullable(): NullableSchema<T, J>
  default(value: T): DefaultSchema<T, J>
}

/** A schema class that requires a value. */
export type RequiredSchemaClass<
  T,
  J extends JsonSchema = JsonSchema,
> = SchemaClass<T, J> & {
  readonly isOptional: false
}

/** A schema class produced by `.optional()`. */
export type OptionalSchema<
  T,
  J extends JsonSchema = JsonSchema,
> = SchemaClass<T | undefined, J> & {
  readonly isOptional: true
  readonly inner: RequiredSchemaClass<T, J>
}

/** A schema class produced by `.nullable()`. */
export type NullableSchema<
  T,
  J extends JsonSchema = JsonSchema,
> = RequiredSchemaClass<T | null, AnyOfJsonSchema> & {
  readonly inner: RequiredSchemaClass<T, J>
}

/** A schema class produced by `.default(value)`. */
export type DefaultSchema<
  T,
  J extends JsonSchema = JsonSchema,
> = RequiredSchemaClass<T, J> & {
  readonly hasDefault: true
  readonly defaultValue: T
  readonly inner: RequiredSchemaClass<T, J>
}

/** Wraps a required schema class so `undefined` short-circuits successfully. */
export function makeOptional<T, J extends JsonSchema>(
  base: RequiredSchemaClass<T, J>,
): OptionalSchema<T, J> {
  class Optional {
    static readonly isOptional = true as const
    static readonly inner = base

    static parse(value: unknown): T | undefined {
      return value === undefined ? undefined : base.parse(value)
    }

    static safeParse(value: unknown): ParseResult<T | undefined> {
      return value === undefined ? { success: true, data: undefined } : base.safeParse(value)
    }

    static toJSONSchema(): J {
      return base.toJSONSchema()
    }

    static optional(): OptionalSchema<T, J> {
      return Optional as unknown as OptionalSchema<T, J>
    }

    static nullable(): NullableSchema<T | undefined, J> {
      return makeNullable(Optional as unknown as RequiredSchemaClass<T | undefined, J>)
    }

    static default(value: T | undefined): DefaultSchema<T | undefined, J> {
      return makeDefault(
        Optional as unknown as RequiredSchemaClass<T | undefined, J>,
        value,
      )
    }
  }

  return Optional as unknown as OptionalSchema<T, J>
}

/** Wraps a required schema so `null` is accepted unchanged. */
export function makeNullable<T, J extends JsonSchema>(
  base: RequiredSchemaClass<T, J>,
): NullableSchema<T, J> {
  class Nullable {
    static readonly isOptional = false as const
    static readonly hasDefault = base.hasDefault
    static readonly defaultValue = (
      base as { readonly defaultValue?: unknown }
    ).defaultValue
    static readonly inner = base

    static parse(value: unknown): T | null {
      return value === null ? null : base.parse(value)
    }

    static safeParse(value: unknown): ParseResult<T | null> {
      return value === null ? { success: true, data: null } : base.safeParse(value)
    }

    static toJSONSchema(): AnyOfJsonSchema {
      return { anyOf: [base.toJSONSchema(), { type: 'null' }] }
    }

    static optional(): OptionalSchema<T | null, AnyOfJsonSchema> {
      return makeOptional(
        Nullable as unknown as RequiredSchemaClass<T | null, AnyOfJsonSchema>,
      )
    }

    static nullable(): NullableSchema<T, J> {
      return Nullable as unknown as NullableSchema<T, J>
    }

    static default(value: T | null): DefaultSchema<T | null, AnyOfJsonSchema> {
      return makeDefault(
        Nullable as unknown as RequiredSchemaClass<T | null, AnyOfJsonSchema>,
        value,
      )
    }
  }

  return Nullable as unknown as NullableSchema<T, J>
}

/** Wraps a required schema so `undefined` becomes a validated default. */
export function makeDefault<T, J extends JsonSchema>(
  base: RequiredSchemaClass<T, J>,
  value: T,
): DefaultSchema<T, J> {
  let defaultValue: T
  try {
    defaultValue = base.parse(value) as T
  } catch (error) {
    if (error instanceof ModelParseError) {
      throw new ModelDefinitionError(`Invalid default: ${error.message}`)
    }
    throw error
  }

  class Default {
    static readonly isOptional = false as const
    static readonly hasDefault = true as const
    static readonly defaultValue = defaultValue
    static readonly inner = base

    static parse(value: unknown): T {
      return value === undefined ? defaultValue : base.parse(value)
    }

    static safeParse(value: unknown): ParseResult<T> {
      return value === undefined
        ? { success: true, data: defaultValue }
        : base.safeParse(value)
    }

    static toJSONSchema(): J {
      return { ...base.toJSONSchema(), default: defaultValue } as J
    }

    static optional(): OptionalSchema<T, J> {
      return makeOptional(Default as unknown as RequiredSchemaClass<T, J>)
    }

    static nullable(): NullableSchema<T, J> {
      return makeNullable(Default as unknown as RequiredSchemaClass<T, J>)
    }

    static default(value: T): DefaultSchema<T, J> {
      return makeDefault(base, value)
    }
  }

  return Default as unknown as DefaultSchema<T, J>
}

/**
 * Builds a schema class, wiring up `isOptional` and the `.optional()` modifier.
 * Every primitive goes through this, so optional is a method chain on every
 * type.
 */
export function buildSchema<
  T,
  J extends JsonSchema,
  E extends object = {},
>(
  impl: SchemaImpl<T, J>,
  extras?: E,
): RequiredSchemaClass<T, J> & E {
  class Schema {
    static readonly isOptional = false as const

    static parse(value: unknown): T {
      return impl.parse(value)
    }

    static safeParse(value: unknown): ParseResult<T> {
      return impl.safeParse(value)
    }

    static toJSONSchema(): J {
      return impl.toJSONSchema()
    }

    static optional(): OptionalSchema<T, J> {
      return makeOptional(Schema as unknown as RequiredSchemaClass<T, J>)
    }

    static nullable(): NullableSchema<T, J> {
      return makeNullable(Schema as unknown as RequiredSchemaClass<T, J>)
    }

    static default(value: T): DefaultSchema<T, J> {
      return makeDefault(Schema as unknown as RequiredSchemaClass<T, J>, value)
    }
  }

  return Object.assign(Schema, extras) as RequiredSchemaClass<T, J> & E
}
