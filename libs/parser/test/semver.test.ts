import { describe, expect, expectTypeOf, it } from 'vitest'
import { createGrammar, createParser } from '../src'

const semver = createGrammar(
  {
    number: /\d+/,
    ident: /[0-9A-Za-z-]+/,
    dot: /\./,
    dash: /-/,
    plus: /\+/,
  },
  {
    number: (r) => r.token('number'),
    ident: (r) => r.token('ident'),
    root: (r) =>
      r.seq({
        major: r.node('number'),
        _d1: r.token('dot'),
        minor: r.node('number'),
        _d2: r.token('dot'),
        patch: r.node('number'),
        prerelease: r.optional(
          r.seq({
            _dash: r.token('dash'),
            identifiers: r.list(r.node('ident'), r.token('dot')),
          }),
        ),
        build: r.optional(
          r.seq({
            _plus: r.token('plus'),
            identifiers: r.list(r.node('ident'), r.token('dot')),
          }),
        ),
      }),
  },
)

const parse = createParser(semver)

type Num = { type: 'number'; value: string; raw: string }
type Ident = { type: 'ident'; value: string; raw: string }
type Version = {
  type: 'root'
  value: {
    major: Num
    minor: Num
    patch: Num
    prerelease?: { identifiers: Ident[] } | undefined
    build?: { identifiers: Ident[] } | undefined
  }
  raw: string
}

describe('semver grammar', () => {
  it('parses a plain version', () => {
    expect(parse('1.2.3')).toEqual({
      type: 'root',
      value: {
        major: { type: 'number', value: '1', raw: '1' },
        minor: { type: 'number', value: '2', raw: '2' },
        patch: { type: 'number', value: '3', raw: '3' },
      },
      raw: '1.2.3',
    })
  })

  it('parses prerelease and build metadata', () => {
    expect(parse('1.2.3-alpha.1+build.2')).toEqual({
      type: 'root',
      value: {
        major: { type: 'number', value: '1', raw: '1' },
        minor: { type: 'number', value: '2', raw: '2' },
        patch: { type: 'number', value: '3', raw: '3' },
        prerelease: {
          identifiers: [
            { type: 'ident', value: 'alpha', raw: 'alpha' },
            { type: 'ident', value: '1', raw: '1' },
          ],
        },
        build: {
          identifiers: [
            { type: 'ident', value: 'build', raw: 'build' },
            { type: 'ident', value: '2', raw: '2' },
          ],
        },
      },
      raw: '1.2.3-alpha.1+build.2',
    })
  })

  it('omits absent optional segments', () => {
    const version = parse('10.20.30')
    expect(version.value.major.value).toBe('10')
    expect(version.value.prerelease).toBeUndefined()
    expect(version.value.build).toBeUndefined()
  })

  it('infers the version AST type', () => {
    expectTypeOf(parse).toMatchTypeOf<(input: string) => Version>()
  })

  it('rejects malformed versions', () => {
    expect(() => parse('1.2')).toThrow()
    expect(() => parse('v1.2.3')).toThrow()
  })
})
