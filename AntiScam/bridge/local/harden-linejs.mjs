// Apply AntiScam's Windows loopback Host policy to the pinned Apache-2.0 LINE.js source.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const file = resolve(process.argv[2], 'src/http/server.ts');
const source = await readFile(file, 'utf8');
const anchor = '  function authorizeUpgrade(request: IncomingMessage): boolean {';
const guard = '  function isLoopbackHost(request: IncomingMessage): boolean {';
if (!source.includes(guard)) {
  const edits = [
    [anchor, `${guard}
    return request.headers.host === \`127.0.0.1:\${config.server.port}\`;
  }

${anchor}
    if (!isLoopbackHost(request)) return false;`],
    ['    if (!config.api.enabled || request.headers.origin !== undefined) return false;',
      '    if (!isLoopbackHost(request) || !config.api.enabled || request.headers.origin !== undefined) return false;'],
    ['    if (!host || request.headers["sec-fetch-site"] === "cross-site") {',
      '    if (!isLoopbackHost(request) || request.headers["sec-fetch-site"] === "cross-site") {']
  ];
  let updated = source;
  for (const [before, after] of edits) {
    if (!updated.includes(before)) throw new Error('Pinned LINE.js HTTP source differs from expected version');
    updated = updated.replace(before, after);
  }
  await writeFile(file, updated);
}
