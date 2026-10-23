import { ModelParseError, typeName, type Issue, type ParseResult } from './errors'
import type { JsonSchema, RecordJsonSchema } from './json-schema'
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
} from './schema'

/** Records cannot contain optional values: JSON objects have no holes. */
export type RecordValue = RequiredSchemaClass<unknown, JsonSchema>

export type ReadonlyRecord<V extends RecordValue> = Readonly<
  Record<string, DeepReadonly<InferSchema<V>>>
> &
  ModelBrand

export type RecordSchema<V extends RecordValue> = {
  new (value: unknown): ReadonlyRecord<V>
  parse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): DeepReadonly<InstanceType<This>> & ModelBrand
    (value: unknown): ReadonlyRecord<V>
  }
  safeParse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): ParseResult<DeepReadonly<InstanceType<This>> & ModelBrand>
    (value: unknown): ParseResult<ReadonlyRecord<V>>
  }
  toJSONSchema(): RecordJsonSchema
  readonly isOptional: false
  readonly values: V
  optional(): OptionalSchema<ReadonlyRecord<V>, RecordJsonSchema>
  nullable(): NullableSchema<ReadonlyRecord<V>, RecordJsonSchema>
  default(value: ReadonlyRecord<V>): DefaultSchema<ReadonlyRecord<V>, RecordJsonSchema>
}

function parseRecord<V extends RecordValue>(
  valueSchema: V,
  value: unknown,
): ReadonlyRecord<V> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ModelParseError([
      { path: [], message: `Expected object, received ${typeName(value)}` },
    ])
  }

  const input = value as Record<string, unknown>
  const output: Record<string, unknown> = {}
  const issues: Issue[] = []

  for (const key of Object.keys(input)) {
    try {
      output[key] = valueSchema.parse(input[key])
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
  return output as ReadonlyRecord<V>
}

/**
 * Creates a record schema: an object with arbitrary string keys and values
 * validated by one schema.
 *
 * ```ts
 * const scores = record(number({ min: 0 }))
 * scores.parse({ ada: 10, grace: 20 })
 * ```
 */
export function record<const V extends RecordValue>(values: V): RecordSchema<V> {
  const valueSchema = values

  class RecordClass extends Model {
    constructor(value: unknown) {
      super()
      const target = new.target as unknown as typeof RecordClass
      return RecordClass.parse.call(target, value) as unknown as this
    }

    static readonly isOptional = false as const
    static readonly values = valueSchema

    static parse(this: Constructable, value: unknown): object {
      if (
        value instanceof (this as unknown as new (...args: never[]) => object) &&
        Object.isFrozen(value)
      ) {
        return value
      }
      const parsed = parseRecord(valueSchema, value)
      Object.setPrototypeOf(parsed, (this as unknown as { prototype: object }).prototype)
      return deepFreeze(parsed)
    }

    static safeParse(this: Constructable, value: unknown): ParseResult<object> {
      try {
        return { success: true, data: RecordClass.parse.call(this, value) }
      } catch (error) {
        if (error instanceof ModelParseError) {
          return { success: false, issues: error.issues }
        }
        throw error
      }
    }

    static toJSONSchema(): RecordJsonSchema {
      return { type: 'object', additionalProperties: valueSchema.toJSONSchema() }
    }

    static optional(): OptionalSchema<ReadonlyRecord<V>, RecordJsonSchema> {
      return makeOptional(
        RecordClass as unknown as RequiredSchemaClass<
          ReadonlyRecord<V>,
          RecordJsonSchema
        >,
      )
    }

    static nullable(): NullableSchema<ReadonlyRecord<V>, RecordJsonSchema> {
      return makeNullable(
        RecordClass as unknown as RequiredSchemaClass<
          ReadonlyRecord<V>,
          RecordJsonSchema
        >,
      )
    }

    static default(
      value: ReadonlyRecord<V>,
    ): DefaultSchema<ReadonlyRecord<V>, RecordJsonSchema> {
      return makeDefault(
        RecordClass as unknown as RequiredSchemaClass<
          ReadonlyRecord<V>,
          RecordJsonSchema
        >,
        value,
      )
    }
  }

  return RecordClass as unknown as RecordSchema<V>
}
