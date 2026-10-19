import type { LiteralJsonSchema } from './json-schema'
import type { OptionalSchema, ParseResult, SchemaClass } from './schema'
import { SchemaParseError, safeParseWith, typeName } from './schema'

/** The values a `literal` schema can pin. */
export type LiteralValue = string | number | boolean | null

export type LiteralSchema<T extends LiteralValue = LiteralValue> = SchemaClass<T> & {
  optional(): OptionalSchema<T>
}

type LiteralDef<T extends LiteralValue> = {
  value: T
  optional?: boolean
}

function describe(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'number':
    case 'boolean':
      return String(value)
    default:
      return value === null ? 'null' : typeName(value)
  }
}

function makeLiteral<T extends LiteralValue>(def: LiteralDef<T>): LiteralSchema<T> {
  class LiteralSchemaImpl {
    static readonly isOptional: boolean = def.optional === true

    static parse(value: unknown): T {
      if (value === undefined && def.optional) {
        return undefined as unknown as T
      }
      if (!Object.is(value, def.value)) {
        throw new SchemaParseError([
          {
            path: [],
            message: `Expected the literal ${describe(def.value)}, received ${describe(value)}`,
          },
        ])
      }
      return def.value
    }

    static safeParse(value: unknown): ParseResult<T> {
      return safeParseWith(LiteralSchemaImpl.parse, value)
    }

    static toJSONSchema(): LiteralJsonSchema {
      return { const: def.value }
    }

    static compile(): (value: unknown) => T {
      return (value) => LiteralSchemaImpl.parse(value)
    }

    static optional(): OptionalSchema<T> {
      return makeLiteral({ ...def, optional: true }) as unknown as OptionalSchema<T>
    }
  }

  return LiteralSchemaImpl as unknown as LiteralSchema<T>
}

/**
 * A schema that accepts exactly one value — a string, number, boolean or `null`.
 * The parsed type is the literal type itself, and JSON Schema uses `const`.
 *
 * ```ts
 * const role = literal('admin')   // 'admin'
 * class Event extends t.object({ kind: t.literal('created') }) {}
 * ```
 */
export function literal<T extends LiteralValue>(value: T): LiteralSchema<T> {
  return makeLiteral({ value })
}
