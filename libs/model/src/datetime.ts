import { ModelDefinitionError } from './errors'
import { buildFormatSchema, type CompiledFormatParts } from './format-schema'
import { stringFormats } from './formats'
import type { NumberOptions } from './number'
import {
  compileIntegerPart,
  compileStringPart,
  type CompiledIntegerPart,
  type IntegerPartValidators,
  type StringPartValidators,
} from './parts'
import type { StringSchema } from './string'

type DatePartKey = 'year' | 'month' | 'day'
type TimePartKey = 'hour' | 'minute' | 'second' | 'fraction' | 'offset'
type DateTimePartKey = DatePartKey | TimePartKey

type NoFilters<K extends string> = { [P in K]?: never }

type FormatBase = {
  eq?: never
  length?: NumberOptions
}

type DateParts = {
  year?: IntegerPartValidators
  month?: IntegerPartValidators
  day?: IntegerPartValidators
}

type TimeParts = {
  hour?: IntegerPartValidators
  minute?: IntegerPartValidators
  second?: IntegerPartValidators
  fraction?: StringPartValidators
  offset?: StringPartValidators
}

type DateTimeParts = DateParts & TimeParts

export type DateValidators =
  | ({ eq: string; length?: never; pattern?: never } & NoFilters<DatePartKey>)
  | (FormatBase & DateParts & ({ pattern: RegExp } | { pattern?: never }))

export type TimeValidators =
  | ({ eq: string; length?: never; pattern?: never } & NoFilters<TimePartKey>)
  | (FormatBase & TimeParts & ({ pattern: RegExp } | { pattern?: never }))

export type DateTimeValidators =
  | ({ eq: string; length?: never; pattern?: never } & NoFilters<DateTimePartKey>)
  | (FormatBase & DateTimeParts & ({ pattern: RegExp } | { pattern?: never }))

export type DateFactory = (validators?: DateValidators) => StringSchema<string>
export type TimeFactory = (validators?: TimeValidators) => StringSchema<string>
export type DateTimeFactory = (
  validators?: DateTimeValidators,
) => StringSchema<string>

const DATE_KEYS: readonly string[] = ['eq', 'length', 'pattern', 'year', 'month', 'day']
const TIME_KEYS: readonly string[] = [
  'eq',
  'length',
  'pattern',
  'hour',
  'minute',
  'second',
  'fraction',
  'offset',
]
const DATE_TIME_KEYS: readonly string[] = [
  ...DATE_KEYS,
  'hour',
  'minute',
  'second',
  'fraction',
  'offset',
]

const DEFAULT_YEAR = '\\d{4}'
const DEFAULT_MONTH = '(?:0[1-9]|1[0-2])'
const DEFAULT_DAY = '(?:0[1-9]|[12]\\d|3[01])'
const DEFAULT_HOUR = '(?:[01]\\d|2[0-3])'
const DEFAULT_MINUTE = '[0-5]\\d'
const DEFAULT_SECOND = '(?:[0-5]\\d|60)'
const DEFAULT_OFFSET = '(?:[Zz]|[+-]\\d{2}:\\d{2})'

const DATE_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PARTS = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|[+-]\d{2}:\d{2})$/

type CompiledDateLayout = {
  body: string
  check: (value: string) => boolean
  describe: string[]
  year?: CompiledIntegerPart
  month?: CompiledIntegerPart
  day?: CompiledIntegerPart
}

type CompiledTimeLayout = {
  body: string
  check: (value: string) => boolean
  describe: string[]
}

function compileDateLayout(
  parts: DateParts,
  label: string,
): CompiledDateLayout {
  const year =
    parts.year === undefined
      ? undefined
      : compileIntegerPart(parts.year, {
          label: `${label}.year`,
          min: 0,
          max: 9999,
          width: 4,
        })
  const month =
    parts.month === undefined
      ? undefined
      : compileIntegerPart(parts.month, {
          label: `${label}.month`,
          min: 1,
          max: 12,
          width: 2,
        })
  const day =
    parts.day === undefined
      ? undefined
      : compileIntegerPart(parts.day, {
          label: `${label}.day`,
          min: 1,
          max: 31,
          width: 2,
        })

  if (
    year !== undefined &&
    month !== undefined &&
    day !== undefined &&
    year.lower === year.upper &&
    month.lower === month.upper &&
    day.lower === day.upper
  ) {
    const value = `${String(year.lower).padStart(4, '0')}-${String(month.lower).padStart(2, '0')}-${String(day.lower).padStart(2, '0')}`
    const message = stringFormats.date.validate(value)
    if (message !== undefined) {
      throw new ModelDefinitionError(
        `Invalid ${label} model: "${value}" is not a valid date`,
      )
    }
  }

  const describe: string[] = []
  if (year?.describe !== undefined) {
    describe.push(`year ${year.describe}`)
  }
  if (month?.describe !== undefined) {
    describe.push(`month ${month.describe}`)
  }
  if (day?.describe !== undefined) {
    describe.push(`day ${day.describe}`)
  }

  return {
    body:
      `${year?.body ?? DEFAULT_YEAR}-` +
      `${month?.body ?? DEFAULT_MONTH}-` +
      `${day?.body ?? DEFAULT_DAY}`,
    year,
    month,
    day,
    describe,
    check: (value) => {
      const match = DATE_PARTS.exec(value)
      if (match === null) {
        return false
      }
      if (year !== undefined && !year.regex.test(match[1]!)) {
        return false
      }
      if (month !== undefined && !month.regex.test(match[2]!)) {
        return false
      }
      if (day !== undefined && !day.regex.test(match[3]!)) {
        return false
      }
      return true
    },
  }
}

function compileTimeLayout(
  parts: TimeParts,
  label: string,
): CompiledTimeLayout {
  const hour =
    parts.hour === undefined
      ? undefined
      : compileIntegerPart(parts.hour, {
          label: `${label}.hour`,
          min: 0,
          max: 23,
          width: 2,
        })
  const minute =
    parts.minute === undefined
      ? undefined
      : compileIntegerPart(parts.minute, {
          label: `${label}.minute`,
          min: 0,
          max: 59,
          width: 2,
        })
  const second =
    parts.second === undefined
      ? undefined
      : compileIntegerPart(parts.second, {
          label: `${label}.second`,
          min: 0,
          max: 60,
          width: 2,
        })
  const fraction =
    parts.fraction === undefined
      ? undefined
      : compileStringPart(parts.fraction, {
          label: `${label}.fraction`,
          char: '\\d',
          boundary: '(?=[Zz+-]|$)',
        })
  const offset =
    parts.offset === undefined
      ? undefined
      : compileStringPart(parts.offset, {
          label: `${label}.offset`,
          char: '[\\s\\S]',
          boundary: '(?=$)',
          caseInsensitive: true,
        })

  const describe: string[] = []
  if (hour?.describe !== undefined) {
    describe.push(`hour ${hour.describe}`)
  }
  if (minute?.describe !== undefined) {
    describe.push(`minute ${minute.describe}`)
  }
  if (second?.describe !== undefined) {
    describe.push(`second ${second.describe}`)
  }
  if (fraction?.describe !== undefined) {
    describe.push(
      fraction.describe === ''
        ? 'fraction'
        : `fraction ${fraction.describe}`,
    )
  }
  if (offset?.describe !== undefined) {
    describe.push(
      offset.describe === '' ? 'offset' : `offset ${offset.describe}`,
    )
  }

  const body =
    `${hour?.body ?? DEFAULT_HOUR}:` +
    `${minute?.body ?? DEFAULT_MINUTE}:` +
    `${second?.body ?? DEFAULT_SECOND}` +
    `${fraction === undefined ? '(?:\\.\\d+)?' : `\\.${fraction.body}`}` +
    `${offset?.body ?? DEFAULT_OFFSET}`

  return {
    body,
    describe,
    check: (value) => {
      const match = TIME_PARTS.exec(value)
      if (match === null) {
        return false
      }
      if (hour !== undefined && !hour.regex.test(match[1]!)) {
        return false
      }
      if (minute !== undefined && !minute.regex.test(match[2]!)) {
        return false
      }
      if (second !== undefined && !second.regex.test(match[3]!)) {
        return false
      }
      if (fraction !== undefined) {
        if (match[4] === undefined || !fraction.regex.test(match[4])) {
          return false
        }
      }
      if (offset !== undefined && !offset.regex.test(match[5]!)) {
        return false
      }
      return true
    },
  }
}

function hasDateParts(parts: DateParts): boolean {
  return (
    parts.year !== undefined ||
    parts.month !== undefined ||
    parts.day !== undefined
  )
}

function hasTimeParts(parts: TimeParts): boolean {
  return (
    parts.hour !== undefined ||
    parts.minute !== undefined ||
    parts.second !== undefined ||
    parts.fraction !== undefined ||
    parts.offset !== undefined
  )
}

function compileDateParts(
  validators: DateValidators,
): CompiledFormatParts | undefined {
  const raw = validators as DateParts
  if (!hasDateParts(raw)) {
    return undefined
  }
  const layout = compileDateLayout(raw, 'date')
  return {
    body: layout.body,
    check: layout.check,
    message:
      layout.describe.length === 0
        ? 'Expected a date'
        : `Expected a date with ${layout.describe.join(' and ')}`,
  }
}

function compileTimeParts(
  validators: TimeValidators,
): CompiledFormatParts | undefined {
  const raw = validators as TimeParts
  if (!hasTimeParts(raw)) {
    return undefined
  }
  const layout = compileTimeLayout(raw, 'time')
  return {
    body: layout.body,
    check: layout.check,
    message:
      layout.describe.length === 0
        ? 'Expected a time'
        : `Expected a time with ${layout.describe.join(' and ')}`,
  }
}

function compileDateTimeParts(
  validators: DateTimeValidators,
): CompiledFormatParts | undefined {
  const raw = validators as DateTimeParts
  if (!hasDateParts(raw) && !hasTimeParts(raw)) {
    return undefined
  }
  const date = compileDateLayout(raw, 'date-time')
  const time = compileTimeLayout(raw, 'date-time')
  const describe = [...date.describe, ...time.describe]
  return {
    body: `${date.body}[Tt]${time.body}`,
    check: (value) => {
      const index = value.search(/[Tt]/)
      if (index === -1) {
        return false
      }
      return (
        date.check(value.slice(0, index)) &&
        time.check(value.slice(index + 1))
      )
    },
    message:
      describe.length === 0
        ? 'Expected a date-time'
        : `Expected a date-time with ${describe.join(' and ')}`,
  }
}

export function date(validators?: DateValidators): StringSchema<string> {
  return buildFormatSchema({
    format: 'date',
    label: 'date',
    knownKeys: DATE_KEYS,
    validators,
    compile: compileDateParts,
  })
}

export function time(validators?: TimeValidators): StringSchema<string> {
  return buildFormatSchema({
    format: 'time',
    label: 'time',
    knownKeys: TIME_KEYS,
    validators,
    compile: compileTimeParts,
  })
}

export function dateTime(
  validators?: DateTimeValidators,
): StringSchema<string> {
  return buildFormatSchema({
    format: 'date-time',
    label: 'date-time',
    knownKeys: DATE_TIME_KEYS,
    validators,
    compile: compileDateTimeParts,
  })
}
