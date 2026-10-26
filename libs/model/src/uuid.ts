import { buildFormatSchema, type CompiledFormatParts } from './format-schema'
import type { NumberOptions } from './number'
import {
  compileHexNibble,
  type CompiledIntegerPart,
  type IntegerPartValidators,
} from './parts'
import type { StringSchema } from './string'

type UUIDPartKey = 'version' | 'variant'
type NoUUIDFilters = { [K in UUIDPartKey]?: never }

type UUIDBase = {
  eq?: never
  length?: NumberOptions
}

type UUIDParts = {
  version?: IntegerPartValidators
  variant?: IntegerPartValidators
}

export type UUIDValidators =
  | ({ eq: string; length?: never; pattern?: never } & NoUUIDFilters)
  | (UUIDBase & UUIDParts & ({ pattern: RegExp } | { pattern?: never }))

export type UUIDFactory = (validators?: UUIDValidators) => StringSchema<string>

const UUID_KEYS: readonly string[] = [
  'eq',
  'length',
  'pattern',
  'version',
  'variant',
]

const HEX = '[0-9a-fA-F]'
const UUID_PARTS =
  /^([0-9a-fA-F]{8})-([0-9a-fA-F]{4})-([0-9a-fA-F])([0-9a-fA-F]{3})-([0-9a-fA-F])([0-9a-fA-F]{3})-([0-9a-fA-F]{12})$/

function compileUUIDParts(
  validators: UUIDValidators,
): CompiledFormatParts | undefined {
  const raw = validators as UUIDParts
  if (raw.version === undefined && raw.variant === undefined) {
    return undefined
  }

  const version: CompiledIntegerPart | undefined =
    raw.version === undefined
      ? undefined
      : compileHexNibble(raw.version, 'uuid.version')
  const variant: CompiledIntegerPart | undefined =
    raw.variant === undefined
      ? undefined
      : compileHexNibble(raw.variant, 'uuid.variant')

  const body =
    `${HEX}{8}-${HEX}{4}-${version?.body ?? HEX}${HEX}{3}-` +
    `${variant?.body ?? HEX}${HEX}{3}-${HEX}{12}`

  const describe: string[] = []
  if (version?.describe !== undefined) {
    describe.push(`version ${version.describe}`)
  }
  if (variant?.describe !== undefined) {
    describe.push(`variant ${variant.describe}`)
  }

  return {
    body,
    check: (value) => {
      const match = UUID_PARTS.exec(value)
      if (match === null) {
        return false
      }
      if (version !== undefined && !version.regex.test(match[3]!)) {
        return false
      }
      if (variant !== undefined && !variant.regex.test(match[5]!)) {
        return false
      }
      return true
    },
    message:
      describe.length === 0
        ? 'Expected a UUID'
        : `Expected a UUID with ${describe.join(' and ')}`,
  }
}

export function uuid(validators?: UUIDValidators): StringSchema<string> {
  return buildFormatSchema({
    format: 'uuid',
    label: 'uuid',
    knownKeys: UUID_KEYS,
    validators,
    compile: compileUUIDParts,
  })
}
