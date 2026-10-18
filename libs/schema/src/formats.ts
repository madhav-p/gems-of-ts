/// <reference types="node" />
/**
 * Format registry. A format is a named validation rule for a primitive value.
 * String formats may also expose named "parts" — sub-strings (e.g. an email's
 * domain, a URL's host) that can themselves be refined.
 *
 * Registries are per-builder: `createSchemaBuilder({ stringFormats, numberFormats })`
 * merges the built-ins with any provided (or later registered) formats, so custom
 * formats never leak between builders.
 */

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type StringFormatSpec = {
  /** Return an error message if `value` is invalid, otherwise `undefined`. */
  validate: (value: string) => string | undefined
  /** Named sub-strings that can be refined, keyed by option name. */
  parts?: Record<string, (value: string) => string | undefined>
  /** `format` keyword to emit in JSON Schema, if any. */
  jsonFormat?: string
}

export type NumberFormatSpec = {
  /** Require an integer. */
  int?: boolean
  /** Return an error message if `value` is invalid, otherwise `undefined`. */
  validate?: (value: number) => string | undefined
}

const BUILTIN_STRING_FORMATS: Record<string, StringFormatSpec> = {
  email: {
    jsonFormat: 'email',
    validate: (value) =>
      EMAIL_PATTERN.test(value) ? undefined : 'Expected a valid email address',
    parts: {
      domain: (value) => value.slice(value.lastIndexOf('@') + 1),
    },
  },
  url: {
    jsonFormat: 'uri',
    validate: (value) => {
      try {
        new URL(value)
        return undefined
      } catch {
        return 'Expected a valid URL'
      }
    },
    parts: {
      host: (value) => {
        try {
          return new URL(value).hostname
        } catch {
          return undefined
        }
      },
    },
  },
}

const BUILTIN_NUMBER_FORMATS: Record<string, NumberFormatSpec> = {
  int: { int: true },
}

/** Read-only view of a builder's formats. */
export type FormatRegistry = {
  stringFormatSpec(name: string): StringFormatSpec | undefined
  numberFormatSpec(name: string): NumberFormatSpec | undefined
}

/** Formats supplied when creating a builder. */
export type FormatConfig = {
  stringFormats?: Record<string, StringFormatSpec>
  numberFormats?: Record<string, NumberFormatSpec>
}

export function createFormatRegistry(config: FormatConfig = {}): FormatRegistry {
  const stringFormats = new Map<string, StringFormatSpec>(Object.entries(BUILTIN_STRING_FORMATS))
  const numberFormats = new Map<string, NumberFormatSpec>(Object.entries(BUILTIN_NUMBER_FORMATS))

  for (const [name, spec] of Object.entries(config.stringFormats ?? {})) {
    stringFormats.set(name, spec)
  }
  for (const [name, spec] of Object.entries(config.numberFormats ?? {})) {
    numberFormats.set(name, spec)
  }

  return {
    stringFormatSpec: (name) => stringFormats.get(name),
    numberFormatSpec: (name) => numberFormats.get(name),
  }
}
