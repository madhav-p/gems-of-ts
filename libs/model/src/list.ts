import { ModelParseError, type ParseResult } from './errors'
import type { JsonSchema, ListJsonSchema } from './json-schema'
import { compileLength, lengthMessage, type LengthDef } from './length'
import type { NumberOptions } from './number'
import {
  deepFreeze,
  makeDefault,
  makeNullable,
  makeOptional,
  ModelList,
  type Constructable,
  type DeepReadonly,
  type DefaultSchema,
  type InferSchema,
  type ModelBrand,
  type NullableSchema,
  type OptionalSchema,
  type RequiredSchemaClass,
} from './schema'

/** Lists cannot contain optional elements: JSON arrays have no holes. */
export type ListElement = RequiredSchemaClass<unknown, JsonSchema>

/** List-level validations. */
export type ListOptions = {
  length?: NumberOptions
}

export type ReadonlyList<S extends ListElement> = ReadonlyArray<
  DeepReadonly<InferSchema<S>>
> &
  ModelBrand

export type ListSchema<S extends ListElement> = {
  new (value: unknown): ReadonlyList<S>
  parse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): DeepReadonly<InstanceType<This>> & ModelBrand
    (value: unknown): ReadonlyList<S>
  }
  safeParse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): ParseResult<DeepReadonly<InstanceType<This>> & ModelBrand>
    (value: unknown): ParseResult<ReadonlyList<S>>
  }
  toJSONSchema(): ListJsonSchema
  readonly isOptional: false
  optional(): OptionalSchema<ReadonlyList<S>, ListJsonSchema>
  nullable(): NullableSchema<ReadonlyList<S>, ListJsonSchema>
  default(value: ReadonlyList<S>): DefaultSchema<ReadonlyList<S>, ListJsonSchema>
  readonly options: Readonly<ListOptions>
  readonly element: S
  readonly minItems?: number
  readonly maxItems?: number
}

function typeName(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  return typeof value
}

function parseList<S extends ListElement>(
  element: S,
  value: unknown,
  length?: LengthDef,
): InferSchema<S>[] {
  if (!Array.isArray(value)) {
    throw new ModelParseError([
      { path: [], message: `Expected array, received ${typeName(value)}` },
    ])
  }

  const issues: Array<{ path: Array<string | number>; message: string }> = []

  if (length) {
    try {
      length.schema.parse(value.length)
    } catch (error) {
      if (error instanceof ModelParseError) {
        for (const issue of error.issues) {
          issues.push({
            path: [],
            message: lengthMessage(issue.message, 'items'),
          })
        }
      } else {
        throw error
      }
    }
  }

  const output: InferSchema<S>[] = []

  for (let index = 0; index < value.length; index++) {
    try {
      output.push(element.parse(value[index]) as InferSchema<S>)
    } catch (error) {
      if (error instanceof ModelParseError) {
        for (const issue of error.issues) {
          issues.push({ path: [index, ...issue.path], message: issue.message })
        }
      } else {
        throw error
      }
    }
  }

  if (issues.length > 0) {
    throw new ModelParseError(issues)
  }
  return output
}

/**
 * Creates a list schema class from an options object.
 *
 * ```ts
 * const tags = list(string({ length: { min: 1 } }))
 * class Tags extends list(string()) {}
 * ```
 */
export function list<const S extends ListElement>(
  item: S,
  options: ListOptions = {},
): ListSchema<S> {
  const element = item
  const length =
    options.length !== undefined ? compileLength(options.length, 'list') : undefined

  class ListClass extends ModelList {
    constructor(value: unknown) {
      super()
      const target = new.target as unknown as typeof ListClass
      return ListClass.parse.call(target, value) as unknown as this
    }

    static readonly isOptional = false as const
    static readonly options = Object.freeze({ ...options })
    static readonly element = element
    static readonly minItems = length?.minLength
    static readonly maxItems = length?.maxLength

    static parse(this: Constructable, value: unknown): unknown[] {
      if (
        value instanceof (this as unknown as new (...args: never[]) => object) &&
        Object.isFrozen(value)
      ) {
        return value as unknown[]
      }
      const parsed = parseList(element, value, length) as unknown as unknown[]
      Object.setPrototypeOf(parsed, (this as unknown as { prototype: object }).prototype)
      return deepFreeze(parsed)
    }

    static safeParse(
      this: Constructable,
      value: unknown,
    ): ParseResult<unknown[]> {
      try {
        return { success: true, data: ListClass.parse.call(this, value) }
      } catch (error) {
        if (error instanceof ModelParseError) {
          return { success: false, issues: error.issues }
        }
        throw error
      }
    }

    static toJSONSchema(): ListJsonSchema {
      const schema: ListJsonSchema = {
        type: 'array',
        items: element.toJSONSchema(),
      }
      if (length?.minLength !== undefined) {
        schema.minItems = length.minLength
      }
      if (length?.maxLength !== undefined) {
        schema.maxItems = length.maxLength
      }
      return schema
    }

    static optional(): OptionalSchema<ReadonlyList<S>, ListJsonSchema> {
      return makeOptional(
        ListClass as unknown as RequiredSchemaClass<
          ReadonlyList<S>,
          ListJsonSchema
        >,
      )
    }

    static nullable(): NullableSchema<ReadonlyList<S>, ListJsonSchema> {
      return makeNullable(
        ListClass as unknown as RequiredSchemaClass<
          ReadonlyList<S>,
          ListJsonSchema
        >,
      )
    }

    static default(
      value: ReadonlyList<S>,
    ): DefaultSchema<ReadonlyList<S>, ListJsonSchema> {
      return makeDefault(
        ListClass as unknown as RequiredSchemaClass<
          ReadonlyList<S>,
          ListJsonSchema
        >,
        value,
      )
    }
  }

  return ListClass as unknown as ListSchema<S>
}
