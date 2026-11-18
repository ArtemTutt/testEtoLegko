const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const { once } = require('node:events');
const { test } = require('node:test');
const path = require('node:path');

const script = path.join(__dirname, 'speed-test.js');

function runScript(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, url], { timeout: 5000 });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function withServer(handler, run) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const { port } = server.address();
    return await run(`http://127.0.0.1:${port}/file`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('downloads ten full responses one after another and reports their bytes', async () => {
  let requests = 0;
  let active = 0;
  let maxActive = 0;

  await withServer((request, response) => {
    requests++;
    active++;
    maxActive = Math.max(maxActive, active);
    response.on('finish', () => { active--; });
    response.write(Buffer.alloc(1024));
    setTimeout(() => response.end(Buffer.alloc(1024)), 20);
  }, async url => {
    const result = await runScript(url);

    assert.equal(result.signal, null);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(requests, 10);
    assert.equal(maxActive, 1);
    const progressLines = result.stdout.split('\n').filter(line => /^Request \d+\/10:/.test(line));
    assert.equal(progressLines.length, 10);
    for (const [index, line] of progressLines.entries()) {
      assert.match(line, new RegExp(`^Request ${index + 1}/10: 2048 bytes in [\\d.]+ ms$`));
    }
    assert.match(result.stdout, /Requests: 10/);
    assert.match(result.stdout, /Total downloaded: 20480 bytes/);
    const average = Number(result.stdout.match(/Average request time: ([\d.]+) ms/)?.[1]);
    const speed = Number(result.stdout.match(/Download speed: ([\d.]+) MiB\/s/)?.[1]);
    assert.ok(average >= 10, `Expected to wait for the body, got ${average} ms`);
    const expectedSpeed = (20480 / 1048576) / (average * 10 / 1000);
    assert.ok(Math.abs(speed - expectedSpeed) < 0.001);
  });
});

test('stops with a clear error for a failed HTTP response', async () => {
  let requests = 0;

  await withServer((request, response) => {
    requests++;
    response.writeHead(404);
    response.end('Not found');
  }, async url => {
    const result = await runScript(url);

    assert.equal(result.code, 1);
    assert.equal(requests, 1);
    assert.match(result.stderr, /HTTP 404/);
    assert.doesNotMatch(result.stdout, /Download speed/);
  });
});

test('rejects invalid and unsupported URLs', async () => {
  for (const url of ['not-a-url', 'file:///tmp/test']) {
    const result = await runScript(url);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /HTTP or HTTPS URL/);
  }
});
