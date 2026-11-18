const { performance } = require('node:perf_hooks');

const REQUEST_COUNT = 10;
const BYTES_PER_MIB = 1024 * 1024;

async function main() {
  if (process.argv.length !== 3) {
    throw new Error('Usage: node speed-test.js <HTTP or HTTPS URL>');
  }

  let url;
  try {
    url = new URL(process.argv[2]);
  } catch {
    throw new Error('Please provide a valid HTTP or HTTPS URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Please provide a valid HTTP or HTTPS URL');
  }

  let totalBytes = 0;
  let totalMilliseconds = 0;

  for (let requestNumber = 1; requestNumber <= REQUEST_COUNT; requestNumber++) {
    const startedAt = performance.now();
    const response = await fetch(url);
    let requestBytes = 0;

    if (!response.ok) {
      throw new Error(`Request ${requestNumber} failed: HTTP ${response.status}`);
    }

    if (response.body) {
      for await (const chunk of response.body) {
        requestBytes += chunk.byteLength;
      }
    }

    const elapsedMilliseconds = performance.now() - startedAt;
    totalBytes += requestBytes;
    totalMilliseconds += elapsedMilliseconds;
    console.log(`Request ${requestNumber}/${REQUEST_COUNT}: ${requestBytes} bytes in ${elapsedMilliseconds.toFixed(2)} ms`);
  }

  const averageMilliseconds = totalMilliseconds / REQUEST_COUNT;
  const mebibytesPerSecond = (totalBytes / BYTES_PER_MIB) / (totalMilliseconds / 1000);

  console.log(`Requests: ${REQUEST_COUNT}`);
  console.log(`Average request time: ${averageMilliseconds.toFixed(2)} ms`);
  console.log(`Total downloaded: ${totalBytes} bytes (${(totalBytes / BYTES_PER_MIB).toFixed(2)} MiB)`);
  console.log(`Download speed: ${mebibytesPerSecond.toFixed(3)} MiB/s`);
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
