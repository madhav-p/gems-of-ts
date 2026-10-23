import { ModelDefinitionError } from './errors'
import { number, type NumberOptions, type NumberSchema } from './number'

export type LengthDef = {
  schema: NumberSchema
  minLength?: number
  maxLength?: number
}

/**
 * Compiles nested `length` options. Lengths are always integers, so this adds
 * the integer/non-negative check the number type cannot express and maps the
 * result to JSON Schema `minLength`/`maxLength` or `minItems`/`maxItems`.
 */
export function compileLength(
  options: NumberOptions,
  label: 'string' | 'list',
): LengthDef {
  const prefix = `Invalid ${label} model`

  for (const key of ['eq', 'min', 'max', 'gt', 'lt'] as const) {
    const value = options[key]
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new ModelDefinitionError(
        `${prefix}: "length.${key}" must be a non-negative integer`,
      )
    }
  }

  let minLength: number | undefined
  let maxLength: number | undefined

  if (options.eq !== undefined) {
    minLength = options.eq
    maxLength = options.eq
  } else {
    if (options.min !== undefined) {
      minLength = options.min
    } else if (options.gt !== undefined) {
      minLength = options.gt + 1
    }
    if (options.max !== undefined) {
      maxLength = options.max
    } else if (options.lt !== undefined) {
      maxLength = options.lt - 1
    }
  }

  if (maxLength !== undefined && maxLength < 0) {
    throw new ModelDefinitionError(
      `${prefix}: "length" has no non-negative values`,
    )
  }
  if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
    throw new ModelDefinitionError(`${prefix}: "length" range is empty`)
  }

  let schema: NumberSchema
  try {
    schema = number(options)
  } catch (error) {
    if (error instanceof ModelDefinitionError) {
      throw new ModelDefinitionError(
        `${prefix}: ${error.message.replace(/^Invalid number model: /, '')}`,
      )
    }
    throw error
  }

  return { schema, minLength, maxLength }
}

/** Rewrites number-validator issues into length-oriented messages. */
export function lengthMessage(message: string, unit: string): string {
  const atLeast = /^Expected a value of at least (.+)$/.exec(message)
  if (atLeast) {
    return `Expected at least ${atLeast[1]} ${unit}`
  }
  const atMost = /^Expected a value of at most (.+)$/.exec(message)
  if (atMost) {
    return `Expected at most ${atMost[1]} ${unit}`
  }
  const greater = /^Expected a value greater than (.+)$/.exec(message)
  if (greater) {
    return `Expected more than ${greater[1]} ${unit}`
  }
  const less = /^Expected a value less than (.+)$/.exec(message)
  if (less) {
    return `Expected fewer than ${less[1]} ${unit}`
  }
  const exact = /^Expected (.+)$/.exec(message)
  if (exact) {
    return `Expected exactly ${exact[1]} ${unit}`
  }
  return message
}
