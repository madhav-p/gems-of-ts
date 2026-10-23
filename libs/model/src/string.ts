import {
  ModelDefinitionError,
  ModelParseError,
  safeParseWith,
  typeName,
  type Issue,
} from './errors'
import { stringFormats, type StringFormat } from './formats'
import { compileLength, lengthMessage, type LengthDef } from './length'
import type {
  BoundedStringJsonSchema,
  StringJsonSchema,
} from './json-schema'
import type { NumberOptions } from './number'
import { buildSchema, type RequiredSchemaClass } from './schema'

type NoStringConstraints = {
  length?: never
  pattern?: never
  startsWith?: never
  endsWith?: never
  includes?: never
}

/** An exact value. Other constraints are rejected by the type system. */
type EqOptions = {
  eq: string
  format?: StringFormat
} & NoStringConstraints

type TextMatchOptions =
  | {
      pattern: RegExp
      startsWith?: never
      endsWith?: never
      includes?: never
    }
  | {
      pattern?: never
      startsWith?: string
      endsWith?: string
      includes?: string
    }

/**
 * Length and/or text-match constraints. `length` is a full number options
 * object, so it reuses every number validator and its type-level exclusions.
 */
type ConstraintOptions = {
  eq?: never
  length?: NumberOptions
  format?: StringFormat
} & TextMatchOptions

/**
 * Options for {@link string}. `eq` is mutually exclusive with every other
 * constraint, so `{ eq: 'a', length: { min: 1 } }` is a type error. States
 * TypeScript cannot express — such as `length: { min: 5, max: 1 }` — are
 * checked at runtime when the schema is built.
 */
export type StringOptions = EqOptions | ConstraintOptions

/** The value `parse` returns: the literal type for `eq`, otherwise `string`. */
export type StringOutput<O extends StringOptions> = O extends {
  eq: infer E extends string
}
  ? E
  : string

export type StringSchema<T extends string = string> = RequiredSchemaClass<T, StringJsonSchema> & {
  /** The options this schema was built from (frozen). */
  readonly options: Readonly<StringOptions>
}

type StringDef = {
  eq?: string
  length?: LengthDef
  pattern?: RegExp
  startsWith?: string
  endsWith?: string
  includes?: string
  format?: StringFormat
}

function compileOptions(options: StringOptions): StringDef {
  const { eq, length, pattern, startsWith, endsWith, includes, format } = options

  const hasConstraints =
    length !== undefined ||
    pattern !== undefined ||
    startsWith !== undefined ||
    endsWith !== undefined ||
    includes !== undefined

  if (eq !== undefined && hasConstraints) {
    throw new ModelDefinitionError(
      'Invalid string model: "eq" cannot be combined with other constraints',
    )
  }
  if (eq !== undefined && typeof eq !== 'string') {
    throw new ModelDefinitionError('Invalid string model: "eq" must be a string')
  }
  if (pattern !== undefined && !(pattern instanceof RegExp)) {
    throw new ModelDefinitionError('Invalid string model: "pattern" must be a RegExp')
  }
  if (
    pattern !== undefined &&
    (startsWith !== undefined || endsWith !== undefined || includes !== undefined)
  ) {
    throw new ModelDefinitionError(
      'Invalid string model: "pattern" cannot be combined with startsWith, endsWith, or includes',
    )
  }
  if (format !== undefined && stringFormats[format] === undefined) {
    throw new ModelDefinitionError(
      `Invalid string model: unknown format "${String(format)}"`,
    )
  }

  // Strip stateful flags so repeated `test` calls cannot alternate results.
  const compiledPattern = pattern
    ? new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''))
    : undefined

  return {
    eq,
    length: length !== undefined ? compileLength(length, 'string') : undefined,
    pattern: compiledPattern,
    startsWith,
    endsWith,
    includes,
    format,
  }
}

function parseString(def: StringDef, value: unknown): string {
  if (typeof value !== 'string') {
    throw new ModelParseError([
      { path: [], message: `Expected string, received ${typeName(value)}` },
    ])
  }

  const issues: Issue[] = []

  if (def.eq !== undefined && value !== def.eq) {
    issues.push({ path: [], message: `Expected ${JSON.stringify(def.eq)}` })
  }
  if (def.length) {
    try {
      def.length.schema.parse(value.length)
    } catch (error) {
      if (error instanceof ModelParseError) {
        for (const issue of error.issues) {
          issues.push({ path: [], message: lengthMessage(issue.message, 'characters') })
        }
      } else {
        throw error
      }
    }
  }
  if (def.pattern !== undefined && !def.pattern.test(value)) {
    issues.push({ path: [], message: `Expected to match ${def.pattern.source}` })
  }
  if (def.startsWith !== undefined && !value.startsWith(def.startsWith)) {
    issues.push({
      path: [],
      message: `Expected to start with ${JSON.stringify(def.startsWith)}`,
    })
  }
  if (def.endsWith !== undefined && !value.endsWith(def.endsWith)) {
    issues.push({
      path: [],
      message: `Expected to end with ${JSON.stringify(def.endsWith)}`,
    })
  }
  if (def.includes !== undefined && !value.includes(def.includes)) {
    issues.push({
      path: [],
      message: `Expected to include ${JSON.stringify(def.includes)}`,
    })
  }
  if (def.format !== undefined) {
    const message = stringFormats[def.format].validate(value)
    if (message !== undefined) {
      issues.push({ path: [], message })
    }
  }

  if (issues.length > 0) {
    throw new ModelParseError(issues)
  }
  return value
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function textMatchPattern(def: StringDef): string | undefined {
  const start = def.startsWith ? escapeRegExp(def.startsWith) : undefined
  const end = def.endsWith ? escapeRegExp(def.endsWith) : undefined
  const includes = def.includes ? escapeRegExp(def.includes) : undefined

  if (start === undefined && end === undefined && includes === undefined) {
    return undefined
  }

  if (includes !== undefined) {
    const prefix = `^(?=[\\s\\S]*${includes})`
    if (start !== undefined && end !== undefined) {
      return `${prefix}${start}[\\s\\S]*${end}$`
    }
    if (start !== undefined) {
      return `${prefix}${start}`
    }
    if (end !== undefined) {
      return `${prefix}[\\s\\S]*${end}$`
    }
    return prefix
  }

  if (start !== undefined && end !== undefined) {
    return `^${start}[\\s\\S]*${end}$`
  }
  if (start !== undefined) {
    return `^${start}`
  }
  return `${end}$`
}

function stringJSONSchema(def: StringDef): StringJsonSchema {
  if (def.eq !== undefined) {
    return { const: def.eq }
  }

  const schema: BoundedStringJsonSchema = { type: 'string' }
  if (def.length?.minLength !== undefined) {
    schema.minLength = def.length.minLength
  }
  if (def.length?.maxLength !== undefined) {
    schema.maxLength = def.length.maxLength
  }
  const textPattern = textMatchPattern(def)
  if (def.pattern !== undefined) {
    schema.pattern = def.pattern.source
  } else if (textPattern !== undefined) {
    schema.pattern = textPattern
  }
  if (def.format !== undefined) {
    schema.format = def.format
  }
  return schema
}

/**
 * Creates a string schema from an options object.
 *
 * ```ts
 * const name = string({ length: { min: 1, max: 50 } })
 * const role = string({ eq: 'admin' }) // parse returns the literal type 'admin'
 * ```
 */
export function string<const O extends StringOptions = {}>(
  options?: O,
): StringSchema<StringOutput<O>> {
  const resolved = (options ?? {}) as StringOptions
  const def = compileOptions(resolved)

  return buildSchema(
    {
      parse: (value) => parseString(def, value) as StringOutput<O>,
      safeParse: (value) =>
        safeParseWith((input) => parseString(def, input) as StringOutput<O>, value),
      toJSONSchema: () => stringJSONSchema(def),
    },
    { options: Object.freeze({ ...resolved }) as Readonly<StringOptions> },
  )
}
