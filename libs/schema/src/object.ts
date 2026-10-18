import type { ObjectJsonSchema } from './json-schema'
import type {
  Constructable,
  OptionalSchema,
  OutputOfShape,
  ParseResult,
  SchemaClass,
} from './schema'
import { SchemaParseError } from './schema'
import { compileObject, objectJSONSchema, parseObject } from './runtime'

/**
 * A class schema. Its *instances* are the parsed shape, and `parse` returns
 * `this` (the user's subclass) via a polymorphic `this` type.
 */
export type ObjectSchema<O> = {
  new (value: unknown): O
  parse: {
    <This extends Constructable>(this: This, value: unknown): InstanceType<This>
    (value: unknown): O
  }
  safeParse: {
    <This extends Constructable>(this: This, value: unknown): ParseResult<InstanceType<This>>
    (value: unknown): ParseResult<O>
  }
  toJSONSchema(): ObjectJsonSchema
  compile(): (value: unknown) => O
  readonly isOptional: boolean
  optional(): OptionalSchema<O>
}

function makeObject<S extends Record<string, SchemaClass<unknown>>>(
  shape: S,
  def: { optional?: boolean },
): ObjectSchema<OutputOfShape<S>> {
  type Output = OutputOfShape<S>

  class ObjectSchemaImpl {
    constructor(value: unknown) {
      const target = new.target as unknown as typeof ObjectSchemaImpl
      return ObjectSchemaImpl.parse.call(target, value) as unknown as this
    }

    static parse(this: Constructable, value: unknown): object {
      if (value === undefined && def.optional) {
        return undefined as unknown as object
      }
      // Fast path: an instance of this class has already been parsed and is kept
      // valid by the mutation proxy, so re-parsing it is a no-op. This makes
      // "re-parse an already parsed value" free.
      if (value instanceof (this as unknown as new (...args: never[]) => object)) {
        return value
      }
      const parsed = parseObject<Output>(shape, value)
      Object.setPrototypeOf(parsed, (this as unknown as { prototype: object }).prototype)
      return parsed
    }

    static safeParse(this: Constructable, value: unknown): ParseResult<object> {
      try {
        return { success: true, data: ObjectSchemaImpl.parse.call(this, value) }
      } catch (error) {
        if (error instanceof SchemaParseError) {
          return { success: false, issues: error.issues }
        }
        throw error
      }
    }

    static toJSONSchema(): ObjectJsonSchema {
      return objectJSONSchema(shape)
    }

    static compile(): (value: unknown) => Output {
      const validate = compileObject<Output>(shape)
      if (def.optional) {
        return (value: unknown) =>
          value === undefined ? (undefined as unknown as Output) : validate(value)
      }
      return validate
    }

    static get isOptional(): boolean {
      return def.optional === true
    }

    static optional(): OptionalSchema<Output> {
      return makeObject(shape, { optional: true }) as unknown as OptionalSchema<Output>
    }
  }

  return ObjectSchemaImpl as unknown as ObjectSchema<Output>
}

export function object<S extends Record<string, SchemaClass<unknown>>>(
  shape: S,
): ObjectSchema<OutputOfShape<S>> {
  return makeObject(shape, {})
}
