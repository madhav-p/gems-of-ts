import {
  ModelDefinitionError,
  ModelParseError,
  safeParseWith,
  typeName,
  type Issue,
} from './errors'
import type {
  BoundedNumberJsonSchema,
  NumberJsonSchema,
} from './json-schema'
import { buildSchema, type RequiredSchemaClass } from './schema'

type NoBounds = { min?: never; max?: never; gt?: never; lt?: never }

/** An exact value. Bounds are rejected by the type system. */
type EqOptions = {
  eq: number
  int?: boolean
  multipleOf?: number
} & NoBounds

/**
 * A range. Each side has one spelling: `min` or `gt` for the lower bound,
 * `max` or `lt` for the upper bound. Supplying both spellings on one side is
 * rejected by the type system.
 */
type RangeBounds =
  | { min?: number; max?: number; gt?: never; lt?: never }
  | { min?: number; lt?: number; gt?: never; max?: never }
  | { gt?: number; max?: number; min?: never; lt?: never }
  | { gt?: number; lt?: number; min?: never; max?: never }

type RangeOptions = RangeBounds & {
  eq?: never
  int?: boolean
  multipleOf?: number
}

/**
 * Options for {@link number}. `eq` is mutually exclusive with every bound, so
 * `{ eq: 1, min: 0 }` is a type error. States TypeScript cannot express — such
 * as `min <= max` — are checked at runtime when the schema is built.
 */
export type NumberOptions = EqOptions | RangeOptions

/** The value `parse` returns: the literal type for `eq`, otherwise `number`. */
export type NumberOutput<O extends NumberOptions> = O extends {
  eq: infer E extends number
}
  ? E
  : number

export type NumberSchema<T extends number = number> = RequiredSchemaClass<T, NumberJsonSchema> & {
  /** The options this schema was built from (frozen). */
  readonly options: Readonly<NumberOptions>
}

type Bound = { value: number; exclusive: boolean }

type NumberDef = {
  eq?: number
  lower?: Bound
  upper?: Bound
  int: boolean
  multipleOf?: number
}

function isMultipleOf(value: number, divisor: number): boolean {
  const quotient = value / divisor
  return (
    Math.abs(quotient - Math.round(quotient)) <
    1e-9 * Math.max(1, Math.abs(quotient))
  )
}

function assertFinite(name: string, value: number | undefined): void {
  if (value !== undefined && !Number.isFinite(value)) {
    throw new ModelDefinitionError(`Invalid number model: "${name}" must be a finite number`)
  }
}

/**
 * Normalises options into a definition, rejecting states the type system cannot
 * express. This runs once, when the schema is created — not per parse.
 */
function compileOptions(options: NumberOptions): NumberDef {
  const { eq, min, max, gt, lt, int, multipleOf } = options

  assertFinite('eq', eq)
  assertFinite('min', min)
  assertFinite('max', max)
  assertFinite('gt', gt)
  assertFinite('lt', lt)
  assertFinite('multipleOf', multipleOf)

  const hasBounds =
    min !== undefined || max !== undefined || gt !== undefined || lt !== undefined

  if (eq !== undefined && hasBounds) {
    throw new ModelDefinitionError(
      'Invalid number model: "eq" cannot be combined with bounds',
    )
  }
  if (min !== undefined && gt !== undefined) {
    throw new ModelDefinitionError(
      'Invalid number model: use either "min" or "gt", not both',
    )
  }
  if (max !== undefined && lt !== undefined) {
    throw new ModelDefinitionError(
      'Invalid number model: use either "max" or "lt", not both',
    )
  }
  if (int === true && eq !== undefined && !Number.isInteger(eq)) {
    throw new ModelDefinitionError(
      'Invalid number model: "eq" must be an integer when "int" is true',
    )
  }
  if (multipleOf !== undefined && multipleOf <= 0) {
    throw new ModelDefinitionError(
      'Invalid number model: "multipleOf" must be greater than 0',
    )
  }
  if (
    eq !== undefined &&
    multipleOf !== undefined &&
    !isMultipleOf(eq, multipleOf)
  ) {
    throw new ModelDefinitionError(
      'Invalid number model: "eq" must be a multiple of "multipleOf"',
    )
  }

  const lower: Bound | undefined =
    min !== undefined
      ? { value: min, exclusive: false }
      : gt !== undefined
        ? { value: gt, exclusive: true }
        : undefined
  const upper: Bound | undefined =
    max !== undefined
      ? { value: max, exclusive: false }
      : lt !== undefined
        ? { value: lt, exclusive: true }
        : undefined

  if (lower && upper) {
    if (lower.value > upper.value) {
      throw new ModelDefinitionError(
        'Invalid number model: lower bound must not exceed upper bound',
      )
    }
    if (lower.value === upper.value && (lower.exclusive || upper.exclusive)) {
      throw new ModelDefinitionError('Invalid number model: the range is empty')
    }
  }

  return { eq, lower, upper, int: int === true, multipleOf }
}

function parseNumber(def: NumberDef, value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ModelParseError([
      { path: [], message: `Expected number, received ${typeName(value)}` },
    ])
  }
  if (!Number.isFinite(value)) {
    throw new ModelParseError([{ path: [], message: 'Expected a finite number' }])
  }

  const issues: Issue[] = []

  if (def.eq !== undefined && value !== def.eq) {
    issues.push({ path: [], message: `Expected ${def.eq}` })
  }
  if (def.lower) {
    const { value: bound, exclusive } = def.lower
    if (exclusive ? value <= bound : value < bound) {
      issues.push({
        path: [],
        message: `${
          exclusive ? 'Expected a value greater than' : 'Expected a value of at least'
        } ${bound}`,
      })
    }
  }
  if (def.upper) {
    const { value: bound, exclusive } = def.upper
    if (exclusive ? value >= bound : value > bound) {
      issues.push({
        path: [],
        message: `${
          exclusive ? 'Expected a value less than' : 'Expected a value of at most'
        } ${bound}`,
      })
    }
  }
  if (def.int && !Number.isInteger(value)) {
    issues.push({ path: [], message: 'Expected an integer' })
  }
  if (def.multipleOf !== undefined && !isMultipleOf(value, def.multipleOf)) {
    issues.push({
      path: [],
      message: `Expected a multiple of ${def.multipleOf}`,
    })
  }

  if (issues.length > 0) {
    throw new ModelParseError(issues)
  }
  return value
}

function numberJSONSchema(def: NumberDef): NumberJsonSchema {
  if (def.eq !== undefined) {
    return { const: def.eq }
  }

  const schema: BoundedNumberJsonSchema = {
    type: def.int ? 'integer' : 'number',
  }
  if (def.lower) {
    if (def.lower.exclusive) {
      schema.exclusiveMinimum = def.lower.value
    } else {
      schema.minimum = def.lower.value
    }
  }
  if (def.upper) {
    if (def.upper.exclusive) {
      schema.exclusiveMaximum = def.upper.value
    } else {
      schema.maximum = def.upper.value
    }
  }
  if (def.multipleOf !== undefined) {
    schema.multipleOf = def.multipleOf
  }
  return schema
}

/**
 * Creates a number schema from an options object.
 *
 * ```ts
 * const age = number({ min: 0, max: 120 })
 * const answer = number({ eq: 42 }) // parse returns the literal type 42
 * ```
 */
export function number<const O extends NumberOptions = {}>(
  options?: O,
): NumberSchema<NumberOutput<O>> {
  const resolved = (options ?? {}) as NumberOptions
  const def = compileOptions(resolved)

  return buildSchema(
    {
      parse: (value) => parseNumber(def, value) as NumberOutput<O>,
      safeParse: (value) =>
        safeParseWith((input) => parseNumber(def, input) as NumberOutput<O>, value),
      toJSONSchema: () => numberJSONSchema(def),
    },
    { options: Object.freeze({ ...resolved }) as Readonly<NumberOptions> },
  )
}
