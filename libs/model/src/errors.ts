export type Issue = {
  path: Array<string | number>
  message: string
}

/** Thrown by `parse` when a value does not satisfy a schema. */
export class ModelParseError extends Error {
  readonly issues: Issue[]

  constructor(issues: Issue[]) {
    super(
      issues
        .map((issue) =>
          issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
        )
        .join('; '),
    )
    this.name = 'ModelParseError'
    this.issues = issues
  }
}

/**
 * Thrown when a schema is defined with options that can never be valid (for
 * example `{ min: 10, max: 0 }`). These are programmer errors, not data errors.
 */
export class ModelDefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelDefinitionError'
  }
}

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; issues: Issue[] }

export function safeParseWith<T>(
  parse: (value: unknown) => T,
  value: unknown,
): ParseResult<T> {
  try {
    return { success: true, data: parse(value) }
  } catch (error) {
    if (error instanceof ModelParseError) {
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
