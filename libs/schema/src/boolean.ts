import type { BooleanJsonSchema } from './json-schema'
import type { OptionalSchema, ParseResult, SchemaClass } from './schema'
import { SchemaParseError, safeParseWith, typeName } from './schema'

export type BooleanSchema = SchemaClass<boolean> & {
  optional(): OptionalSchema<boolean>
  new (): object
}

type BooleanDef = { optional?: boolean }

function makeBoolean(def: BooleanDef): BooleanSchema {
  class BooleanSchemaImpl {
    static readonly isOptional: boolean = def.optional === true

    static parse(value: unknown): boolean {
      if (value === undefined && def.optional) {
        return undefined as unknown as boolean
      }
      if (typeof value !== 'boolean') {
        throw new SchemaParseError([
          { path: [], message: `Expected boolean, received ${typeName(value)}` },
        ])
      }
      return value
    }

    static safeParse(value: unknown): ParseResult<boolean> {
      return safeParseWith(BooleanSchemaImpl.parse, value)
    }

    static compile(): (value: unknown) => boolean {
      return (value) => BooleanSchemaImpl.parse(value)
    }

    static toJSONSchema(): BooleanJsonSchema {
      return { type: 'boolean' }
    }

    static optional(): OptionalSchema<boolean> {
      return makeBoolean({ optional: true }) as unknown as OptionalSchema<boolean>
    }
  }

  return BooleanSchemaImpl as unknown as BooleanSchema
}

export function boolean(): BooleanSchema {
  return makeBoolean({})
}
