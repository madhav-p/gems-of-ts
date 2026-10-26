import { ModelDefinitionError, ModelParseError, safeParseWith } from './errors'
import type { StringFormat } from './formats'
import type { BoundedStringJsonSchema, StringJsonSchema } from './json-schema'
import { assertKnownKeys, isOptionsObject } from './parts'
import { buildSchema } from './schema'
import { string, type StringOptions, type StringSchema } from './string'

export type CompiledFormatParts = {
  body: string
  check: (value: string) => boolean
  message: string
}

export type FormatSchemaOptions<V extends object> = {
  format: StringFormat
  label: string
  knownKeys: readonly string[]
  validators?: V
  compile: (validators: V) => CompiledFormatParts | undefined
}

const BASE_KEYS = new Set(['eq', 'length', 'pattern'])

/**
 * Builds a string-format schema with format-specific part filters. The base
 * format validator still runs; part filters are compiled into one JSON Schema
 * `pattern` and checked against the parsed parts at runtime.
 */
export function buildFormatSchema<V extends object>(
  options: FormatSchemaOptions<V>,
): StringSchema<string> {
  const resolved = (options.validators ?? {}) as V
  if (!isOptionsObject(resolved)) {
    throw new ModelDefinitionError(
      `Invalid ${options.label} model: options must be an object`,
    )
  }
  assertKnownKeys(resolved, options.knownKeys, options.label)
  const raw = resolved as Record<string, unknown>

  if (raw.eq !== undefined && typeof raw.eq !== 'string') {
    throw new ModelDefinitionError(
      `Invalid ${options.label} model: "eq" must be a string`,
    )
  }
  if (raw.pattern !== undefined && !(raw.pattern instanceof RegExp)) {
    throw new ModelDefinitionError(
      `Invalid ${options.label} model: "pattern" must be a RegExp`,
    )
  }
  if (raw.length !== undefined) {
    if (!isOptionsObject(raw.length)) {
      throw new ModelDefinitionError(
        `Invalid ${options.label} model: "length" must be an options object`,
      )
    }
    assertKnownKeys(
      raw.length,
      ['eq', 'min', 'max', 'gt', 'lt', 'int', 'multipleOf'],
      `${options.label}.length`,
    )
  }

  const partKeys = options.knownKeys.filter((key) => !BASE_KEYS.has(key))
  const hasParts = partKeys.some((key) => raw[key] !== undefined)
  if (
    raw.eq !== undefined &&
    (raw.length !== undefined || raw.pattern !== undefined || hasParts)
  ) {
    throw new ModelDefinitionError(
      `Invalid ${options.label} model: "eq" cannot be combined with other constraints`,
    )
  }

  const parts = options.compile(resolved)
  const baseOptions: Record<string, unknown> = {
    format: options.format,
  }
  if (raw.eq !== undefined) {
    baseOptions.eq = raw.eq
  }
  if (raw.length !== undefined) {
    baseOptions.length = raw.length
  }
  if (raw.pattern !== undefined) {
    baseOptions.pattern = raw.pattern
  }
  const base = string(baseOptions as StringOptions)

  const parse = (value: unknown): string => {
    const parsed = base.parse(value)
    if (parts !== undefined && !parts.check(parsed)) {
      throw new ModelParseError([{ path: [], message: parts.message }])
    }
    return parsed
  }
  const toJSONSchema = (): StringJsonSchema => {
    const json = base.toJSONSchema()
    if (parts === undefined || !('type' in json)) {
      return json
    }
    const bounded = json as BoundedStringJsonSchema
    bounded.pattern =
      bounded.pattern === undefined
        ? `^${parts.body}$`
        : `^(?=[\\s\\S]*?(?:${bounded.pattern}))${parts.body}$`
    return bounded
  }

  return buildSchema(
    {
      parse,
      safeParse: (value) => safeParseWith(parse, value),
      toJSONSchema,
    },
    { options: Object.freeze({ ...resolved }) as Readonly<StringOptions> },
  ) as unknown as StringSchema<string>
}
