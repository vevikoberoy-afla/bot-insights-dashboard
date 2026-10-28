import * as childProcess from 'node:child_process'
import { createConnection } from 'node:net'
import path from 'node:path'
import { DocumentImportError, MAX_DOCUMENT_MB } from '@/lib/knowledge/documentPolicy'

async function antivirusScan(buffer: Buffer) {
  if (!process.env.CLAMAV_HOST) return 'structural-checks'
  const host = process.env.CLAMAV_HOST, port = Number(process.env.CLAMAV_PORT || 3310)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new DocumentImportError('The document scanner is unavailable.', 503)
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port })
    const timer = setTimeout(() => { socket.destroy(); reject(new DocumentImportError('The document scanner timed out. Please retry.', 503)) }, 8000)
    let reply = '', settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true; clearTimeout(timer); socket.destroy()
      if (error) reject(error); else resolve()
    }
    socket.on('error', () => finish(new DocumentImportError('The document scanner is unavailable. Please retry.', 503)))
    socket.on('close', () => { if (!settled) finish(new DocumentImportError('The document scanner disconnected.', 503)) })
    socket.on('data', data => {
      reply += data.toString('utf8')
      if (reply.length > 4096) return finish(new DocumentImportError('Invalid scanner response.', 503))
      if (reply.includes('\0') || reply.includes('\n')) {
        if (/\bFOUND\b/.test(reply)) finish(new DocumentImportError('The document was rejected by the malware scanner.'))
        else if (/^stream: OK[\0\r\n]/.test(reply)) finish()
        else finish(new DocumentImportError('The document scanner could not complete its check.', 503))
      }
    })
    socket.once('connect', async () => {
      try {
        const write = (data: Buffer | string) => new Promise<void>((done, fail) => socket.write(data, error => error ? fail(error) : done()))
        await write('zINSTREAM\0')
        for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
          if (settled) return
          const data = buffer.subarray(offset, offset + 64 * 1024), size = Buffer.alloc(4)
          size.writeUInt32BE(data.length)
          await write(size); await write(data)
        }
        await write(Buffer.alloc(4))
      } catch { finish(new DocumentImportError('The document scanner could not complete its check.', 503)) }
    })
  })
  return 'structural-checks+clamav'
}

export async function parseQuarantinedDocument(buffer: Buffer, extension: string) {
  if (!buffer.length || buffer.length > MAX_DOCUMENT_MB * 1024 * 1024) throw new DocumentImportError('The document exceeds the safe upload size.', 413)
  const scanner = await antivirusScan(buffer)
  const text = await new Promise<string>((resolve, reject) => {
    // Do not inherit NODE_OPTIONS, auth keys, database credentials or app env.
    const parserFile=path.join(process.cwd(), 'src/lib/knowledge/document-parser.cjs')
    // fork() is statically rewritten as a module import by Turbopack, which
    // turns this runtime file into an unresolvable /ROOT/... module. Launch
    // Node explicitly and retain the same IPC and resource restrictions.
    // Keep the launcher a runtime Node operation. Turbopack also tries to
    // trace/rewrite direct spawn() calls with a Node script argument. Worker
    // files are packaged explicitly by outputFileTracingIncludes instead.
    const launchNode: typeof childProcess.spawn = Reflect.get(childProcess, 'spawn')
    const child = launchNode(process.execPath, ['--max-old-space-size=64', '--max-semi-space-size=8', '--disallow-code-generation-from-strings', '--permission',
        `--allow-fs-read=${parserFile}`, `--allow-fs-read=${path.join(process.cwd(),'node_modules')}`, `--allow-fs-read=${path.join(process.cwd(),'package.json')}`, parserFile], {
      // Resolve dependencies inside the unbundled Node worker. Turbopack's
      // require.resolve() returns module identifiers, not filesystem paths.
      env: { NODE_ENV: 'production' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'json',
    })
    let settled = false
    const finish = (error?: Error, value?: string) => {
      if (settled) return
      settled = true; clearTimeout(timer); child.kill('SIGKILL')
      if (error) reject(error); else resolve(value!)
    }
    const timer = setTimeout(() => finish(new DocumentImportError('The document took too long to check. Try a smaller document.')), 12_000)
    child.once('error', () => finish(new DocumentImportError('The document parser is unavailable. Please retry.', 503)))
    child.once('exit', () => finish(new DocumentImportError('The document could not be processed safely. Try a smaller or re-exported document.')))
    child.once('message', (result: any) => {
      if (result?.ok && typeof result.text === 'string' && result.text.length > 0 && result.text.length <= 250_000) finish(undefined, result.text)
      else finish(new DocumentImportError(typeof result?.error === 'string' ? result.error.slice(0, 220) : 'The document failed validation.'))
    })
    child.send({ data: buffer.toString('base64'), extension }, error => { if (error) finish(new DocumentImportError('The document parser could not start.', 503)) })
  })
  return { text, scanner }
}
