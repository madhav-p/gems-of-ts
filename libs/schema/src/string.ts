import type { StringJsonSchema } from './json-schema'
import type { Branded, OptionalSchema, ParseResult, SchemaClass, SchemaIssue } from './schema'
import { SchemaParseError, safeParseWith, typeName } from './schema'
import { emptyNumberView, numberViewDef, type NumberView } from './number'
import type { FormatRegistry, StringFormatSpec } from './formats'

/** A refinement callback: receives a fresh string view and returns the refined one. */
export type StringRefinement = (view: StringView) => StringView<string>

type StringRefinementDef = {
  extract: (value: string) => string | undefined
  def: StringDef
}

type AppliedFormat = {
  name: string
  spec: StringFormatSpec
  refinements: StringRefinementDef[]
}

export type StringDef = {
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  formats: AppliedFormat[]
  optional?: boolean
}

/**
 * An immutable builder for string rules. `format(...)` contributes a brand to the
 * inferred type, so a validated `email` string is `string & { __format: 'email' }`.
 */
export interface StringView<F extends string = never> {
  length(size: number | ((view: NumberView) => NumberView)): StringView<F>
  matches(pattern: RegExp): StringView<F>
  format(name: 'email', options?: { domain?: StringRefinement }): StringView<F | 'email'>
  format(name: 'url', options?: { host?: StringRefinement }): StringView<F | 'url'>
  format<N extends string>(name: N, options?: Record<string, StringRefinement>): StringView<F | N>
}

export type StringSchema<F extends string = never> = SchemaClass<Branded<string, F>> & {
  optional(): OptionalSchema<Branded<string, F>>
}

/** The `string` constructor returned by a schema builder. */
export interface StringFactory {
  (): StringSchema<never>
  <F extends string>(configure: (view: StringView<never>) => StringView<F>): StringSchema<F>
}

const STRING_DEF: unique symbol = Symbol('stringDef')

function stringDefOf(view: unknown): StringDef | undefined {
  if (typeof view === 'object' && view !== null && STRING_DEF in view) {
    return (view as { [STRING_DEF]: StringDef })[STRING_DEF]
  }
  return undefined
}

export function createString(formats: FormatRegistry): StringFactory {
  function applyFormat(
    def: StringDef,
    name: string,
    options?: Record<string, StringRefinement>,
  ): StringDef {
    const spec = formats.stringFormatSpec(name)
    if (!spec) {
      throw new Error(`Unknown string format "${name}"`)
    }
    const refinements: StringRefinementDef[] = []
    if (options) {
      for (const [part, refine] of Object.entries(options)) {
        const extract = spec.parts?.[part]
        if (!extract) {
          throw new Error(`Format "${name}" has no option "${part}"`)
        }
        const refined = refine(makeStringView<never>({ formats: [] }))
        refinements.push({ extract, def: stringDefOf(refined) ?? { formats: [] } })
      }
    }
    return { ...def, formats: [...def.formats, { name, spec, refinements }] }
  }

  function makeStringView<F extends string>(def: StringDef): StringView<F> {
    const view = {
      length(size: number | ((view: NumberView) => NumberView)): StringView<F> {
        if (typeof size === 'number') {
          return makeStringView<F>({ ...def, minLength: size, maxLength: size })
        }
        const numberDef = numberViewDef(size(emptyNumberView()))
        return makeStringView<F>({
          ...def,
          minLength: numberDef.min?.value,
          maxLength: numberDef.max?.value,
        })
      },
      matches(pattern: RegExp): StringView<F> {
        return makeStringView<F>({ ...def, pattern })
      },
      format(name: string, options?: Record<string, StringRefinement>): StringView<F> {
        return makeStringView<F | string>(applyFormat(def, name, options))
      },
      [STRING_DEF]: def,
    }
    return view as unknown as StringView<F>
  }

  function parseString(def: StringDef, value: unknown): string {
    if (value === undefined && def.optional) {
      return undefined as unknown as string
    }
    if (typeof value !== 'string') {
      throw new SchemaParseError([
        { path: [], message: `Expected string, received ${typeName(value)}` },
      ])
    }

    const issues: SchemaIssue[] = []
    if (def.minLength !== undefined && value.length < def.minLength) {
      issues.push({ path: [], message: `Expected at least ${def.minLength} characters` })
    }
    if (def.maxLength !== undefined && value.length > def.maxLength) {
      issues.push({ path: [], message: `Expected at most ${def.maxLength} characters` })
    }
    if (def.pattern !== undefined && !def.pattern.test(value)) {
      issues.push({ path: [], message: `Expected to match ${def.pattern.source}` })
    }
    for (const applied of def.formats) {
      const message = applied.spec.validate(value)
      if (message !== undefined) {
        issues.push({ path: [], message })
      }
      for (const refinement of applied.refinements) {
        const part = refinement.extract(value)
        if (part === undefined) {
          continue
        }
        try {
          parseString(refinement.def, part)
        } catch (error) {
          if (error instanceof SchemaParseError) {
            for (const issue of error.issues) {
              issues.push({ path: [], message: `${applied.name}: ${issue.message}` })
            }
          } else {
            throw error
          }
        }
      }
    }
    if (issues.length > 0) {
      throw new SchemaParseError(issues)
    }
    return value
  }

  function stringJSONSchema(def: StringDef): StringJsonSchema {
    const schema: StringJsonSchema = { type: 'string' }
    if (def.minLength !== undefined) {
      schema.minLength = def.minLength
    }
    if (def.maxLength !== undefined) {
      schema.maxLength = def.maxLength
    }
    if (def.pattern !== undefined) {
      schema.pattern = def.pattern.source
    }
    const jsonFormat = def.formats[def.formats.length - 1]?.spec.jsonFormat
    if (jsonFormat !== undefined) {
      schema.format = jsonFormat
    }
    return schema
  }

  function makeString(def: StringDef): StringSchema<string> {
    class StringSchemaImpl {
      static readonly isOptional: boolean = def.optional === true

      static parse(value: unknown): Branded<string, string> {
        return parseString(def, value) as Branded<string, string>
      }

      static safeParse(value: unknown): ParseResult<Branded<string, string>> {
        return safeParseWith(StringSchemaImpl.parse, value)
      }

      static compile(): (value: unknown) => Branded<string, string> {
        return (value) => parseString(def, value) as Branded<string, string>
      }

      static toJSONSchema(): StringJsonSchema {
        return stringJSONSchema(def)
      }

      static optional(): OptionalSchema<Branded<string, string>> {
        return makeString({ ...def, optional: true }) as unknown as OptionalSchema<
          Branded<string, string>
        >
      }
    }

    return StringSchemaImpl as unknown as StringSchema<string>
  }

  function string<F extends string>(
    configure?: (view: StringView<never>) => StringView<F>,
  ): StringSchema<F> {
    const initial = makeStringView<never>({ formats: [] })
    const configured = configure ? configure(initial) : initial
    const def = stringDefOf(configured) ?? stringDefOf(initial) ?? { formats: [] }
    return makeString(def) as unknown as StringSchema<F>
  }

  return string as StringFactory
}
