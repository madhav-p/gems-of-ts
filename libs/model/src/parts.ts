import { ModelDefinitionError } from './errors'
import { compileLength } from './length'
import type { NumberOptions } from './number'

type NoPartConstraints = {
  length?: never
  matches?: never
  startsWith?: never
  endsWith?: never
  includes?: never
}

type PartEq = {
  eq: string
} & NoPartConstraints

type PartTextMatch =
  | {
      matches: RegExp
      startsWith?: never
      endsWith?: never
      includes?: never
    }
  | {
      matches?: never
      startsWith?: string
      endsWith?: string
      includes?: string
    }

export type PartLengthOptions = NumberOptions & {
  multipleOf?: never
}

type PartConstraints = {
  eq?: never
  length?: PartLengthOptions
} & PartTextMatch

/**
 * Validators for a text part of a string format. `matches` is a full-part
 * regular expression; `startsWith`, `endsWith`, and `includes` are literal
 * text matches. `eq` is mutually exclusive with every other constraint.
 */
export type StringPartValidators = PartEq | PartConstraints

type NoIntegerBounds = {
  min?: never
  max?: never
  gt?: never
  lt?: never
}

type IntegerEq = {
  eq: number
  int?: true
  multipleOf?: never
} & NoIntegerBounds

type IntegerBounds =
  | { min?: number; max?: number; gt?: never; lt?: never }
  | { min?: number; lt?: number; gt?: never; max?: never }
  | { gt?: number; max?: number; min?: never; lt?: never }
  | { gt?: number; lt?: number; min?: never; max?: never }

type IntegerRange = {
  eq?: never
  int?: true
  multipleOf?: never
} & IntegerBounds

/**
 * Validators for an integer part of a string format. `multipleOf` is not
 * supported because every filter is compiled into a regular expression.
 */
export type IntegerPartValidators = IntegerEq | IntegerRange

export function isOptionsObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function assertKnownKeys(
  value: object,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new ModelDefinitionError(
        `Invalid ${label} model: unknown option "${key}"`,
      )
    }
  }
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function stripAnchors(source: string): string {
  let result = source
  if (result.startsWith('^') && !result.startsWith('\\^')) {
    result = result.slice(1)
  }
  if (result.endsWith('$') && !result.endsWith('\\$')) {
    result = result.slice(0, -1)
  }
  return result
}

function charRange(lo: number, hi: number): string {
  return lo === hi ? String(lo) : `[${lo}-${hi}]`
}

function paddedRange(lo: string, hi: string): string {
  if (lo === hi) {
    return lo
  }
  if (lo.length === 1) {
    return charRange(Number(lo), Number(hi))
  }
  if (lo === '0'.repeat(lo.length) && hi === '9'.repeat(hi.length)) {
    return `\\d{${lo.length}}`
  }
  const loDigit = Number(lo[0])
  const hiDigit = Number(hi[0])
  if (loDigit === hiDigit) {
    return lo[0]! + paddedRange(lo.slice(1), hi.slice(1))
  }
  const parts = [lo[0]! + paddedRange(lo.slice(1), '9'.repeat(lo.length - 1))]
  if (hiDigit - loDigit > 1) {
    parts.push(`${charRange(loDigit + 1, hiDigit - 1)}\\d{${lo.length - 1}}`)
  }
  parts.push(hi[0]! + paddedRange('0'.repeat(hi.length - 1), hi.slice(1)))
  return `(?:${parts.join('|')})`
}

/**
 * Compiles an inclusive integer range into a regex source. Leading zeros are
 * not accepted (except for the value `0`).
 */
export function rangeToPattern(min: number, max: number): string {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
    throw new ModelDefinitionError('Invalid model: invalid integer range')
  }
  if (min === max) {
    return String(min)
  }

  const parts: string[] = []
  const minDigits = String(min).length
  const maxDigits = String(max).length
  for (let width = minDigits; width <= maxDigits; width += 1) {
    const lower = Math.max(min, width === 1 ? 0 : 10 ** (width - 1))
    const upper = Math.min(max, 10 ** width - 1)
    if (lower <= upper) {
      parts.push(
        paddedRange(
          String(lower).padStart(width, '0'),
          String(upper).padStart(width, '0'),
        ),
      )
    }
  }
  return parts.length === 1 ? parts[0]! : `(?:${parts.join('|')})`
}

/** Compiles a `>= min` integer range with no upper bound. */
export function rangeToPatternOpenEnd(min: number): string {
  if (!Number.isInteger(min) || min < 0) {
    throw new ModelDefinitionError('Invalid model: invalid integer range')
  }
  if (min === 0) {
    return '(?:0|[1-9]\\d*)'
  }
  const digits = String(min).length
  const top = 10 ** digits - 1
  const bounded = rangeToPattern(min, top)
  const larger = `[1-9]\\d{${digits},}`
  return `(?:${bounded}|${larger})`
}

export function describeLength(
  minLength: number | undefined,
  maxLength: number | undefined,
): string {
  if (minLength !== undefined && maxLength !== undefined) {
    return minLength === maxLength
      ? `with length ${minLength}`
      : `with length between ${minLength} and ${maxLength}`
  }
  if (minLength !== undefined) {
    return `with length at least ${minLength}`
  }
  if (maxLength !== undefined) {
    return `with length at most ${maxLength}`
  }
  return ''
}

export function compilePartLength(
  options: PartLengthOptions,
  label: string,
): ReturnType<typeof compileLength> {
  if (!isOptionsObject(options)) {
    throw new ModelDefinitionError(
      `Invalid ${label} model: "length" must be an options object`,
    )
  }
  assertKnownKeys(
    options,
    ['eq', 'min', 'max', 'gt', 'lt', 'int', 'multipleOf'],
    `${label}.length`,
  )
  const multipleOf = (options as { multipleOf?: unknown }).multipleOf
  if (multipleOf !== undefined) {
    throw new ModelDefinitionError(
      `Invalid ${label} model: "length.multipleOf" is not supported`,
    )
  }
  try {
    return compileLength(options, 'string')
  } catch (error) {
    if (error instanceof ModelDefinitionError) {
      throw new ModelDefinitionError(
        error.message.replace(
          /^Invalid string model: /,
          `Invalid ${label} model: `,
        ),
      )
    }
    throw error
  }
}

export type CompiledTextPart = {
  body: string
  regex: RegExp
  describe: string
}

export type StringPartSpec = {
  /** Error label, e.g. `"email.local"`. */
  label: string
  /** Regex source matching one character of the part. */
  char: string
  /** Lookahead matching the delimiter after the part (or end of input). */
  boundary: string
  caseInsensitive?: boolean
  /** Rejects literals that can never occur in this part. */
  checkLiteral?: (value: string, label: string) => void
}

export function compileStringPart(
  options: StringPartValidators,
  spec: StringPartSpec,
): CompiledTextPart {
  if (!isOptionsObject(options)) {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: options must be an object`,
    )
  }
  assertKnownKeys(
    options,
    ['eq', 'length', 'matches', 'startsWith', 'endsWith', 'includes'],
    spec.label,
  )
  const raw = options as unknown as {
    eq?: unknown
    length?: PartLengthOptions
    matches?: unknown
    startsWith?: unknown
    endsWith?: unknown
    includes?: unknown
  }
  const { eq, length, matches, startsWith, endsWith, includes } = raw
  const hasText =
    startsWith !== undefined || endsWith !== undefined || includes !== undefined

  if (eq !== undefined) {
    if (typeof eq !== 'string') {
      throw new ModelDefinitionError(
        `Invalid ${spec.label} model: "eq" must be a string`,
      )
    }
    if (length !== undefined || matches !== undefined || hasText) {
      throw new ModelDefinitionError(
        `Invalid ${spec.label} model: "eq" cannot be combined with other constraints`,
      )
    }
    spec.checkLiteral?.(eq, spec.label)
    const source = escapeRegExp(eq)
    const body = spec.caseInsensitive ? `(?i:${source})` : source
    return {
      body,
      regex: new RegExp(`^(?:${body})$`, spec.caseInsensitive ? 'i' : ''),
      describe: `equal to ${JSON.stringify(eq)}`,
    }
  }

  if (matches !== undefined && !(matches instanceof RegExp)) {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: "matches" must be a RegExp`,
    )
  }
  if (matches !== undefined && hasText) {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: "matches" cannot be combined with startsWith, endsWith, or includes`,
    )
  }
  if (startsWith !== undefined && typeof startsWith !== 'string') {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: "startsWith" must be a string`,
    )
  }
  if (endsWith !== undefined && typeof endsWith !== 'string') {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: "endsWith" must be a string`,
    )
  }
  if (includes !== undefined && typeof includes !== 'string') {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: "includes" must be a string`,
    )
  }
  const startsWithText = startsWith as string | undefined
  const endsWithText = endsWith as string | undefined
  const includesText = includes as string | undefined
  if (startsWithText !== undefined) {
    spec.checkLiteral?.(startsWithText, spec.label)
  }
  if (endsWithText !== undefined) {
    spec.checkLiteral?.(endsWithText, spec.label)
  }
  if (includesText !== undefined) {
    spec.checkLiteral?.(includesText, spec.label)
  }

  const lookaheads: string[] = []
  const descriptions: string[] = []
  if (length !== undefined) {
    const lengthDef = compilePartLength(length, spec.label)
    if (
      lengthDef.minLength !== undefined ||
      lengthDef.maxLength !== undefined
    ) {
      lookaheads.push(
        `(?=${spec.char}{${lengthDef.minLength ?? 0},${lengthDef.maxLength ?? ''}}${spec.boundary})`,
      )
    }
    const description = describeLength(lengthDef.minLength, lengthDef.maxLength)
    if (description !== '') {
      descriptions.push(description)
    }
  }
  if (includesText !== undefined) {
    lookaheads.push(`(?=${spec.char}*${escapeRegExp(includesText)})`)
  }

  let body: string
  let runtime: string
  const flags = new Set<string>()
  if (matches !== undefined) {
    body = `(?:${stripAnchors(matches.source)})`
    runtime = `(?:${matches.source})`
    for (const flag of matches.flags.replace(/[gy]/g, '')) {
      flags.add(flag)
    }
    descriptions.push(`matching ${matches.source}`)
  } else if (hasText) {
    const start =
      startsWithText !== undefined ? escapeRegExp(startsWithText) : ''
    const end = endsWithText !== undefined ? escapeRegExp(endsWithText) : ''
    body =
      start === '' && end === ''
        ? `${spec.char}*`
        : `${start}${spec.char}*${end}`
    runtime = body
    if (startsWithText !== undefined) {
      descriptions.push(`starting with ${JSON.stringify(startsWithText)}`)
    }
    if (endsWithText !== undefined) {
      descriptions.push(`ending with ${JSON.stringify(endsWithText)}`)
    }
    if (includesText !== undefined) {
      descriptions.push(`including ${JSON.stringify(includesText)}`)
    }
  } else {
    body = `${spec.char}*`
    runtime = body
  }

  if (spec.caseInsensitive) {
    flags.add('i')
  }

  let regex: RegExp
  try {
    regex = new RegExp(
      `^(?:${lookaheads.join('')}${runtime})$`,
      [...flags].join(''),
    )
  } catch {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: "matches" is not a valid regular expression`,
    )
  }

  const inner = lookaheads.join('') + body
  return {
    body: spec.caseInsensitive ? `(?i:${inner})` : inner,
    regex,
    describe: descriptions.join(' and '),
  }
}

type RequireIntegerOptions = {
  label: string
  min: number
  max?: number
  width?: number
}

function requirePartInteger(
  value: unknown,
  name: string,
  spec: RequireIntegerOptions,
): number | undefined {
  if (value === undefined) {
    return undefined
  }
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < spec.min ||
    (spec.max !== undefined && value > spec.max)
  ) {
    const bounds =
      spec.max === undefined
        ? `at least ${spec.min}`
        : `between ${spec.min} and ${spec.max}`
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: "${name}" must be an integer ${bounds}`,
    )
  }
  if (spec.width !== undefined && value > 10 ** spec.width - 1) {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: "${name}" must fit in ${spec.width} digits`,
    )
  }
  return value
}

export type CompiledIntegerPart = {
  body: string
  regex: RegExp
  describe: string
  lower: number
  upper?: number
}

export type IntegerPartSpec = RequireIntegerOptions & {
  allowLeadingZeros?: boolean
}

export function compileIntegerPart(
  options: IntegerPartValidators,
  spec: IntegerPartSpec,
): CompiledIntegerPart {
  if (!isOptionsObject(options)) {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: options must be an object`,
    )
  }
  assertKnownKeys(
    options,
    ['eq', 'min', 'max', 'gt', 'lt', 'int', 'multipleOf'],
    spec.label,
  )
  const raw = options as unknown as {
    eq?: unknown
    min?: unknown
    max?: unknown
    gt?: unknown
    lt?: unknown
    int?: unknown
    multipleOf?: unknown
  }
  if (raw.int !== undefined && raw.int !== true) {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: "int" cannot be false`,
    )
  }
  if (raw.multipleOf !== undefined) {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: "multipleOf" is not supported`,
    )
  }

  const eq = requirePartInteger(raw.eq, 'eq', spec)
  const min = requirePartInteger(raw.min, 'min', spec)
  const max = requirePartInteger(raw.max, 'max', spec)
  const gt = requirePartInteger(raw.gt, 'gt', spec)
  const lt = requirePartInteger(raw.lt, 'lt', spec)

  if (
    eq !== undefined &&
    (min !== undefined || max !== undefined || gt !== undefined || lt !== undefined)
  ) {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: "eq" cannot be combined with bounds`,
    )
  }
  if (min !== undefined && gt !== undefined) {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: use either "min" or "gt", not both`,
    )
  }
  if (max !== undefined && lt !== undefined) {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: use either "max" or "lt", not both`,
    )
  }

  let lower: number
  let upper: number | undefined
  if (eq !== undefined) {
    lower = eq
    upper = eq
  } else {
    lower = min ?? (gt !== undefined ? gt + 1 : spec.min)
    upper =
      max ?? (lt !== undefined ? lt - 1 : spec.max)
  }
  if (upper !== undefined && lower > upper) {
    throw new ModelDefinitionError(
      `Invalid ${spec.label} model: range is empty`,
    )
  }
  if (spec.max !== undefined && upper !== undefined && upper > spec.max) {
    upper = spec.max
  }

  let body: string
  if (spec.width !== undefined) {
    const width = spec.width
    const lo = String(lower).padStart(width, '0')
    const hi = String(upper ?? lower).padStart(width, '0')
    body = paddedRange(lo, hi)
  } else {
    const base =
      upper === undefined
        ? rangeToPatternOpenEnd(lower)
        : rangeToPattern(lower, upper)
    body = spec.allowLeadingZeros ? `0*(?:${base})` : base
  }

  const describe =
    lower === upper
      ? `equal to ${lower}`
      : lower === spec.min && upper === spec.max
        ? ''
        : lower === spec.min
          ? upper === undefined
            ? ''
            : `at most ${upper}`
          : upper === undefined
            ? `at least ${lower}`
            : upper === spec.max
              ? `at least ${lower}`
              : `between ${lower} and ${upper}`

  return {
    body,
    regex: new RegExp(`^(?:${body})$`),
    describe,
    lower,
    upper,
  }
}

/** Compiles a single hexadecimal nibble (`0`–`f`) from integer validators. */
export function compileHexNibble(
  options: IntegerPartValidators,
  label: string,
): CompiledIntegerPart {
  const compiled = compileIntegerPart(options, {
    label,
    min: 0,
    max: 15,
  })
  const chars = new Set<string>()
  for (let value = compiled.lower; value <= (compiled.upper ?? compiled.lower); value += 1) {
    const hex = value.toString(16)
    chars.add(hex)
    chars.add(hex.toUpperCase())
  }
  const body = `[${[...chars].join('')}]`
  return {
    ...compiled,
    body,
    regex: new RegExp(`^(?:${body})$`, 'i'),
  }
}
