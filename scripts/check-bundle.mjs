/* global console */

import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const assetsDir = path.resolve('dist/assets')
const files = await readdir(assetsDir)
const manifest = JSON.parse(await readFile(path.resolve('dist/.vite/manifest.json'), 'utf8'))
const indexFile = manifest['index.html']?.file?.replace('assets/', '')
const posFile = files.find((file) => file.startsWith('pos-page-') && file.endsWith('.js'))

if (!indexFile) throw new Error('No se encontró el bundle inicial.')
if (!posFile) throw new Error('POS no quedó separado en un chunk.')

const indexSize = (await stat(path.join(assetsDir, indexFile))).size
const maxInitialSize = 450 * 1024
if (indexSize > maxInitialSize) throw new Error(`El bundle inicial pesa ${indexSize} bytes; máximo permitido: ${maxInitialSize}.`)

console.log(`Bundle inicial: ${indexSize} bytes`)
console.log(`Chunk POS: ${posFile}`)
