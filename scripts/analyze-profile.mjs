#!/usr/bin/env node
/**
 * Summarises a V8 `.cpuprofile` (from `node --cpu-prof`) into self-time per
 * function.
 *
 *   node scripts/analyze-profile.mjs <file.cpuprofile> [topN]
 */
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

const file = process.argv[2]
const topN = Number(process.argv[3] ?? 25)
if (!file) {
  console.error('usage: analyze-profile.mjs <file.cpuprofile> [topN]')
  process.exit(1)
}

const profile = JSON.parse(readFileSync(file, 'utf8'))

const frameById = new Map()
for (const node of profile.nodes) {
  frameById.set(node.id, node.callFrame)
}

const selfById = new Map()
let total = 0
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i]
  const delta = profile.timeDeltas[i] ?? 0
  selfById.set(id, (selfById.get(id) ?? 0) + delta)
  total += delta
}

const agg = new Map()
for (const [id, micros] of selfById) {
  const frame = frameById.get(id)
  if (!frame) {
    continue
  }
  const url = frame.url.startsWith('file://')
    ? relative(process.cwd(), decodeURIComponent(frame.url.slice('file://'.length)))
    : frame.url.split('/').pop() || frame.url
  const name = frame.functionName || '(anonymous)'
  const key = `${name} — ${url}:${frame.lineNumber + 1}`
  agg.set(key, (agg.get(key) ?? 0) + micros)
}

const rows = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN)
console.log(`\n${file}`)
console.log(`total sampled: ${(total / 1000).toFixed(0)} ms\n`)
console.log(`${'self ms'.padStart(9)}${'%'.padStart(7)}  function`)
console.log('-'.repeat(72))
for (const [key, micros] of rows) {
  const ms = (micros / 1000).toFixed(1).padStart(9)
  const pct = ((100 * micros) / total).toFixed(1).padStart(6)
  console.log(`${ms}${pct}%  ${key}`)
}
console.log()
