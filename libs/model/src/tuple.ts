import { ModelParseError, typeName, type Issue, type ParseResult } from './errors'
import type { JsonSchema, TupleJsonSchema } from './json-schema'
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

/** Tuple items cannot be optional: arrays have no holes. */
export type TupleElement = RequiredSchemaClass<unknown, JsonSchema>

export type ReadonlyTuple<S extends readonly TupleElement[]> = Readonly<{
  [K in keyof S]: DeepReadonly<InferSchema<S[K]>>
}> &
  ModelBrand

export type TupleSchema<S extends readonly TupleElement[]> = {
  new (value: unknown): ReadonlyTuple<S>
  parse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): DeepReadonly<InstanceType<This>> & ModelBrand
    (value: unknown): ReadonlyTuple<S>
  }
  safeParse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): ParseResult<DeepReadonly<InstanceType<This>> & ModelBrand>
    (value: unknown): ParseResult<ReadonlyTuple<S>>
  }
  toJSONSchema(): TupleJsonSchema
  readonly isOptional: false
  readonly items: S
  optional(): OptionalSchema<ReadonlyTuple<S>, TupleJsonSchema>
  nullable(): NullableSchema<ReadonlyTuple<S>, TupleJsonSchema>
  default(value: ReadonlyTuple<S>): DefaultSchema<ReadonlyTuple<S>, TupleJsonSchema>
}

function parseTuple<S extends readonly TupleElement[]>(
  items: S,
  value: unknown,
): ReadonlyTuple<S> {
  if (!Array.isArray(value)) {
    throw new ModelParseError([
      { path: [], message: `Expected array, received ${typeName(value)}` },
    ])
  }
  if (value.length !== items.length) {
    throw new ModelParseError([
      {
        path: [],
        message: `Expected array of length ${items.length}, received ${value.length}`,
      },
    ])
  }

  const output: unknown[] = []
  const issues: Issue[] = []

  for (let index = 0; index < items.length; index++) {
    try {
      output.push(items[index]!.parse(value[index]))
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
  return output as unknown as ReadonlyTuple<S>
}

/**
 * Creates a fixed-length tuple.
 *
 * ```ts
 * const point = tuple([number(), number()])
 * point.parse([1, 2])
 * ```
 */
export function tuple<const S extends readonly TupleElement[]>(
  items: S,
): TupleSchema<S> {
  const element = items

  class TupleClass extends ModelList {
    constructor(value: unknown) {
      super()
      const target = new.target as unknown as typeof TupleClass
      return TupleClass.parse.call(target, value) as unknown as this
    }

    static readonly isOptional = false as const
    static readonly items = element

    static parse(this: Constructable, value: unknown): unknown[] {
      if (
        value instanceof (this as unknown as new (...args: never[]) => object) &&
        Object.isFrozen(value)
      ) {
        return value as unknown[]
      }
      const parsed = parseTuple(element, value) as unknown as unknown[]
      Object.setPrototypeOf(parsed, (this as unknown as { prototype: object }).prototype)
      return deepFreeze(parsed)
    }

    static safeParse(
      this: Constructable,
      value: unknown,
    ): ParseResult<unknown[]> {
      try {
        return { success: true, data: TupleClass.parse.call(this, value) }
      } catch (error) {
        if (error instanceof ModelParseError) {
          return { success: false, issues: error.issues }
        }
        throw error
      }
    }

    static toJSONSchema(): TupleJsonSchema {
      return {
        type: 'array',
        prefixItems: element.map((item) => item.toJSONSchema()),
        items: false,
        minItems: element.length,
        maxItems: element.length,
      }
    }

    static optional(): OptionalSchema<ReadonlyTuple<S>, TupleJsonSchema> {
      return makeOptional(
        TupleClass as unknown as RequiredSchemaClass<
          ReadonlyTuple<S>,
          TupleJsonSchema
        >,
      )
    }

    static nullable(): NullableSchema<ReadonlyTuple<S>, TupleJsonSchema> {
      return makeNullable(
        TupleClass as unknown as RequiredSchemaClass<
          ReadonlyTuple<S>,
          TupleJsonSchema
        >,
      )
    }

    static default(
      value: ReadonlyTuple<S>,
    ): DefaultSchema<ReadonlyTuple<S>, TupleJsonSchema> {
      return makeDefault(
        TupleClass as unknown as RequiredSchemaClass<
          ReadonlyTuple<S>,
          TupleJsonSchema
        >,
        value,
      )
    }
  }

  return TupleClass as unknown as TupleSchema<S>
}
