/**
 * Host half of dsh-plugin-render-fix.
 *
 * The browser half recovers the Plugins panel after its page entry crashes and
 * forwards the original crash to this route, which appends one JSON line to
 * `~/.dsh/plugin-render-fix.ndjson`. That file is the only place the real
 * render error survives: the client renderer reports it through console.error
 * and then abdicates the slot entry, and the console is not readable on the
 * mobile shell.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NS = 'plugin-render-fix';
const LOG_PATH = path.join(os.homedir(), '.dsh', 'plugin-render-fix.ndjson');
const ROUTE = '/plugin-render-fix/log';
const MAX_BODY = 128 * 1024;

export const inject = ['webServer'];

/** Append one bounded request body to the crash log. */
function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.writeHead(405, { Allow: 'POST, GET' });
    res.end();
    return;
  }
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url ?? '/', 'http://guard.invalid');
      const payload = url.searchParams.get('d');
      if (payload !== null) {
        if (payload.length <= MAX_BODY) fs.appendFileSync(LOG_PATH, payload + '\n');
        res.writeHead(204);
        res.end();
        return;
      }
    } catch {
      /* fall through to the empty answer */
    }
    res.writeHead(204);
    res.end();
    return;
  }
  const chunks = [];
  let size = 0;
  let aborted = false;
  req.on('data', (chunk) => {
    if (aborted) return;
    size += chunk.length;
    if (size > MAX_BODY) {
      aborted = true;
      res.writeHead(413);
      res.end();
      return;
    }
    chunks.push(chunk);
  });
  req.on('error', () => { try { res.destroy(); } catch { /* ignore */ } });
  req.on('end', () => {
    if (aborted) return;
    try {
      fs.appendFileSync(LOG_PATH, Buffer.concat(chunks).toString('utf8') + '\n');
      res.writeHead(204);
      res.end();
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(error instanceof Error ? error.message : String(error));
    }
  });
}

export function apply(ctx) {
  ctx.effect(() => {
    try {
      return ctx.webServer.register({ kind: 'exact', path: ROUTE, handler });
    } catch (error) {
      ctx.logger?.warn?.(`[${NS}] crash log route unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return () => {};
    }
  }, `${NS}: crash log route`);
}
