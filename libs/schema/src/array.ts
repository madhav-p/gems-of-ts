import type { ArrayJsonSchema } from './json-schema'
import type { Constructable, OptionalSchema, ParseResult, SchemaClass } from './schema'
import { SchemaParseError } from './schema'
import { compileArray, parseArray } from './runtime'

export type ArraySchema<T> = {
  new (value: unknown): T[]
  parse: {
    <This extends Constructable>(this: This, value: unknown): InstanceType<This>
    (value: unknown): T[]
  }
  safeParse: {
    <This extends Constructable>(this: This, value: unknown): ParseResult<InstanceType<This>>
    (value: unknown): ParseResult<T[]>
  }
  toJSONSchema(): ArrayJsonSchema
  compile(): (value: unknown) => T[]
  readonly isOptional: boolean
  min(length: number): ArraySchema<T>
  max(length: number): ArraySchema<T>
  optional(): OptionalSchema<T[]>
}

type ArrayDef = {
  minItems?: number
  maxItems?: number
  optional?: boolean
}

function makeArray<T>(element: SchemaClass<T>, def: ArrayDef): ArraySchema<T> {
  // Extends Array so that a subclass prototype chain keeps the array methods.
  class ArraySchemaImpl extends Array<unknown> {
    // Derived array methods (splice, filter, map, ...) create result arrays via
    // `this.constructor[Symbol.species]`. Without this, they'd call
    // `new ArraySchemaImpl(length)` — which expects an input value, not a length.
    static override get [Symbol.species](): ArrayConstructor {
      return Array
    }

    constructor(value: unknown) {
      super()
      const target = new.target as unknown as typeof ArraySchemaImpl
      return ArraySchemaImpl.parse.call(target, value) as unknown as this
    }

    static parse(this: Constructable, value: unknown): unknown[] {
      if (value === undefined && def.optional) {
        return undefined as unknown as unknown[]
      }
      // Fast path: an array already of this class has been parsed (and its items
      // already validated), so re-parsing it is a no-op.
      if (value instanceof (this as unknown as new (...args: never[]) => unknown[])) {
        return value
      }
      const parsed = parseArray(element, value, def.minItems, def.maxItems)
      Object.setPrototypeOf(parsed, (this as unknown as { prototype: object }).prototype)
      return parsed
    }

    static safeParse(this: Constructable, value: unknown): ParseResult<unknown[]> {
      try {
        return { success: true, data: ArraySchemaImpl.parse.call(this, value) }
      } catch (error) {
        if (error instanceof SchemaParseError) {
          return { success: false, issues: error.issues }
        }
        throw error
      }
    }

    static toJSONSchema(): ArrayJsonSchema {
      const schema: ArrayJsonSchema = { type: 'array', items: element.toJSONSchema() }
      if (def.minItems !== undefined) {
        schema.minItems = def.minItems
      }
      if (def.maxItems !== undefined) {
        schema.maxItems = def.maxItems
      }
      return schema
    }

    static compile(): (value: unknown) => T[] {
      const validate = compileArray(element, def.minItems, def.maxItems)
      if (def.optional) {
        return (value: unknown) =>
          value === undefined ? (undefined as unknown as T[]) : validate(value)
      }
      return validate
    }

    static get isOptional(): boolean {
      return def.optional === true
    }

    static min(length: number): ArraySchema<T> {
      return makeArray(element, { ...def, minItems: length })
    }

    static max(length: number): ArraySchema<T> {
      return makeArray(element, { ...def, maxItems: length })
    }

    static optional(): OptionalSchema<T[]> {
      return makeArray(element, { ...def, optional: true }) as unknown as OptionalSchema<T[]>
    }
  }

  return ArraySchemaImpl as unknown as ArraySchema<T>
}

export function array<T>(element: SchemaClass<T>): ArraySchema<T> {
  return makeArray(element, {})
}
