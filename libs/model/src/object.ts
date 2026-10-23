import {
  ModelDefinitionError,
  ModelParseError,
  typeName,
  type Issue,
  type ParseResult,
} from './errors'
import type { JsonSchema, ObjectJsonSchema } from './json-schema'
import {
  deepFreeze,
  makeDefault,
  makeNullable,
  makeOptional,
  Model,
  type Constructable,
  type DeepReadonly,
  type DefaultSchema,
  type InferSchema,
  type ModelBrand,
  type NullableSchema,
  type OptionalSchema,
  type RequiredSchemaClass,
  type SchemaClass,
} from './schema'

export type ObjectShape = Record<string, SchemaClass<unknown, JsonSchema>>

/** Reserved for object-level validations. */
export type ObjectOptions = Record<string, never>

/** The parsed shape: optional fields become optional keys. */
export type InferShape<S extends ObjectShape> = {
  [K in keyof S as S[K] extends { readonly isOptional: true } ? never : K]: InferSchema<
    S[K]
  >
} & {
  [K in keyof S as S[K] extends { readonly isOptional: true } ? K : never]?: InferSchema<
    S[K]
  >
}

export type ReadonlyShape<S extends ObjectShape> = DeepReadonly<InferShape<S>> & ModelBrand

type OptionalField<F> = F extends { optional(): infer O } ? O : never
type RequiredField<F> = F extends {
  readonly isOptional: true
  readonly inner: infer R
}
  ? R
  : F

export type PartialShape<S extends ObjectShape> = {
  [K in keyof S]: OptionalField<S[K]>
}

export type RequiredShape<S extends ObjectShape> = {
  [K in keyof S]: RequiredField<S[K]>
}

export type PickShape<S extends ObjectShape, K extends keyof S> = {
  [P in K]: S[P]
}

export type OmitShape<S extends ObjectShape, K extends keyof S> = {
  [P in Exclude<keyof S, K>]: S[P]
}

export type MergeShape<A extends ObjectShape, B extends ObjectShape> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? B[K]
    : K extends keyof A
      ? A[K]
      : never
}

export type ObjectSchema<S extends ObjectShape> = {
  new (value: unknown): ReadonlyShape<S>
  parse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): DeepReadonly<InstanceType<This>> & ModelBrand
    (value: unknown): ReadonlyShape<S>
  }
  safeParse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): ParseResult<DeepReadonly<InstanceType<This>> & ModelBrand>
    (value: unknown): ParseResult<ReadonlyShape<S>>
  }
  toJSONSchema(): ObjectJsonSchema
  readonly isOptional: false
  optional(): OptionalSchema<ReadonlyShape<S>, ObjectJsonSchema>
  nullable(): NullableSchema<ReadonlyShape<S>, ObjectJsonSchema>
  default(value: ReadonlyShape<S>): DefaultSchema<ReadonlyShape<S>, ObjectJsonSchema>
  readonly options: Readonly<ObjectOptions>
  readonly fields: S
  pick<const K extends keyof S>(keys: readonly K[]): ObjectSchema<PickShape<S, K>>
  omit<const K extends keyof S>(keys: readonly K[]): ObjectSchema<OmitShape<S, K>>
  partial(): ObjectSchema<PartialShape<S>>
  required(): ObjectSchema<RequiredShape<S>>
  merge<U extends ObjectShape>(other: ObjectSchema<U>): ObjectSchema<MergeShape<S, U>>
}

function parseObject<S extends ObjectShape>(
  fields: S,
  value: unknown,
): InferShape<S> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ModelParseError([
      { path: [], message: `Expected object, received ${typeName(value)}` },
    ])
  }

  const input = value as Record<string, unknown>
  const issues: Issue[] = []
  const output: Record<string, unknown> = {}

  for (const key of Object.keys(fields)) {
    const field = fields[key]!
    const raw = input[key]

    if (raw === undefined) {
      if (field.hasDefault) {
        output[key] = field.parse(undefined)
        continue
      }
      if (field.isOptional) {
        continue
      }
    }

    try {
      output[key] = field.parse(raw)
    } catch (error) {
      if (error instanceof ModelParseError) {
        for (const issue of error.issues) {
          issues.push({ path: [key, ...issue.path], message: issue.message })
        }
      } else {
        throw error
      }
    }
  }

  if (issues.length > 0) {
    throw new ModelParseError(issues)
  }
  return output as InferShape<S>
}

function assertKnownKeys(
  fields: ObjectShape,
  keys: readonly string[],
  operation: string,
): void {
  for (const key of keys) {
    if (!(key in fields)) {
      throw new ModelDefinitionError(
        `Cannot ${operation} unknown field "${key}"`,
      )
    }
  }
}

function pickShape(fields: ObjectShape, keys: readonly string[]): ObjectShape {
  assertKnownKeys(fields, keys, 'pick')
  const picked: Record<string, SchemaClass<unknown, JsonSchema>> = {}
  for (const key of Object.keys(fields)) {
    if (keys.includes(key)) {
      picked[key] = fields[key]!
    }
  }
  return picked
}

function omitShape(fields: ObjectShape, keys: readonly string[]): ObjectShape {
  assertKnownKeys(fields, keys, 'omit')
  const omitted: Record<string, SchemaClass<unknown, JsonSchema>> = {}
  for (const key of Object.keys(fields)) {
    if (!keys.includes(key)) {
      omitted[key] = fields[key]!
    }
  }
  return omitted
}

function partialShape(fields: ObjectShape): ObjectShape {
  const partial: Record<string, SchemaClass<unknown, JsonSchema>> = {}
  for (const key of Object.keys(fields)) {
    partial[key] = fields[key]!.optional()
  }
  return partial
}

function requiredShape(fields: ObjectShape): ObjectShape {
  const required: Record<string, SchemaClass<unknown, JsonSchema>> = {}
  for (const key of Object.keys(fields)) {
    const field = fields[key]!
    required[key] =
      field.isOptional && 'inner' in field
        ? (field as OptionalSchema<unknown, JsonSchema>).inner
        : field
  }
  return required
}

function objectJSONSchema<S extends ObjectShape>(fields: S): ObjectJsonSchema {
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []

  for (const key of Object.keys(fields)) {
    const field = fields[key]!
    properties[key] = field.toJSONSchema()
    if (!field.isOptional && !field.hasDefault) {
      required.push(key)
    }
  }

  return { type: 'object', properties, required, additionalProperties: false }
}

/**
 * Creates an object schema class from a shape of field schemas.
 *
 * ```ts
 * const User = object({
 *   name: string({ length: { min: 1 } }),
 *   age: number({ min: 0 }).optional(),
 * })
 *
 * class Admin extends User {}
 * Admin.parse(value) // instanceof Admin
 * ```
 */
export function object<const S extends ObjectShape>(
  fields: S,
  options: ObjectOptions = {},
): ObjectSchema<S> {
  const shape = fields

  class ObjectClass extends Model {
    constructor(value: unknown) {
      super()
      const target = new.target as unknown as typeof ObjectClass
      return ObjectClass.parse.call(target, value) as unknown as this
    }

    static readonly isOptional = false as const
    static readonly options = Object.freeze({ ...options })
    static readonly fields = shape

    static parse(this: Constructable, value: unknown): object {
      if (
        value instanceof (this as unknown as new (...args: never[]) => object) &&
        Object.isFrozen(value)
      ) {
        return value
      }
      const parsed = parseObject(shape, value)
      Object.setPrototypeOf(parsed, (this as unknown as { prototype: object }).prototype)
      return deepFreeze(parsed)
    }

    static safeParse(this: Constructable, value: unknown): ParseResult<object> {
      try {
        return { success: true, data: ObjectClass.parse.call(this, value) }
      } catch (error) {
        if (error instanceof ModelParseError) {
          return { success: false, issues: error.issues }
        }
        throw error
      }
    }

    static toJSONSchema(): ObjectJsonSchema {
      return objectJSONSchema(shape)
    }

    static optional(): OptionalSchema<ReadonlyShape<S>, ObjectJsonSchema> {
      return makeOptional(
        ObjectClass as unknown as RequiredSchemaClass<
          ReadonlyShape<S>,
          ObjectJsonSchema
        >,
      )
    }

    static nullable(): NullableSchema<ReadonlyShape<S>, ObjectJsonSchema> {
      return makeNullable(
        ObjectClass as unknown as RequiredSchemaClass<
          ReadonlyShape<S>,
          ObjectJsonSchema
        >,
      )
    }

    static default(
      value: ReadonlyShape<S>,
    ): DefaultSchema<ReadonlyShape<S>, ObjectJsonSchema> {
      return makeDefault(
        ObjectClass as unknown as RequiredSchemaClass<
          ReadonlyShape<S>,
          ObjectJsonSchema
        >,
        value,
      )
    }

    static pick(keys: readonly string[]): ObjectSchema<ObjectShape> {
      return object(pickShape(shape, keys)) as ObjectSchema<ObjectShape>
    }

    static omit(keys: readonly string[]): ObjectSchema<ObjectShape> {
      return object(omitShape(shape, keys)) as ObjectSchema<ObjectShape>
    }

    static partial(): ObjectSchema<ObjectShape> {
      return object(partialShape(shape)) as ObjectSchema<ObjectShape>
    }

    static required(): ObjectSchema<ObjectShape> {
      return object(requiredShape(shape)) as ObjectSchema<ObjectShape>
    }

    static merge(other: ObjectSchema<ObjectShape>): ObjectSchema<ObjectShape> {
      if (typeof other !== 'function' || other.fields === undefined) {
        throw new ModelDefinitionError('merge expects an object schema')
      }
      return object({ ...shape, ...other.fields }) as ObjectSchema<ObjectShape>
    }
  }

  return ObjectClass as unknown as ObjectSchema<S>
}
