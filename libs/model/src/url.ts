import { ModelDefinitionError } from './errors'
import { buildFormatSchema, type CompiledFormatParts } from './format-schema'
import type { NumberOptions } from './number'
import {
  compileIntegerPart,
  compileStringPart,
  type CompiledTextPart,
  type IntegerPartValidators,
  type StringPartValidators,
  type StringPartSpec,
} from './parts'
import type { StringSchema } from './string'

type URLPartKey =
  | 'protocol'
  | 'username'
  | 'password'
  | 'host'
  | 'hostname'
  | 'port'
  | 'pathname'
  | 'search'
  | 'hash'

type URIPartKey =
  | 'scheme'
  | 'username'
  | 'password'
  | 'host'
  | 'hostname'
  | 'port'
  | 'path'
  | 'query'
  | 'fragment'

type NoURLFilters = { [K in URLPartKey]?: never }
type NoURIFilters = { [K in URIPartKey]?: never }

type URLBase = {
  eq?: never
  length?: NumberOptions
}

type URIBase = {
  eq?: never
  length?: NumberOptions
}

type URLTextFilters = {
  protocol?: StringPartValidators
  username?: StringPartValidators
  password?: StringPartValidators
  pathname?: StringPartValidators
  search?: StringPartValidators
  hash?: StringPartValidators
}

type URLHostFilters =
  | { host: StringPartValidators; hostname?: never; port?: never }
  | { host?: never; hostname?: StringPartValidators; port?: IntegerPartValidators }
  | { host?: never; hostname?: never; port?: never }

type URLWithFilters = URLBase &
  URLTextFilters &
  URLHostFilters &
  ({ pattern: RegExp } | { pattern?: never })

export type URLValidators =
  | ({ eq: string; length?: never; pattern?: never } & NoURLFilters)
  | URLWithFilters

type URITextFilters = {
  scheme?: StringPartValidators
  username?: StringPartValidators
  password?: StringPartValidators
  path?: StringPartValidators
  query?: StringPartValidators
  fragment?: StringPartValidators
}

type URIHostFilters =
  | { host: StringPartValidators; hostname?: never; port?: never }
  | { host?: never; hostname?: StringPartValidators; port?: IntegerPartValidators }
  | { host?: never; hostname?: never; port?: never }

type URIWithFilters = URIBase &
  URITextFilters &
  URIHostFilters &
  ({ pattern: RegExp } | { pattern?: never })

export type URIValidators =
  | ({ eq: string; length?: never; pattern?: never } & NoURIFilters)
  | URIWithFilters

export type URLSchema = StringSchema<string>
export type URLFactory = (validators?: URLValidators) => URLSchema
export type URIFactory = (validators?: URIValidators) => StringSchema<string>

const URL_KEYS: readonly string[] = [
  'eq',
  'length',
  'pattern',
  'protocol',
  'username',
  'password',
  'host',
  'hostname',
  'port',
  'pathname',
  'search',
  'hash',
]

const URI_KEYS: readonly string[] = [
  'eq',
  'length',
  'pattern',
  'scheme',
  'username',
  'password',
  'host',
  'hostname',
  'port',
  'path',
  'query',
  'fragment',
]

const URL_PARTS =
  /^(?:([A-Za-z][A-Za-z0-9+.-]*):)?(?:\/\/(?:([^/?#@]*)@)?(\[[^\]]+\]|[^:/?#]+)(?::(\d+))?)?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/

const HOST_CHAR = '[^/?#]'
const HOSTNAME_CHAR = '(?:[^:/?#]|:(?=[^\\]]*\\]))'
const GENERIC_HOSTNAME = '(?:\\[[^\\]]+\\]|[^:/?#@]+)'
const GENERIC_USERINFO = '[^/?#@]*'
const GENERIC_SCHEME = '[A-Za-z][A-Za-z0-9+.-]*'

type ParsedParts = {
  scheme?: string
  userinfo?: string
  username?: string
  password?: string
  hostname?: string
  host?: string
  port?: string
  path: string
  query?: string
  fragment?: string
}

function splitUserinfo(userinfo: string): {
  username: string
  password?: string
} {
  const index = userinfo.indexOf(':')
  return index === -1
    ? { username: userinfo }
    : { username: userinfo.slice(0, index), password: userinfo.slice(index + 1) }
}

function parseParts(value: string): ParsedParts | undefined {
  const match = URL_PARTS.exec(value)
  if (!match) {
    return undefined
  }
  const scheme = match[1]
  const userinfo = match[2]
  const hostname = match[3]
  const port = match[4]
  const path = match[5] ?? ''
  const query = match[6]
  const fragment = match[7]
  const user = userinfo === undefined ? undefined : splitUserinfo(userinfo)
  return {
    scheme,
    userinfo,
    username: user?.username,
    password: user?.password,
    hostname,
    port,
    host:
      hostname === undefined
        ? undefined
        : port === undefined
          ? hostname
          : `${hostname}:${port}`,
    path,
    query,
    fragment,
  }
}

function textSpec(
  label: string,
  char: string,
  boundary: string,
  caseInsensitive = false,
  checkLiteral?: (value: string, label: string) => void,
): StringPartSpec {
  return { label, char, boundary, caseInsensitive, checkLiteral }
}

function assertHostnameEq(value: string, label: string): void {
  let inBrackets = false
  for (const char of value) {
    if (char === '[') {
      inBrackets = true
    } else if (char === ']') {
      inBrackets = false
    } else if (char === ':' && !inBrackets) {
      throw new ModelDefinitionError(
        `Invalid ${label} model: "eq" must not include a port`,
      )
    }
  }
}

function rejectHostDelimiters(value: string, label: string): void {
  if (/[/?#@\s]/.test(value)) {
    throw new ModelDefinitionError(
      `Invalid ${label} model: literal contains a URL delimiter`,
    )
  }
}

function rejectDelimiters(pattern: RegExp) {
  return (value: string, label: string): void => {
    if (pattern.test(value)) {
      throw new ModelDefinitionError(
        `Invalid ${label} model: literal contains a URL delimiter`,
      )
    }
  }
}

function compileURLText(
  value: StringPartValidators | undefined,
  label: string,
  char: string,
  boundary: string,
  caseInsensitive = false,
  checkLiteral?: (value: string, label: string) => void,
): CompiledTextPart | undefined {
  return value === undefined
    ? undefined
    : compileStringPart(
        value,
        textSpec(
          label,
          char,
          boundary,
          caseInsensitive,
          checkLiteral,
        ),
      )
}

type CompiledAuthority = {
  body: string
  check: (parts: ParsedParts) => boolean
  describe: string[]
  required: boolean
}

type AuthorityFilters = {
  username?: StringPartValidators
  password?: StringPartValidators
  host?: StringPartValidators
  hostname?: StringPartValidators
  port?: IntegerPartValidators
}

function compileAuthority(
  filters: AuthorityFilters,
  label: string,
): CompiledAuthority {
  if (filters.host !== undefined && filters.hostname !== undefined) {
    throw new ModelDefinitionError(
      `Invalid ${label} model: "host" and "hostname" are mutually exclusive`,
    )
  }
  if (filters.host !== undefined && filters.port !== undefined) {
    throw new ModelDefinitionError(
      `Invalid ${label} model: "host" includes the port; use "hostname" with "port" instead`,
    )
  }

  const required =
    filters.username !== undefined ||
    filters.password !== undefined ||
    filters.host !== undefined ||
    filters.hostname !== undefined ||
    filters.port !== undefined

  const username =
    filters.username === undefined
      ? undefined
      : compileStringPart(
          filters.username,
          textSpec(
            `${label}.username`,
            '[^:@/?#]',
            '(?=[:@]|$)',
            false,
            rejectDelimiters(/[:@/?#\s]/),
          ),
        )
  const password =
    filters.password === undefined
      ? undefined
      : compileStringPart(
          filters.password,
          textSpec(
            `${label}.password`,
            '[^@/?#]',
            '(?=@|$)',
            false,
            rejectDelimiters(/[@/?#\s]/),
          ),
        )
  const host =
    filters.host === undefined
      ? undefined
      : compileStringPart(
          filters.host,
          textSpec(
            `${label}.host`,
            HOST_CHAR,
            '(?=[/?#]|$)',
            true,
            rejectHostDelimiters,
          ),
        )
  if (filters.hostname !== undefined) {
    const rawEq = (filters.hostname as { eq?: unknown }).eq
    if (typeof rawEq === 'string') {
      assertHostnameEq(rawEq, `${label}.hostname`)
    }
  }
  const hostname =
    filters.hostname === undefined
      ? undefined
      : compileStringPart(
          filters.hostname,
          textSpec(
            `${label}.hostname`,
            HOSTNAME_CHAR,
            '(?=[:/?#]|$)',
            true,
            rejectHostDelimiters,
          ),
        )
  const port =
    filters.port === undefined
      ? undefined
      : compileIntegerPart(filters.port, {
          label: `${label}.port`,
          min: 0,
          max: 65535,
        })

  let userinfoBody: string
  if (username !== undefined && password !== undefined) {
    userinfoBody = `${username.body}:${password.body}@`
  } else if (username !== undefined) {
    userinfoBody = `${username.body}(?::${GENERIC_USERINFO})?@`
  } else if (password !== undefined) {
    userinfoBody = `[^:@/?#]*:${password.body}@`
  } else {
    userinfoBody = `(?:${GENERIC_USERINFO}@)?`
  }

  let hostBody: string
  if (host !== undefined) {
    hostBody = host.body
  } else {
    hostBody = hostname === undefined ? GENERIC_HOSTNAME : hostname.body
    hostBody += port === undefined ? '(?::\\d+)?' : `:${port.body}`
  }

  const describe: string[] = []
  if (username !== undefined) {
    describe.push(
      username.describe === ''
        ? 'username'
        : `username ${username.describe}`,
    )
  }
  if (password !== undefined) {
    describe.push(
      password.describe === ''
        ? 'password'
        : `password ${password.describe}`,
    )
  }
  if (host !== undefined) {
    describe.push(host.describe === '' ? 'host' : `host ${host.describe}`)
  } else {
    if (hostname !== undefined) {
      describe.push(
        hostname.describe === ''
          ? 'hostname'
          : `hostname ${hostname.describe}`,
      )
    }
    if (port !== undefined) {
      describe.push(port.describe === '' ? 'port' : `port ${port.describe}`)
    }
  }

  return {
    body: `${userinfoBody}${hostBody}`,
    required,
    describe,
    check: (parts) => {
      if (username !== undefined) {
        if (parts.username === undefined || !username.regex.test(parts.username)) {
          return false
        }
      }
      if (password !== undefined) {
        if (parts.password === undefined || !password.regex.test(parts.password)) {
          return false
        }
      }
      if (host !== undefined) {
        if (parts.host === undefined || !host.regex.test(parts.host)) {
          return false
        }
      } else {
        if (
          hostname !== undefined &&
          (parts.hostname === undefined || !hostname.regex.test(parts.hostname))
        ) {
          return false
        }
        if (
          port !== undefined &&
          (parts.port === undefined || !port.regex.test(parts.port))
        ) {
          return false
        }
      }
      return true
    },
  }
}

function compileURLParts(
  validators: URLValidators,
): CompiledFormatParts | undefined {
  const raw = validators as unknown as {
    protocol?: StringPartValidators
    username?: StringPartValidators
    password?: StringPartValidators
    host?: StringPartValidators
    hostname?: StringPartValidators
    port?: IntegerPartValidators
    pathname?: StringPartValidators
    search?: StringPartValidators
    hash?: StringPartValidators
  }
  const hasParts = URL_KEYS.some(
    (key) =>
      !['eq', 'length', 'pattern'].includes(key) &&
      raw[key as keyof typeof raw] !== undefined,
  )
  if (!hasParts) {
    return undefined
  }

  const protocol = compileURLText(
    raw.protocol,
    'URL.protocol',
    '[A-Za-z0-9+.-]',
    '(?=:|$)',
    true,
    rejectDelimiters(/[:/?#@\s]/),
  )
  const authority = compileAuthority(
    {
      username: raw.username,
      password: raw.password,
      host: raw.host,
      hostname: raw.hostname,
      port: raw.port,
    },
    'URL',
  )
  const pathname = compileURLText(
    raw.pathname,
    'URL.pathname',
    '[^?#]',
    '(?=[?#]|$)',
    false,
    rejectDelimiters(/[?#\s]/),
  )
  const search = compileURLText(
    raw.search,
    'URL.search',
    '[^#]',
    '(?=#|$)',
    false,
    rejectDelimiters(/[#\s]/),
  )
  const hash = compileURLText(
    raw.hash,
    'URL.hash',
    '[\\s\\S]',
    '(?=$)',
    false,
    rejectDelimiters(/\s/),
  )

  const body =
    `${protocol?.body ?? GENERIC_SCHEME}://${authority.body}` +
    `${pathname?.body ?? '[^?#]*'}` +
    `${search?.body ?? '(?:\\?[^#]*)?'}` +
    `${hash?.body ?? '(?:#[\\s\\S]*)?'}`

  const describe: string[] = []
  if (protocol?.describe !== undefined) {
    describe.push(`protocol ${protocol.describe}`)
  }
  describe.push(...authority.describe)
  if (pathname?.describe !== undefined) {
    describe.push(`pathname ${pathname.describe}`)
  }
  if (search?.describe !== undefined) {
    describe.push(`search ${search.describe}`)
  }
  if (hash?.describe !== undefined) {
    describe.push(`hash ${hash.describe}`)
  }

  return {
    body,
    check: (value) => {
      const parts = parseParts(value)
      if (
        parts === undefined ||
        parts.scheme === undefined ||
        parts.hostname === undefined
      ) {
        return false
      }
      if (protocol !== undefined && !protocol.regex.test(parts.scheme)) {
        return false
      }
      if (!authority.check(parts)) {
        return false
      }
      if (pathname !== undefined && !pathname.regex.test(parts.path)) {
        return false
      }
      if (search !== undefined) {
        if (parts.query === undefined || !search.regex.test(`?${parts.query}`)) {
          return false
        }
      }
      if (hash !== undefined) {
        if (
          parts.fragment === undefined ||
          !hash.regex.test(`#${parts.fragment}`)
        ) {
          return false
        }
      }
      return true
    },
    message:
      describe.length === 0
        ? 'Expected a URL'
        : `Expected a URL with ${describe.join(' and ')}`,
  }
}

function compileURIParts(
  validators: URIValidators,
  options: {
    label: string
    requireScheme: boolean
  },
): CompiledFormatParts | undefined {
  const raw = validators as unknown as {
    scheme?: StringPartValidators
    username?: StringPartValidators
    password?: StringPartValidators
    host?: StringPartValidators
    hostname?: StringPartValidators
    port?: IntegerPartValidators
    path?: StringPartValidators
    query?: StringPartValidators
    fragment?: StringPartValidators
  }
  const hasParts = URI_KEYS.some(
    (key) =>
      !['eq', 'length', 'pattern'].includes(key) &&
      raw[key as keyof typeof raw] !== undefined,
  )
  if (!hasParts) {
    return undefined
  }

  const scheme = compileURLText(
    raw.scheme,
    `${options.label}.scheme`,
    '[A-Za-z0-9+.-]',
    '(?=:|$)',
    true,
    rejectDelimiters(/[:/?#@\s]/),
  )
  const authority = compileAuthority(
    {
      username: raw.username,
      password: raw.password,
      host: raw.host,
      hostname: raw.hostname,
      port: raw.port,
    },
    options.label,
  )
  const path = compileURLText(
    raw.path,
    `${options.label}.path`,
    '[^?#]',
    '(?=[?#]|$)',
    false,
    rejectDelimiters(/[?#\s]/),
  )
  const query = compileURLText(
    raw.query,
    `${options.label}.query`,
    '[^#]',
    '(?=#|$)',
    false,
    rejectDelimiters(/[#\s]/),
  )
  const fragment = compileURLText(
    raw.fragment,
    `${options.label}.fragment`,
    '[\\s\\S]',
    '(?=$)',
    false,
    rejectDelimiters(/\s/),
  )

  const schemeBody =
    scheme !== undefined
      ? `${scheme.body}:`
      : options.requireScheme
        ? `${GENERIC_SCHEME}:`
        : `(?:${GENERIC_SCHEME}:)?`
  const authorityBody = authority.required
    ? `//${authority.body}`
    : `(?://${authority.body})?`
  const body =
    schemeBody +
    authorityBody +
    `${path?.body ?? '[^?#]*'}` +
    `${query === undefined ? '(?:\\?[^#]*)?' : `\\?${query.body}`}` +
    `${fragment === undefined ? '(?:#[\\s\\S]*)?' : `#${fragment.body}`}`

  const describe: string[] = []
  if (scheme?.describe !== undefined) {
    describe.push(`scheme ${scheme.describe}`)
  }
  describe.push(...authority.describe)
  if (path?.describe !== undefined) {
    describe.push(`path ${path.describe}`)
  }
  if (query?.describe !== undefined) {
    describe.push(`query ${query.describe}`)
  }
  if (fragment?.describe !== undefined) {
    describe.push(`fragment ${fragment.describe}`)
  }

  return {
    body,
    check: (value) => {
      const parts = parseParts(value)
      if (parts === undefined) {
        return false
      }
      if (scheme !== undefined) {
        if (parts.scheme === undefined || !scheme.regex.test(parts.scheme)) {
          return false
        }
      }
      if (authority.required) {
        if (parts.hostname === undefined || !authority.check(parts)) {
          return false
        }
      }
      if (path !== undefined && !path.regex.test(parts.path)) {
        return false
      }
      if (query !== undefined) {
        if (parts.query === undefined || !query.regex.test(parts.query)) {
          return false
        }
      }
      if (fragment !== undefined) {
        if (
          parts.fragment === undefined ||
          !fragment.regex.test(parts.fragment)
        ) {
          return false
        }
      }
      return true
    },
    message:
      describe.length === 0
        ? `Expected a ${options.label}`
        : `Expected a ${options.label} with ${describe.join(' and ')}`,
  }
}

export function url(validators?: URLValidators): StringSchema<string> {
  return buildFormatSchema({
    format: 'uri',
    label: 'URL',
    knownKeys: URL_KEYS,
    validators,
    compile: compileURLParts,
  })
}

export function uri(validators?: URIValidators): StringSchema<string> {
  return buildFormatSchema({
    format: 'uri',
    label: 'uri',
    knownKeys: URI_KEYS,
    validators,
    compile: (value) =>
      compileURIParts(value, {
        label: 'uri',
        requireScheme: true,
      }),
  })
}

export function iri(validators?: URIValidators): StringSchema<string> {
  return buildFormatSchema({
    format: 'iri',
    label: 'iri',
    knownKeys: URI_KEYS,
    validators,
    compile: (value) =>
      compileURIParts(value, {
        label: 'iri',
        requireScheme: true,
      }),
  })
}

export function uriReference(
  validators?: URIValidators,
): StringSchema<string> {
  return buildFormatSchema({
    format: 'uri-reference',
    label: 'uri-reference',
    knownKeys: URI_KEYS,
    validators,
    compile: (value) =>
      compileURIParts(value, {
        label: 'uri-reference',
        requireScheme: false,
      }),
  })
}

export function iriReference(
  validators?: URIValidators,
): StringSchema<string> {
  return buildFormatSchema({
    format: 'iri-reference',
    label: 'iri-reference',
    knownKeys: URI_KEYS,
    validators,
    compile: (value) =>
      compileURIParts(value, {
        label: 'iri-reference',
        requireScheme: false,
      }),
  })
}
