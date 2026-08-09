#!/usr/bin/env node
// AST-based repo map via ast-grep outline. Build: `node scripts/repo-map.mjs`, check: `... status`.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const MAP_PATH = join(ROOT, '.opencode', 'repo-map.json')
const CODE_EXT = new Set(['.ts', '.js', '.mjs', '.cjs', '.svelte'])
const LANGS = { '.ts': 'TypeScript', '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.svelte': 'Svelte' }

const sh = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' }).trim()
const hash = (s) => createHash('sha256').update(s).digest('hex')

function trackedFiles() {
  return sh('git', ['ls-files'])
    .split('\n')
    .filter((f) => !f.startsWith('.opencode') && !f.includes('node_modules'))
}

function parseFile(abs, rel) {
  const src = readFileSync(abs, 'utf8')
  const entry = { path: rel, language: LANGS[extname(rel)] ?? 'unknown', hash: hash(src), imports: [], symbols: [] }
  if (!CODE_EXT.has(extname(rel))) return entry

  let code = src
  let lineOffset = 0
  if (extname(rel) === '.svelte') {
    const m = src.match(/<script[^>]*>([\s\S]*?)<\/script>/)
    if (!m) return entry
    code = m[1]
    lineOffset = src.slice(0, m.index).split('\n').length - 1
  }

  const tmp = join(ROOT, 'node_modules', '.repo-map-tmp.ts')
  writeFileSync(tmp, code)
  let outline
  try {
    outline = JSON.parse(sh('ast-grep', ['outline', '--items=all', '--json=compact', tmp]))
  } catch {
    return entry
  } finally {
    if (existsSync(tmp)) execFileSync('rm', [tmp])
  }

  for (const file of outline) {
    for (const it of file.items ?? []) {
      const target = code.slice(it.range?.byteOffset?.start ?? 0, it.range?.byteOffset?.end ?? 0)
      if (it.isImport) {
        const spec = (it.name ?? '').replace(/^'|'$/g, '')
        entry.imports.push({
          specifier: spec,
          isInternal: spec.startsWith('.') || spec.startsWith('$'),
          resolved: resolveSpecifier(rel, spec),
          hash: hash(spec),
        })
      } else {
        entry.symbols.push({ name: it.name, kind: it.symbolType, hash: hash(target), line: (it.range?.start?.line ?? 0) + lineOffset + 1 })
      }
    }
  }
  return entry
}

function resolveSpecifier(fromRel, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('$')) return null
  const base = join(dirname(fromRel), spec.replace(/^\$/, '@aliases').replace(/^@/, ''))
  const cands = [base, ...['.ts', '.js', '.svelte'].map((e) => base + e), join(base, 'index.ts'), join(base, 'index.js')]
  for (const c of cands) {
    const rel = relative(ROOT, resolve(ROOT, c))
    if (existsSync(join(ROOT, c))) return rel.split(sep).join('/')
  }
  return null
}

function gitMeta() {
  try {
    return { branch: sh('git', ['branch', '--show-current']) || 'HEAD', head: sh('git', ['rev-parse', 'HEAD']), headTime: sh('git', ['show', '-s', '--format=%cI', 'HEAD']) }
  } catch {
    return { branch: 'unknown', head: 'none', headTime: null }
  }
}

function build() {
  const files = trackedFiles().map((f) => parseFile(join(ROOT, f), f))
  const languages = {}
  const stats = { files: files.length, symbols: 0, imports: 0, hashed: 0 }
  for (const f of files) {
    languages[f.language] = (languages[f.language] ?? 0) + 1
    stats.symbols += f.symbols.length
    stats.imports += f.imports.length
    stats.hashed += 1
  }
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), git: gitMeta(), languages, stats, files }
}

function validate(map) {
  const errors = []
  if (!map || map.schemaVersion !== 1) errors.push('bad schemaVersion')
  for (const f of map.files) {
    if (!f.path || !f.hash) errors.push(`missing path/hash: ${f.path}`)
    for (const s of f.symbols) if (!s.name || !s.hash) errors.push(`bad symbol in ${f.path}`)
  }
  const rebuilt = build()
  if (rebuilt.stats.files !== map.stats.files || rebuilt.stats.symbols !== map.stats.symbols || rebuilt.stats.imports !== map.stats.imports)
    errors.push('stats mismatch vs live build')
  return errors
}

function status(map) {
  if (!map) return { stale: true, reason: 'no map at .opencode/repo-map.json' }
  const cur = gitMeta()
  const reasons = []
  if (cur.head !== map.git.head) reasons.push(`HEAD moved: ${map.git.head.slice(0, 7)} → ${cur.head.slice(0, 7)}`)
  const live = build()
  const staleFiles = live.files.filter((f) => !map.files.some((m) => m.path === f.path && m.hash === f.hash))
  if (staleFiles.length) reasons.push(`stale files: ${staleFiles.map((f) => f.path).join(', ')}`)
  return { stale: reasons.length > 0, reasons, since: map.generatedAt }
}

const cmd = process.argv[2] ?? 'init'
if (cmd === 'status') {
  const map = existsSync(MAP_PATH) ? JSON.parse(readFileSync(MAP_PATH, 'utf8')) : null
  const s = status(map)
  console.log(s.stale ? `STALE (${s.since}): ${s.reasons.join('; ')}` : `FRESH (since ${s.since})`)
  process.exit(s.stale ? 1 : 0)
}

const map = build()
const errors = validate(map)
if (errors.length) {
  console.error(`map validation FAILED: ${errors.join('; ')}`)
  process.exit(1)
}
mkdirSync(dirname(MAP_PATH), { recursive: true })
writeFileSync(MAP_PATH, JSON.stringify(map, null, 2))
console.log(`wrote ${MAP_PATH}: ${map.stats.files} files, ${map.stats.symbols} symbols, ${map.stats.imports} imports (${Object.keys(map.languages).join(', ')}); validation OK`)
