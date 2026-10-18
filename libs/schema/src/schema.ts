import type { JsonSchema } from './json-schema'

/** A phantom brand recording which format(s) a value was validated against. */
export type FormatBrand<F extends string> = { readonly __format: F }

/** `T`, branded with `F` when `F` is not `never`. */
export type Branded<T, F extends string> = [F] extends [never] ? T : T & FormatBrand<F>

export type SchemaIssue = {
  path: Array<string | number>
  message: string
}

export class SchemaParseError extends Error {
  readonly issues: SchemaIssue[]

  constructor(issues: SchemaIssue[]) {
    super(
      issues
        .map((issue) =>
          issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
        )
        .join('; '),
    )
    this.name = 'SchemaParseError'
    this.issues = issues
  }
}

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; issues: SchemaIssue[] }

/** A public construct signature — required for polymorphic `this` typing. */
export type Constructable = abstract new (...args: never[]) => object

/**
 * The static surface shared by every schema: `parse`, `safeParse`, and
 * `toJSONSchema` are static so schemas can be used as classes.
 */
export type SchemaClass<T> = {
  parse(value: unknown): T
  safeParse(value: unknown): ParseResult<T>
  toJSONSchema(): JsonSchema
  /**
   * Compile this schema to a standalone validation function — the same rules,
   * without the class/`parse` indirection and (for objects/arrays) without the
   * mutation-tracking proxies. Faster, but the result is a plain value.
   */
  compile(): (value: unknown) => T
  readonly isOptional: boolean
}

export type OptionalSchema<T> = SchemaClass<T | undefined> & {
  new(): object
}

export type OutputOfShape<S extends Record<string, SchemaClass<unknown>>> = {
  [K in keyof S]: ReturnType<S[K]['parse']>
} & {}

export function safeParseWith<T>(parse: (value: unknown) => T, value: unknown): ParseResult<T> {
  try {
    return { success: true, data: parse(value) }
  } catch (error) {
    if (error instanceof SchemaParseError) {
      return { success: false, issues: error.issues }
    }
    throw error
  }
}

export function typeName(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  return typeof value
}
