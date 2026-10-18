import type { NumberJsonSchema } from './json-schema'
import type { OptionalSchema, ParseResult, SchemaClass, SchemaIssue } from './schema'
import { SchemaParseError, safeParseWith, typeName } from './schema'
import type { FormatRegistry } from './formats'

export type NumberSchema = SchemaClass<number> & {
  optional(): OptionalSchema<number>
}

/** The `number` constructor returned by a schema builder. */
export interface NumberFactory {
  (): NumberSchema
  (configure: (view: NumberView) => NumberView): NumberSchema
}

type Bound = { value: number; exclusive: boolean }

export type NumberDef = {
  min?: Bound
  max?: Bound
  int?: boolean
  formats: string[]
  optional?: boolean
}

/**
 * An immutable builder for number rules. Every method returns a new view; the
 * final view returned from a `number(...)` callback defines the schema.
 */
export interface NumberView {
  min(value: number): NumberView
  max(value: number): NumberView
  gt(value: number): NumberView
  lt(value: number): NumberView
  int(): NumberView
  format(name: 'int'): NumberView
  format(name: string): NumberView
}

const NUMBER_DEF: unique symbol = Symbol('numberDef')

function isNumberView(value: unknown): value is NumberView {
  return typeof value === 'object' && value !== null && NUMBER_DEF in value
}

function numberDefOf(view: NumberView): NumberDef {
  return (view as unknown as { [NUMBER_DEF]: NumberDef })[NUMBER_DEF]
}

/** @internal */
export function emptyNumberView(): NumberView {
  return makeNumberView({ formats: [] })
}

/** @internal */
export function numberViewDef(view: NumberView): NumberDef {
  return isNumberView(view) ? numberDefOf(view) : { formats: [] }
}

function makeNumberView(def: NumberDef): NumberView {
  const view = {
    min(value: number): NumberView {
      return makeNumberView({ ...def, min: { value, exclusive: false } })
    },
    max(value: number): NumberView {
      return makeNumberView({ ...def, max: { value, exclusive: false } })
    },
    gt(value: number): NumberView {
      return makeNumberView({ ...def, min: { value, exclusive: true } })
    },
    lt(value: number): NumberView {
      return makeNumberView({ ...def, max: { value, exclusive: true } })
    },
    int(): NumberView {
      return makeNumberView({ ...def, int: true })
    },
    format(name: string): NumberView {
      return makeNumberView({ ...def, formats: [...def.formats, name] })
    },
    [NUMBER_DEF]: def,
  }
  return view as NumberView
}

export function createNumber(formats: FormatRegistry): NumberFactory {
  function isInteger(def: NumberDef): boolean {
    return def.int === true || def.formats.some((name) => formats.numberFormatSpec(name)?.int === true)
  }

  function parseNumber(def: NumberDef, value: unknown): number {
    if (value === undefined && def.optional) {
      return undefined as unknown as number
    }
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new SchemaParseError([
        { path: [], message: `Expected number, received ${typeName(value)}` },
      ])
    }

    const issues: SchemaIssue[] = []
    if (def.min && (def.min.exclusive ? value <= def.min.value : value < def.min.value)) {
      issues.push({
        path: [],
        message: `${def.min.exclusive ? 'Expected a value greater than' : 'Expected a value of at least'} ${def.min.value}`,
      })
    }
    if (def.max && (def.max.exclusive ? value >= def.max.value : value > def.max.value)) {
      issues.push({
        path: [],
        message: `${def.max.exclusive ? 'Expected a value less than' : 'Expected a value of at most'} ${def.max.value}`,
      })
    }
    if (isInteger(def) && !Number.isInteger(value)) {
      issues.push({ path: [], message: 'Expected an integer' })
    }
    for (const name of def.formats) {
      const message = formats.numberFormatSpec(name)?.validate?.(value)
      if (message !== undefined) {
        issues.push({ path: [], message })
      }
    }
    if (issues.length > 0) {
      throw new SchemaParseError(issues)
    }
    return value
  }

  function numberJSONSchema(def: NumberDef): NumberJsonSchema {
    const schema: NumberJsonSchema = { type: isInteger(def) ? 'integer' : 'number' }
    if (def.min) {
      if (def.min.exclusive) {
        schema.exclusiveMinimum = def.min.value
      } else {
        schema.minimum = def.min.value
      }
    }
    if (def.max) {
      if (def.max.exclusive) {
        schema.exclusiveMaximum = def.max.value
      } else {
        schema.maximum = def.max.value
      }
    }
    return schema
  }

  function makeNumber(def: NumberDef): NumberSchema {
    class NumberSchemaImpl {
      static readonly isOptional: boolean = def.optional === true

      static parse(value: unknown): number {
        return parseNumber(def, value)
      }

      static safeParse(value: unknown): ParseResult<number> {
        return safeParseWith(NumberSchemaImpl.parse, value)
      }

      static compile(): (value: unknown) => number {
        return (value) => parseNumber(def, value)
      }

      static toJSONSchema(): NumberJsonSchema {
        return numberJSONSchema(def)
      }

      static optional(): OptionalSchema<number> {
        return makeNumber({ ...def, optional: true }) as unknown as OptionalSchema<number>
      }
    }

    return NumberSchemaImpl as unknown as NumberSchema
  }

  function number(configure?: (view: NumberView) => NumberView): NumberSchema {
    const initial = emptyNumberView()
    const configured = configure ? configure(initial) : initial
    return makeNumber(numberViewDef(configured))
  }

  return number as NumberFactory
}
