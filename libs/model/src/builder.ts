import { boolean } from './boolean'
import {
  date,
  dateTime,
  time,
  type DateFactory,
  type DateTimeFactory,
  type TimeFactory,
} from './datetime'
import { duration, type DurationFactory } from './duration'
import { email, idnEmail, type EmailFactory } from './email'
import { enumType } from './enum'
import type { StringFormat } from './formats'
import { hostname, idnHostname, type HostnameFactory } from './hostname'
import { intersection } from './intersection'
import { ipv4, type IPv4Factory } from './ipv4'
import { list } from './list'
import { literal } from './literal'
import { nullType } from './null'
import { number, type NumberOptions, type NumberSchema } from './number'
import { object } from './object'
import { record } from './record'
import { string, type StringOptions, type StringSchema } from './string'
import { tuple } from './tuple'
import { union } from './union'
import { uuid, type UUIDFactory } from './uuid'
import {
  iri,
  iriReference,
  uri,
  uriReference,
  url,
  type URIFactory,
  type URLFactory,
} from './url'

/**
 * Validators accepted by a string-format type. Deliberately separate from
 * `StringOptions` so formats can diverge from the base string API later.
 */
export type StringFormatValidators =
  | {
      eq: string
      length?: never
      pattern?: never
    }
  | {
      eq?: never
      length?: NumberOptions
      pattern?: RegExp
    }

type IntBounds =
  | { eq: number; min?: never; max?: never; gt?: never; lt?: never }
  | { eq?: never; min?: number; max?: number; gt?: never; lt?: never }
  | { eq?: never; min?: number; lt?: number; gt?: never; max?: never }
  | { eq?: never; gt?: number; max?: number; min?: never; lt?: never }
  | { eq?: never; gt?: number; lt?: number; min?: never; max?: never }

/** Validators accepted by the integer type (no `int` flag; it is fixed). */
export type IntValidators = IntBounds & { multipleOf?: number }

export type StringFormatFactory = (
  validators?: StringFormatValidators,
) => StringSchema<string>
export type IntFactory = (validators?: IntValidators) => NumberSchema<number>

export type ModelBuilder = {
  string: typeof string
  number: typeof number
  int: IntFactory
  boolean: typeof boolean
  null: typeof nullType
  nullType: typeof nullType
  literal: typeof literal
  enum: typeof enumType
  enumType: typeof enumType
  list: typeof list
  tuple: typeof tuple
  record: typeof record
  object: typeof object
  union: typeof union
  intersection: typeof intersection

  email: EmailFactory
  idnEmail: EmailFactory
  URL: URLFactory
  uri: URIFactory
  iri: URIFactory
  uriReference: URIFactory
  iriReference: URIFactory
  hostname: HostnameFactory
  idnHostname: HostnameFactory
  ipv4: IPv4Factory
  ipv6: StringFormatFactory
  uuid: UUIDFactory
  date: DateFactory
  time: TimeFactory
  dateTime: DateTimeFactory
  duration: DurationFactory
  uriTemplate: StringFormatFactory
  jsonPointer: StringFormatFactory
  relativeJsonPointer: StringFormatFactory
  regex: StringFormatFactory
}

function formatType(format: StringFormat): StringFormatFactory {
  return (validators) =>
    string({ ...validators, format } as StringOptions)
}

function intType(validators?: IntValidators): NumberSchema<number> {
  return number({ ...validators, int: true } as NumberOptions)
}

function createBaseBuilder(): ModelBuilder {
  return {
    string,
    number,
    int: intType,
    boolean,
    null: nullType,
    nullType,
    literal,
    enum: enumType,
    enumType,
    list,
    tuple,
    record,
    object,
    union,
    intersection,

    email,
    idnEmail,
    URL: url,
    uri,
    iri,
    uriReference,
    iriReference,
    hostname,
    idnHostname,
    ipv4,
    ipv6: formatType('ipv6'),
    uuid,
    date,
    time,
    dateTime,
    duration,
    uriTemplate: formatType('uri-template'),
    jsonPointer: formatType('json-pointer'),
    relativeJsonPointer: formatType('relative-json-pointer'),
    regex: formatType('regex'),
  }
}

/**
 * Creates a model builder. Built-in schemas are only reachable through the
 * returned builder, and custom types can be supplied in the callback.
 *
 * ```ts
 * const model = createTypeBuilder((tb) => ({
 *   slug: (validators?: SlugValidators) =>
 *     tb.string({ ...validators, pattern: /^[a-z0-9-]+$/ }),
 * }))
 * ```
 */
export function createTypeBuilder<
  D extends Record<string, unknown> = {},
>(
  define?: (model: ModelBuilder) => D,
): Omit<ModelBuilder, keyof D> & D {
  const base = createBaseBuilder()
  if (!define) {
    return base as unknown as Omit<ModelBuilder, keyof D> & D
  }
  return { ...base, ...define(base) } as unknown as Omit<ModelBuilder, keyof D> & D
}
