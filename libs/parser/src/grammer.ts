export class ParseError extends Error {
    constructor(
        readonly expected: string,
        readonly index: number,
    ) {
        super(`Expected ${expected} at index ${index}`);
        this.name = "ParseError";
    }
}

// --- Grammar rule shapes -----------------------------------------------------

export type TokenRef<N extends string = string> = {
    readonly type: "token";
    readonly name: N;
};
export type NodeRef<N extends string = string> = {
    readonly type: "node";
    readonly name: N;
};

export interface SeqRule<
    F extends Record<string, Rule> = Record<string, Rule>,
> {
    readonly type: "seq";
    readonly fields: F;
}
export interface OneOfRule<
    F extends Record<string, Rule> = Record<string, Rule>,
> {
    readonly type: "oneof";
    readonly fields: F;
}
export interface OptionalRule<R extends Rule = Rule> {
    readonly type: "optional";
    readonly item: R;
}
export interface ListRule<R extends Rule = Rule> {
    readonly type: "list";
    readonly item: R;
    readonly delimiter?: TokenRef;
}

export type Rule =
    | TokenRef
    | NodeRef
    | SeqRule
    | OneOfRule
    | OptionalRule
    | ListRule;

/**
 * Builds rules inside a `createGrammar` node definition. `token`/`node` are
 * constrained to the grammar's own token and node names.
 */
export class RefBuilder<Tk extends string, NR extends string> {
    token<N extends Tk>(name: N): TokenRef<N> {
        return { type: "token", name };
    }
    node<N extends NR>(name: N): NodeRef<N> {
        return { type: "node", name };
    }
    seq<F extends Record<string, Rule>>(fields: F): SeqRule<F> {
        return { type: "seq", fields };
    }
    oneOf<F extends Record<string, Rule>>(fields: F): OneOfRule<F> {
        return { type: "oneof", fields };
    }
    optional<R extends Rule>(item: R): OptionalRule<R> {
        return { type: "optional", item };
    }
    list<R extends Rule>(item: R, delimiter?: TokenRef): ListRule<R> {
        return { type: "list", item, delimiter };
    }
}

export type Grammar<
    Tk extends string,
    NR extends string,
    Ns extends Record<NR, (rb: RefBuilder<Tk, NR>) => Rule>,
> = {
    tokens: Record<Tk, RegExp>;
    rb: RefBuilder<Tk, NR>;
    nodes: Ns;
    ignore: RegExp;
};

export type GrammarOptions = {
    /**
     * Whitespace skipped between tokens. Defaults to matching whitespace
     * (`\s`) zero or more times. For line-oriented grammars where newlines are
     * significant, pass a pattern that excludes the newline, e.g. `[^\S\n]`
     * repeated.
     */
    ignore?: RegExp;
};

const DEFAULT_IGNORE = /\s*/;

/** Compiles a pattern to be anchored at `lastIndex` (sticky). */
function sticky(pattern: RegExp): RegExp {
    const flags = pattern.flags.includes("y")
        ? pattern.flags
        : `${pattern.flags.replace("g", "")}y`;
    return new RegExp(pattern.source, flags);
}

export const createGrammar = <
    Tk extends string,
    NR extends string,
    Ns extends Record<NR, (rb: RefBuilder<Tk, NR>) => Rule>,
>(
    tokens: Record<Tk, RegExp>,
    nodes: Record<NR, (rb: RefBuilder<Tk, NR>) => Rule> & Ns,
    options: GrammarOptions = {},
): Grammar<Tk, NR, Ns> => {
    const rb = new RefBuilder<Tk, NR>();
    return { tokens, rb, nodes, ignore: options.ignore ?? DEFAULT_IGNORE };
};

// --- Type-level AST ----------------------------------------------------------
// Mirrors the runtime parser. Every token and every *composite* node becomes an
// `AstNode` discriminated on its `type`; `node` refs and `oneof` are transparent
// (they yield the referenced/chosen node directly). `_`-prefixed fields are
// dropped.

export type SourceLocation = {
    readonly start: number;
    readonly end: number;
};

export type AstNode<
    T extends string = string,
    V = unknown,
    L extends boolean = false,
> = {
    readonly type: T;
    readonly value: V;
    readonly raw: string;
} & (L extends true ? { readonly location: SourceLocation } : unknown);

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type IsHidden<K extends string> = K extends `_${string}` ? true : false;
type OptionalKeys<F> = {
    [K in keyof F]: F[K] extends OptionalRule<Rule> ? K : never;
}[keyof F];

type SeqValue<F extends Record<string, Rule>, Ns, L extends boolean> = Simplify<
    {
        [K in keyof F as IsHidden<K & string> extends true
            ? never
            : K extends OptionalKeys<F>
              ? never
              : K]: Ast<F[K], Ns, L>;
    } & {
        [K in keyof F as IsHidden<K & string> extends true
            ? never
            : K extends OptionalKeys<F>
              ? K
              : never]?: Ast<F[K], Ns, L>;
    }
>;

type OneOfValue<F extends Record<string, Rule>, Ns, L extends boolean> = {
    [K in keyof F]: Ast<F[K], Ns, L>;
}[keyof F];

export type Ast<R, Ns, L extends boolean = false> = R extends TokenRef<infer T>
    ? AstNode<T, string, L>
    : R extends NodeRef<infer N>
      ? N extends keyof Ns & string
          ? AstOf<Ns, N, L>
          : never
      : R extends OneOfRule<infer F>
        ? OneOfValue<F, Ns, L>
        : R extends SeqRule<infer F>
          ? SeqValue<F, Ns, L>
          : R extends OptionalRule<infer I>
            ? Ast<I, Ns, L> | undefined
            : R extends ListRule<infer I>
              ? Ast<I, Ns, L>[]
              : never;

export type AstOf<
    Ns,
    N extends keyof Ns & string,
    L extends boolean = false,
> = Ns[N] extends (...args: never[]) => infer R
    ? R extends TokenRef
        ? AstNode<N, string, L>
        : R extends NodeRef
          ? Ast<R, Ns, L>
          : R extends OneOfRule
            ? Ast<R, Ns, L>
            : R extends SeqRule<infer F>
              ? AstNode<N, SeqValue<F, Ns, L>, L>
              : R extends OptionalRule<infer I>
                ? AstNode<N, Ast<I, Ns, L> | undefined, L>
                : R extends ListRule<infer I>
                  ? AstNode<N, Ast<I, Ns, L>[], L>
                  : AstNode<N, Ast<R, Ns, L>, L>
    : never;

// --- Runtime ----------------------------------------------------------------

type ParseState = { input: string; index: number };

/**
 * Internal control-flow signal used to unwind a failed alternative
 * (backtracking).
 *
 * It deliberately does **not** extend `Error`: constructing an `Error` captures a
 * stack trace, and because `oneOf` fails on every mismatched alternative, profiling
 * showed that stack capture was ~90% of total parse time. A plain object carries
 * the same data with no stack-trace cost.
 */
class MatchError {
    constructor(
        readonly expected: string,
        readonly index: number,
    ) {}
}

export type ParserOptions = {
    /** Attach `location: { start, end }` to every AST node. */
    location?: boolean;
    /** Precompute a specialized parser instead of walking the rule tree. */
    compile?: boolean;
};

/** A compiled rule/node: a closure that parses at `state.index`. */
type Compiled = (state: ParseState) => unknown;

/**
 * Compiles a grammar into a parse function. The returned function parses `input`
 * and produces the inferred AST for `nodeName` (default `"root"`).
 *
 * @param options.location attach `location` to nodes
 * @param options.compile  build a specialized parser (faster, like zod/TypeBox)
 */
export const createParser = <
    Tk extends string,
    NR extends string,
    Ns extends Record<NR, (rb: RefBuilder<Tk, NR>) => Rule>,
    N extends keyof Ns & string = "root" & keyof Ns & string,
    L extends boolean = false,
>(
    grammar: Grammar<Tk, NR, Ns>,
    nodeName?: N,
    options?: ParserOptions & { location?: L },
): ((input: string) => AstOf<Ns, N, L>) => {
    const { tokens, nodes, rb } = grammar;
    const anchored = new Map<string, RegExp>();
    const whitespace = sticky(grammar.ignore);
    const withLocation = options?.location === true;

    // Token patterns are reused across the parse, so anchor them once with the
    // sticky flag (`y`) and drive them with `lastIndex`.
    function tokenPattern(name: string): RegExp {
        const cached = anchored.get(name);
        if (cached) {
            return cached;
        }
        const source = (tokens as Record<string, RegExp>)[name];
        if (!source) {
            throw new Error(`Unknown token "${name}"`);
        }
        const pattern = sticky(source);
        anchored.set(name, pattern);
        return pattern;
    }

    function skipWhitespace(state: ParseState): void {
        whitespace.lastIndex = state.index;
        whitespace.exec(state.input);
        state.index = whitespace.lastIndex;
    }

    function matchToken(name: string, state: ParseState): string {
        skipWhitespace(state);
        const pattern = tokenPattern(name);
        pattern.lastIndex = state.index;
        const match = pattern.exec(state.input);
        if (!match) {
            throw new MatchError(name, state.index);
        }
        state.index = pattern.lastIndex;
        return match[0];
    }

    function makeNode(
        name: string,
        value: unknown,
        start: number,
        end: number,
        input: string,
    ): unknown {
        const raw = input.slice(start, end);
        return withLocation
            ? { type: name, value, raw, location: { start, end } }
            : { type: name, value, raw };
    }

    function parseNode(name: string, state: ParseState): unknown {
        const build = (nodes as Record<string, (rb: RefBuilder<Tk, NR>) => Rule>)[
            name
        ];
        if (!build) {
            throw new Error(`Unknown node "${name}"`);
        }
        const rule = build(rb);
        skipWhitespace(state);
        const start = state.index;
        // A `token`/`oneof` rule *is* the node (no extra wrapper); a `node` rule is
        // an alias. Everything else is wrapped as `{ type: name, value, raw }`.
        if (rule.type === "token") {
            const value = matchToken(rule.name, state);
            return makeNode(name, value, start, state.index, state.input);
        }
        if (rule.type === "node") {
            return parseNode(rule.name, state);
        }
        if (rule.type === "oneof") {
            return parseRule(rule, state);
        }
        const value = parseRule(rule, state);
        return makeNode(name, value, start, state.index, state.input);
    }

    function parseRule(rule: Rule, state: ParseState): unknown {
        switch (rule.type) {
            case "token": {
                skipWhitespace(state);
                const start = state.index;
                const value = matchToken(rule.name, state);
                return makeNode(rule.name, value, start, state.index, state.input);
            }
            case "node":
                return parseNode(rule.name, state);
            case "seq": {
                // A sequence builds a named object; `_`-prefixed fields are structural
                // (brackets, colons, commas) and are dropped from the AST.
                const value: Record<string, unknown> = {};
                for (const [field, child] of Object.entries(rule.fields)) {
                    const parsed = parseRule(child, state);
                    if (!field.startsWith("_") && parsed !== undefined) {
                        value[field] = parsed;
                    }
                }
                return value;
            }
            case "oneof": {
                // Ordered choice: the first alternative that matches wins. It is
                // transparent — the chosen alternative's node is returned as-is.
                for (const child of Object.values(rule.fields)) {
                    const mark = state.index;
                    try {
                        return parseRule(child, state);
                    } catch (error) {
                        if (error instanceof MatchError) {
                            state.index = mark;
                            continue;
                        }
                        throw error;
                    }
                }
                throw new MatchError("one of", state.index);
            }
            case "optional": {
                const mark = state.index;
                try {
                    return parseRule(rule.item, state);
                } catch (error) {
                    if (error instanceof MatchError) {
                        state.index = mark;
                        return undefined;
                    }
                    throw error;
                }
            }
            case "list": {
                const value: unknown[] = [];
                const first = state.index;
                try {
                    value.push(parseRule(rule.item, state));
                } catch (error) {
                    if (error instanceof MatchError) {
                        state.index = first;
                        return value;
                    }
                    throw error;
                }
                for (; ;) {
                    const mark = state.index;
                    if (rule.delimiter) {
                        try {
                            matchToken(rule.delimiter.name, state);
                        } catch (error) {
                            if (error instanceof MatchError) {
                                state.index = mark;
                                break;
                            }
                            throw error;
                        }
                    }
                    const itemStart = state.index;
                    try {
                        value.push(parseRule(rule.item, state));
                    } catch (error) {
                        if (error instanceof MatchError) {
                            state.index = mark;
                            break;
                        }
                        throw error;
                    }
                    if (state.index === itemStart) {
                        state.index = mark;
                        break;
                    }
                }
                return value;
            }
        }
    }

    // --- Compiled parser -----------------------------------------------------
    // Precompute a closure per rule/node once, so parsing never walks the rule
    // tree, never calls a node builder, and never calls `Object.entries`.

    const nodeFns: Record<string, Compiled> = {};

    function compileRule(rule: Rule): Compiled {
        switch (rule.type) {
            case "token": {
                const name = rule.name;
                return (state) => {
                    skipWhitespace(state);
                    const start = state.index;
                    const value = matchToken(name, state);
                    return makeNode(name, value, start, state.index, state.input);
                };
            }
            case "node": {
                const ref = rule.name;
                return (state) => nodeFns[ref]!(state);
            }
            case "seq": {
                const fields = Object.entries(rule.fields).map(([field, child]) => ({
                    field,
                    hidden: field.startsWith("_"),
                    parse: compileRule(child),
                }));
                return (state) => {
                    const value: Record<string, unknown> = {};
                    for (let i = 0; i < fields.length; i++) {
                        const field = fields[i]!;
                        const parsed = field.parse(state);
                        if (!field.hidden && parsed !== undefined) {
                            value[field.field] = parsed;
                        }
                    }
                    return value;
                };
            }
            case "oneof": {
                const alternatives = Object.values(rule.fields).map(compileRule);
                return (state) => {
                    for (let i = 0; i < alternatives.length; i++) {
                        const mark = state.index;
                        try {
                            return alternatives[i]!(state);
                        } catch (error) {
                            if (error instanceof MatchError) {
                                state.index = mark;
                                continue;
                            }
                            throw error;
                        }
                    }
                    throw new MatchError("one of", state.index);
                };
            }
            case "optional": {
                const inner = compileRule(rule.item);
                return (state) => {
                    const mark = state.index;
                    try {
                        return inner(state);
                    } catch (error) {
                        if (error instanceof MatchError) {
                            state.index = mark;
                            return undefined;
                        }
                        throw error;
                    }
                };
            }
            case "list": {
                const item = compileRule(rule.item);
                const delimiter = rule.delimiter ? rule.delimiter.name : null;
                return (state) => {
                    const value: unknown[] = [];
                    const first = state.index;
                    try {
                        value.push(item(state));
                    } catch (error) {
                        if (error instanceof MatchError) {
                            state.index = first;
                            return value;
                        }
                        throw error;
                    }
                    for (;;) {
                        const mark = state.index;
                        if (delimiter !== null) {
                            try {
                                matchToken(delimiter, state);
                            } catch (error) {
                                if (error instanceof MatchError) {
                                    state.index = mark;
                                    break;
                                }
                                throw error;
                            }
                        }
                        const itemStart = state.index;
                        try {
                            value.push(item(state));
                        } catch (error) {
                            if (error instanceof MatchError) {
                                state.index = mark;
                                break;
                            }
                            throw error;
                        }
                        if (state.index === itemStart) {
                            state.index = mark;
                            break;
                        }
                    }
                    return value;
                };
            }
        }
    }

    function compileNode(name: string): Compiled {
        const build = (nodes as Record<string, (rb: RefBuilder<Tk, NR>) => Rule>)[name]!;
        const rule = build(rb);
        if (rule.type === "token") {
            const tokenName = rule.name;
            return (state) => {
                skipWhitespace(state);
                const start = state.index;
                const value = matchToken(tokenName, state);
                return makeNode(name, value, start, state.index, state.input);
            };
        }
        if (rule.type === "node") {
            const ref = rule.name;
            return (state) => nodeFns[ref]!(state);
        }
        if (rule.type === "oneof") {
            return compileRule(rule);
        }
        const inner = compileRule(rule);
        return (state) => {
            skipWhitespace(state);
            const start = state.index;
            const value = inner(state);
            return makeNode(name, value, start, state.index, state.input);
        };
    }

    if (options?.compile) {
        for (const name of Object.keys(nodes)) {
            nodeFns[name] = compileNode(name);
        }
    }

    const entry = (nodeName ?? "root") as string;

    return (input: string): AstOf<Ns, N, L> => {
        const state: ParseState = { input, index: 0 };
        try {
            const value = options?.compile
                ? nodeFns[entry]!(state)
                : parseNode(entry, state);
            skipWhitespace(state);
            if (state.index !== input.length) {
                throw new ParseError("end of input", state.index);
            }
            return value as AstOf<Ns, N, L>;
        } catch (error) {
            // Internal backtracking signal must not escape the public API.
            if (error instanceof MatchError) {
                throw new ParseError(error.expected, error.index);
            }
            throw error;
        }
    };
};
