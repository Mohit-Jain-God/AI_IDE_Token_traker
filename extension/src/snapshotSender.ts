/**
 * Snapshot sender — packages account quota data into a JSON payload
 * and HTTP POSTs it to the local dashboard server at 127.0.0.1:9876.
 */

import * as http from 'http';
import type { FullSnapshot } from './types';

/** POST a snapshot to the dashboard server. Returns true on success. */
export async function sendSnapshot(snapshot: FullSnapshot, serverUrl: string): Promise<boolean> {
  const url = new URL('/api/snapshot', serverUrl);
  const body = JSON.stringify(snapshot);

  return new Promise((resolve) => {
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: Number(url.port) || 9876,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': `antigravity-quota-tracker/${snapshot.extensionVersion}`,
      },
    };

    const req = http.request(options, (res) => {
      // Drain the response body
      res.resume();
      res.on('end', () => {
        const ok = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300;
        if (ok) {
          console.log(`[Sender] Snapshot accepted by server (HTTP ${res.statusCode})`);
        } else {
          console.warn(`[Sender] Server returned HTTP ${res.statusCode}`);
        }
        resolve(ok);
      });
    });

    req.on('error', (err) => {
      console.debug(`[Sender] Could not reach dashboard server: ${err.message}`);
      resolve(false);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });

    req.write(body);
    req.end();
  });
}
