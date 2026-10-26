import { ModelDefinitionError } from './errors'
import { buildFormatSchema, type CompiledFormatParts } from './format-schema'
import type { NumberOptions } from './number'
import {
  compileIntegerPart,
  compileStringPart,
  type CompiledIntegerPart,
  type CompiledTextPart,
  type IntegerPartValidators,
  type StringPartValidators,
} from './parts'
import type { StringSchema } from './string'

type HostnamePartKey = 'tld' | 'labels'
type NoHostnameFilters = { [K in HostnamePartKey]?: never }

type HostnameBase = {
  eq?: never
  length?: NumberOptions
}

type HostnameParts = {
  tld?: StringPartValidators
  labels?: IntegerPartValidators
}

export type HostnameValidators =
  | ({ eq: string; length?: never; pattern?: never } & NoHostnameFilters)
  | (HostnameBase &
      HostnameParts &
      ({ pattern: RegExp } | { pattern?: never }))

export type HostnameFactory = (
  validators?: HostnameValidators,
) => StringSchema<string>

const HOSTNAME_KEYS: readonly string[] = [
  'eq',
  'length',
  'pattern',
  'tld',
  'labels',
]

function rejectDots(value: string, label: string): void {
  if (value.includes('.')) {
    throw new ModelDefinitionError(
      `Invalid ${label} model: "tld" must be a single label`,
    )
  }
}

function compileTld(
  value: StringPartValidators | undefined,
  label: string,
): CompiledTextPart | undefined {
  return value === undefined
    ? undefined
    : compileStringPart(value, {
        label,
        char: '[^.]',
        boundary: '(?=\\.|$)',
        caseInsensitive: true,
        checkLiteral: rejectDots,
      })
}

function labelCountPattern(
  minLabels: number,
  maxLabels: number,
): string {
  const minDots = minLabels - 1
  if (minLabels === maxLabels) {
    return `(?:[^.]+\\.){${minDots}}[^.]+\\.?$`
  }
  return (
    `(?:[^.]+\\.){${minDots}}[^.]+` +
    `(?:\\.[^.]+){0,${maxLabels - minLabels}}\\.?$`
  )
}

function compileHostnameParts(
  validators: HostnameValidators,
  label: string,
): CompiledFormatParts | undefined {
  const raw = validators as HostnameParts
  if (raw.tld === undefined && raw.labels === undefined) {
    return undefined
  }

  const tld = compileTld(raw.tld, `${label}.tld`)
  const labels: CompiledIntegerPart | undefined =
    raw.labels === undefined
      ? undefined
      : compileIntegerPart(raw.labels, {
          label: `${label}.labels`,
          min: 1,
          max: 127,
        })
  const tldBody = tld?.body ?? '[^.]+'

  let body: string
  if (labels !== undefined) {
    const upper = labels.upper ?? labels.lower
    const counted = labelCountPattern(labels.lower, upper)
    body =
      tld === undefined
        ? counted
        : `(?=${counted})(?:[^.]+\\.)*${tldBody}\\.?`
  } else {
    body = `(?:[^.]+\\.)*${tldBody}\\.?`
  }

  const describe: string[] = []
  if (tld?.describe !== undefined) {
    describe.push(tld.describe === '' ? 'tld' : `tld ${tld.describe}`)
  }
  if (labels?.describe !== undefined) {
    describe.push(
      labels.describe === '' ? 'label count' : `label count ${labels.describe}`,
    )
  }

  return {
    body,
    check: (value) => {
      const trimmed = value.endsWith('.') ? value.slice(0, -1) : value
      const parts = trimmed.split('.')
      if (tld !== undefined) {
        const last = parts[parts.length - 1]!
        if (!tld.regex.test(last)) {
          return false
        }
      }
      if (labels !== undefined && !labels.regex.test(String(parts.length))) {
        return false
      }
      return true
    },
    message:
      describe.length === 0
        ? `Expected a ${label}`
        : `Expected a ${label} with ${describe.join(' and ')}`,
  }
}

export function hostname(
  validators?: HostnameValidators,
): StringSchema<string> {
  return buildFormatSchema({
    format: 'hostname',
    label: 'hostname',
    knownKeys: HOSTNAME_KEYS,
    validators,
    compile: (value) => compileHostnameParts(value, 'hostname'),
  })
}

export function idnHostname(
  validators?: HostnameValidators,
): StringSchema<string> {
  return buildFormatSchema({
    format: 'idn-hostname',
    label: 'idn-hostname',
    knownKeys: HOSTNAME_KEYS,
    validators,
    compile: (value) => compileHostnameParts(value, 'idn-hostname'),
  })
}
