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

type DurationPartKey =
  | 'years'
  | 'months'
  | 'weeks'
  | 'days'
  | 'hours'
  | 'minutes'
  | 'seconds'

type NoDurationFilters = { [K in DurationPartKey]?: never }

type DurationBase = {
  eq?: never
  length?: NumberOptions
}

type DurationParts = {
  years?: IntegerPartValidators
  months?: IntegerPartValidators
  weeks?: IntegerPartValidators
  days?: IntegerPartValidators
  hours?: IntegerPartValidators
  minutes?: IntegerPartValidators
  seconds?: StringPartValidators
}

export type DurationValidators =
  | ({ eq: string; length?: never; pattern?: never } & NoDurationFilters)
  | (DurationBase &
      DurationParts &
      ({ pattern: RegExp } | { pattern?: never }))

export type DurationFactory = (
  validators?: DurationValidators,
) => StringSchema<string>

const DURATION_KEYS: readonly string[] = [
  'eq',
  'length',
  'pattern',
  'years',
  'months',
  'weeks',
  'days',
  'hours',
  'minutes',
  'seconds',
]

const DURATION_PARTS =
  /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/

type IntegerComponent = {
  filter?: IntegerPartValidators
  compiled?: CompiledIntegerPart
  body: string
  describe?: string
}

function compileIntegerComponent(
  filter: IntegerPartValidators | undefined,
  label: string,
  designator: string,
): IntegerComponent {
  const compiled =
    filter === undefined
      ? undefined
      : compileIntegerPart(filter, {
          label,
          min: 0,
          allowLeadingZeros: true,
        })
  return {
    filter,
    compiled,
    body:
      compiled === undefined
        ? `(?:\\d+${designator})?`
        : `${compiled.body}${designator}`,
    describe: compiled?.describe,
  }
}

function compileDurationParts(
  validators: DurationValidators,
): CompiledFormatParts | undefined {
  const raw = validators as DurationParts
  if (
    raw.years === undefined &&
    raw.months === undefined &&
    raw.weeks === undefined &&
    raw.days === undefined &&
    raw.hours === undefined &&
    raw.minutes === undefined &&
    raw.seconds === undefined
  ) {
    return undefined
  }

  const years = compileIntegerComponent(raw.years, 'duration.years', 'Y')
  const months = compileIntegerComponent(raw.months, 'duration.months', 'M')
  const weeks = compileIntegerComponent(raw.weeks, 'duration.weeks', 'W')
  const days = compileIntegerComponent(raw.days, 'duration.days', 'D')
  const hours = compileIntegerComponent(raw.hours, 'duration.hours', 'H')
  const minutes = compileIntegerComponent(raw.minutes, 'duration.minutes', 'M')
  const seconds: CompiledTextPart | undefined =
    raw.seconds === undefined
      ? undefined
      : compileStringPart(raw.seconds, {
          label: 'duration.seconds',
          char: '[0-9.]',
          boundary: '(?=S|$)',
        })

  const hasTimeFilters =
    raw.hours !== undefined ||
    raw.minutes !== undefined ||
    raw.seconds !== undefined

  const timeBody =
    `T${hours.body}${minutes.body}` +
    `${seconds === undefined ? '(?:\\d+(?:\\.\\d+)?S)?' : `${seconds.body}S`}`

  const body =
    `P${years.body}${months.body}${weeks.body}${days.body}` +
    `${hasTimeFilters ? timeBody : `(?:${timeBody})?`}`

  const describe: string[] = []
  for (const [name, component] of [
    ['year', years],
    ['month', months],
    ['week', weeks],
    ['day', days],
    ['hour', hours],
    ['minute', minutes],
  ] as const) {
    if (component.describe !== undefined && component.describe !== '') {
      describe.push(`${name} ${component.describe}`)
    }
  }
  if (seconds?.describe !== undefined && seconds.describe !== '') {
    describe.push(`second ${seconds.describe}`)
  }

  return {
    body,
    check: (value) => {
      const match = DURATION_PARTS.exec(value)
      if (match === null) {
        return false
      }
      const groups = [years, months, weeks, days, hours, minutes]
      for (let index = 0; index < groups.length; index += 1) {
        const component = groups[index]!
        const group = match[index + 1]
        if (
          component.compiled !== undefined &&
          (group === undefined || !component.compiled.regex.test(group))
        ) {
          return false
        }
      }
      if (seconds !== undefined) {
        const group = match[7]
        if (group === undefined || !seconds.regex.test(group)) {
          return false
        }
      }
      return true
    },
    message:
      describe.length === 0
        ? 'Expected a duration'
        : `Expected a duration with ${describe.join(' and ')}`,
  }
}

export function duration(
  validators?: DurationValidators,
): StringSchema<string> {
  return buildFormatSchema({
    format: 'duration',
    label: 'duration',
    knownKeys: DURATION_KEYS,
    validators,
    compile: compileDurationParts,
  })
}
