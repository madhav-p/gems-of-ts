/// <reference types="node" />
export type StringValidator = (value: string) => string | undefined

export type StringFormatSpec = {
  validate: StringValidator
  parts?: Record<string, (value: string) => string | undefined>
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/
const DURATION =
  /^P(?=\d|T\d)(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/
const EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/
const IDN_EMAIL = /^[^\s@]+@[^\s@]+$/
const HOSTNAME_LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?'
const HOSTNAME = new RegExp(`^(?=.{1,253}$)(?:${HOSTNAME_LABEL}\\.)*${HOSTNAME_LABEL}\\.?$`)
const IPV4_OCTET = /^(0|[1-9]\d{0,2})$/
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/
const URI_REFERENCE =
  /^(?:[A-Za-z][A-Za-z0-9+.-]*:)?(?:\/\/[^/?#]*)?[^?#]*(?:\?[^#]*)?(?:#.*)?$/
const URI_TEMPLATE_EXPRESSION = /\{[^{}]*\}/g
const JSON_POINTER = /^(?:\/(?:[^~/]|~[01])*)*$/
const RELATIVE_JSON_POINTER = /^(?:0|[1-9]\d*)(?:#|(?:\/(?:[^~/]|~[01])*)*)$/
const BAD_URI_CHARS = /[\s<>"{}|\\^`]/
const BAD_PERCENT = /%(?![0-9A-Fa-f]{2})/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function check(valid: boolean, message: string): string | undefined {
  return valid ? undefined : message
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    default:
      return 31
  }
}

function isDate(value: string): boolean {
  const match = DATE.exec(value)
  if (!match) {
    return false
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

function isTime(value: string): boolean {
  const match = TIME.exec(value)
  if (!match) {
    return false
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3])
  if (hour > 23 || minute > 59 || second > 60) {
    return false
  }
  if (match[4] !== undefined) {
    const offsetHour = Number(match[5])
    const offsetMinute = Number(match[6])
    if (offsetHour > 23 || offsetMinute > 59) {
      return false
    }
  }
  return true
}

function isDateTime(value: string): boolean {
  const index = value.search(/[Tt]/)
  return index !== -1 && isDate(value.slice(0, index)) && isTime(value.slice(index + 1))
}

function isIPV4(value: string): boolean {
  const parts = value.split('.')
  return (
    parts.length === 4 &&
    parts.every((part) => IPV4_OCTET.test(part) && Number(part) <= 255)
  )
}

function isHexGroup(value: string): boolean {
  return /^[0-9a-fA-F]{1,4}$/.test(value)
}

function isIPV6(value: string): boolean {
  if (!value.includes(':') || value.includes('%')) {
    return false
  }
  const compressed = value.split('::')
  if (compressed.length > 2) {
    return false
  }
  const parseSide = (side: string): string[] => (side.length > 0 ? side.split(':') : [])
  const left = parseSide(compressed[0] ?? '')
  const right = parseSide(compressed[1] ?? '')
  const groups = compressed.length === 2 ? [...left, ...right] : left

  let ipv4Groups = 0
  const last = groups[groups.length - 1]
  if (last !== undefined && last.includes('.')) {
    if (!isIPV4(last)) {
      return false
    }
    ipv4Groups = 2
    groups.pop()
  }
  if (!groups.every(isHexGroup)) {
    return false
  }
  const total = groups.length + ipv4Groups
  return compressed.length === 2 ? total < 8 : total === 8
}

function isIdnHostname(value: string): boolean {
  if (value.length === 0 || value.length > 253) {
    return false
  }
  const trimmed = value.endsWith('.') ? value.slice(0, -1) : value
  if (trimmed.length === 0) {
    return false
  }
  return trimmed.split('.').every((label) => {
    if (label.length === 0 || label.length > 63) {
      return false
    }
    if (label.startsWith('-') || label.endsWith('-')) {
      return false
    }
    return !/[\s/\\?#@:<>"{}|^`]/.test(label)
  })
}

function hasValidUriCharacters(value: string): boolean {
  return !BAD_URI_CHARS.test(value) && !BAD_PERCENT.test(value)
}

function isUri(value: string): boolean {
  if (!hasValidUriCharacters(value) || !URI_SCHEME.test(value)) {
    return false
  }
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function isUriReference(value: string): boolean {
  if (!hasValidUriCharacters(value)) {
    return false
  }
  if (URI_SCHEME.test(value)) {
    try {
      new URL(value)
      return true
    } catch {
      return false
    }
  }
  return URI_REFERENCE.test(value)
}

function isUriTemplate(value: string): boolean {
  if (/[\s<>"\\^`|]/.test(value) || BAD_PERCENT.test(value)) {
    return false
  }
  if (/[{}]/.test(value.replace(URI_TEMPLATE_EXPRESSION, ''))) {
    return false
  }
  for (const match of value.matchAll(URI_TEMPLATE_EXPRESSION)) {
    const expression = match[0].slice(1, -1)
    if (!/^[+#./;?&]?[A-Za-z0-9_%][A-Za-z0-9_.%,*:]*$/.test(expression)) {
      return false
    }
  }
  return true
}

function isRegex(value: string): boolean {
  try {
    new RegExp(value)
    return true
  } catch {
    return false
  }
}

function hostnameOf(value: string): string | undefined {
  try {
    return new URL(value).hostname
  } catch {
    return undefined
  }
}

function emailDomain(value: string): string | undefined {
  return value.slice(value.lastIndexOf('@') + 1)
}

const format = (
  validate: StringValidator,
  parts?: Record<string, (value: string) => string | undefined>,
): StringFormatSpec => (parts ? { validate, parts } : { validate })

/**
 * Every string `format` defined by JSON Schema, with a dependency-free
 * validator. Keys are the canonical JSON Schema names (`date-time`,
 * `uri-reference`, …).
 */
export const stringFormats = {
  'date-time': format((value) =>
    check(isDateTime(value), 'Expected a valid date-time'),
  ),
  date: format((value) => check(isDate(value), 'Expected a valid date')),
  time: format((value) => check(isTime(value), 'Expected a valid time')),
  duration: format((value) => check(DURATION.test(value), 'Expected a valid duration')),
  email: format(
    (value) => check(EMAIL.test(value), 'Expected a valid email address'),
    { domain: emailDomain },
  ),
  'idn-email': format(
    (value) => check(IDN_EMAIL.test(value), 'Expected a valid internationalized email address'),
    { domain: emailDomain },
  ),
  hostname: format((value) => check(HOSTNAME.test(value), 'Expected a valid hostname')),
  'idn-hostname': format((value) =>
    check(isIdnHostname(value), 'Expected a valid internationalized hostname'),
  ),
  ipv4: format((value) => check(isIPV4(value), 'Expected a valid IPv4 address')),
  ipv6: format((value) => check(isIPV6(value), 'Expected a valid IPv6 address')),
  uri: format((value) => check(isUri(value), 'Expected a valid URI'), { domain: hostnameOf }),
  'uri-reference': format((value) =>
    check(isUriReference(value), 'Expected a valid URI reference'),
  ),
  iri: format((value) => check(isUri(value), 'Expected a valid IRI'), { domain: hostnameOf }),
  'iri-reference': format((value) =>
    check(isUriReference(value), 'Expected a valid IRI reference'),
  ),
  uuid: format((value) => check(UUID.test(value), 'Expected a valid UUID')),
  'uri-template': format((value) =>
    check(isUriTemplate(value), 'Expected a valid URI template'),
  ),
  'json-pointer': format((value) =>
    check(JSON_POINTER.test(value), 'Expected a valid JSON pointer'),
  ),
  'relative-json-pointer': format((value) =>
    check(RELATIVE_JSON_POINTER.test(value), 'Expected a valid relative JSON pointer'),
  ),
  regex: format((value) => check(isRegex(value), 'Expected a valid regular expression')),
} satisfies Record<string, StringFormatSpec>

/** A canonical JSON Schema string format name. */
export type StringFormat = keyof typeof stringFormats
