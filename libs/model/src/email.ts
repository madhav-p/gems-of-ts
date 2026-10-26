import { ModelDefinitionError } from './errors'
import { buildFormatSchema, type CompiledFormatParts } from './format-schema'
import type { NumberOptions } from './number'
import {
  compileStringPart,
  type CompiledTextPart,
  type StringPartValidators,
} from './parts'
import type { StringSchema } from './string'

type EmailPartKey = 'local' | 'domain'
type NoEmailFilters = { [K in EmailPartKey]?: never }

type EmailBase = {
  eq?: never
  length?: NumberOptions
}

type EmailParts = {
  local?: StringPartValidators
  domain?: StringPartValidators
}

export type EmailValidators =
  | ({ eq: string; length?: never; pattern?: never } & NoEmailFilters)
  | (EmailBase &
      EmailParts &
      ({ pattern: RegExp } | { pattern?: never }))

export type EmailFactory = (validators?: EmailValidators) => StringSchema<string>

const EMAIL_KEYS: readonly string[] = [
  'eq',
  'length',
  'pattern',
  'local',
  'domain',
]

function rejectEmailDelimiters(value: string, label: string): void {
  if (/[@\s]/.test(value)) {
    throw new ModelDefinitionError(
      `Invalid ${label} model: literal contains an email delimiter`,
    )
  }
}

function compileEmailPart(
  value: StringPartValidators | undefined,
  label: string,
  boundary: string,
  caseInsensitive: boolean,
): CompiledTextPart | undefined {
  return value === undefined
    ? undefined
    : compileStringPart(value, {
        label,
        char: '[^@]',
        boundary,
        caseInsensitive,
        checkLiteral: rejectEmailDelimiters,
      })
}

function compileEmailParts(
  validators: EmailValidators,
  label: string,
): CompiledFormatParts | undefined {
  const raw = validators as unknown as {
    local?: StringPartValidators
    domain?: StringPartValidators
  }
  if (raw.local === undefined && raw.domain === undefined) {
    return undefined
  }

  const local = compileEmailPart(
    raw.local,
    `${label}.local`,
    '(?=@|$)',
    false,
  )
  const domain = compileEmailPart(
    raw.domain,
    `${label}.domain`,
    '(?=$)',
    true,
  )
  const body = `${local?.body ?? '[^@]+'}@${domain?.body ?? '[^@]+'}`
  const describe: string[] = []
  if (local?.describe !== undefined) {
    describe.push(
      local.describe === '' ? 'local part' : `local part ${local.describe}`,
    )
  }
  if (domain?.describe !== undefined) {
    describe.push(
      domain.describe === '' ? 'domain' : `domain ${domain.describe}`,
    )
  }

  return {
    body,
    check: (value) => {
      const index = value.lastIndexOf('@')
      if (index === -1) {
        return false
      }
      const localValue = value.slice(0, index)
      const domainValue = value.slice(index + 1)
      if (local !== undefined && !local.regex.test(localValue)) {
        return false
      }
      if (domain !== undefined && !domain.regex.test(domainValue)) {
        return false
      }
      return true
    },
    message:
      describe.length === 0
        ? `Expected an ${label}`
        : `Expected an ${label} with ${describe.join(' and ')}`,
  }
}

export function email(validators?: EmailValidators): StringSchema<string> {
  return buildFormatSchema({
    format: 'email',
    label: 'email',
    knownKeys: EMAIL_KEYS,
    validators,
    compile: (value) => compileEmailParts(value, 'email'),
  })
}

export function idnEmail(validators?: EmailValidators): StringSchema<string> {
  return buildFormatSchema({
    format: 'idn-email',
    label: 'idn-email',
    knownKeys: EMAIL_KEYS,
    validators,
    compile: (value) => compileEmailParts(value, 'idn-email'),
  })
}
