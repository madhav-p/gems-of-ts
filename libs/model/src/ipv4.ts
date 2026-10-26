import { buildFormatSchema, type CompiledFormatParts } from './format-schema'
import type { NumberOptions } from './number'
import {
  compileIntegerPart,
  type CompiledIntegerPart,
  type IntegerPartValidators,
} from './parts'
import type { StringSchema } from './string'

type IPv4PartKey = 'octet1' | 'octet2' | 'octet3' | 'octet4'
type NoIPv4Filters = { [K in IPv4PartKey]?: never }

type IPv4Base = {
  eq?: never
  length?: NumberOptions
}

type IPv4Parts = {
  octet1?: IntegerPartValidators
  octet2?: IntegerPartValidators
  octet3?: IntegerPartValidators
  octet4?: IntegerPartValidators
}

export type IPv4Validators =
  | ({ eq: string; length?: never; pattern?: never } & NoIPv4Filters)
  | (IPv4Base & IPv4Parts & ({ pattern: RegExp } | { pattern?: never }))

export type IPv4Factory = (validators?: IPv4Validators) => StringSchema<string>

const IPV4_KEYS: readonly string[] = [
  'eq',
  'length',
  'pattern',
  'octet1',
  'octet2',
  'octet3',
  'octet4',
]

const DEFAULT_OCTET = '(?:0|[1-9]\\d?|1\\d{2}|2[0-4]\\d|25[0-5])'
const OCTETS = /^([^.]+)\.([^.]+)\.([^.]+)\.([^.]+)$/

function compileOctet(
  value: IntegerPartValidators | undefined,
  label: string,
): CompiledIntegerPart | undefined {
  return value === undefined
    ? undefined
    : compileIntegerPart(value, {
        label,
        min: 0,
        max: 255,
      })
}

function compileIPv4Parts(
  validators: IPv4Validators,
): CompiledFormatParts | undefined {
  const raw = validators as IPv4Parts
  if (
    raw.octet1 === undefined &&
    raw.octet2 === undefined &&
    raw.octet3 === undefined &&
    raw.octet4 === undefined
  ) {
    return undefined
  }

  const octet1 = compileOctet(raw.octet1, 'ipv4.octet1')
  const octet2 = compileOctet(raw.octet2, 'ipv4.octet2')
  const octet3 = compileOctet(raw.octet3, 'ipv4.octet3')
  const octet4 = compileOctet(raw.octet4, 'ipv4.octet4')
  const parts = [octet1, octet2, octet3, octet4]
  const body = parts.map((part) => part?.body ?? DEFAULT_OCTET).join('\\.')
  const describe = parts.flatMap((part, index) =>
    part?.describe === undefined || part.describe === ''
      ? []
      : [`octet ${index + 1} ${part.describe}`],
  )

  return {
    body,
    check: (value) => {
      const match = OCTETS.exec(value)
      if (match === null) {
        return false
      }
      for (let index = 0; index < 4; index += 1) {
        const part = parts[index]
        if (part !== undefined && !part.regex.test(match[index + 1]!)) {
          return false
        }
      }
      return true
    },
    message:
      describe.length === 0
        ? 'Expected an IPv4 address'
        : `Expected an IPv4 address with ${describe.join(' and ')}`,
  }
}

export function ipv4(validators?: IPv4Validators): StringSchema<string> {
  return buildFormatSchema({
    format: 'ipv4',
    label: 'ipv4',
    knownKeys: IPV4_KEYS,
    validators,
    compile: compileIPv4Parts,
  })
}
