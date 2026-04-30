/**
 * Strategy A — gRPC-web client for the Antigravity local language server.
 *
 * The Antigravity IDE exposes a local gRPC-web endpoint on 127.0.0.1:7493.
 * We send raw HTTP/1.1 POST requests with a hand-crafted protobuf body
 * (no generated stubs needed) and parse the binary response.
 *
 * Protobuf wire format used here:
 *   Field 1 (string modelId)  : tag 0x0A, varint length, bytes
 *   Field 2 (int64 usedTokens): tag 0x10, varint value
 *   Field 3 (int64 limitTokens):tag 0x18, varint value
 *   Field 4 (int64 resetAtMs) : tag 0x20, varint value
 */

import * as http from 'http';
import type { GrpcQuotaResponse } from './types';
import { KNOWN_MODELS, DEFAULT_LIMITS } from './types';

// ─── Protobuf helpers ─────────────────────────────────────────────────────────

/** Encode a 64-bit unsigned integer as a varint into a Buffer. */
function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  let v = BigInt(Math.max(0, Math.floor(value)));
  while (v > 0x7fn) {
    bytes.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  bytes.push(Number(v & 0x7fn));
  return Buffer.from(bytes);
}

/** Decode a varint from a Buffer starting at `offset`. Returns [value, newOffset]. */
function decodeVarint(buf: Buffer, offset: number): [number, number] {
  let result = 0n;
  let shift = 0n;
  let o = offset;
  while (o < buf.length) {
    const byte = buf[o++];
    result |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) break;
    shift += 7n;
  }
  return [Number(result), o];
}

/** Encode a protobuf length-delimited string field. */
function encodeStringField(fieldNumber: number, value: string): Buffer {
  const strBytes = Buffer.from(value, 'utf8');
  const tag = (fieldNumber << 3) | 2; // wire type 2 = length-delimited
  return Buffer.concat([
    encodeVarint(tag),
    encodeVarint(strBytes.length),
    strBytes,
  ]);
}

/** Build the GetModelQuota request protobuf payload for one model ID. */
function buildGetModelQuotaRequest(modelId: string, email: string): Buffer {
  // message GetModelQuotaRequest { string model_id = 1; string account_email = 2; }
  return Buffer.concat([
    encodeStringField(1, modelId),
    encodeStringField(2, email),
  ]);
}

/**
 * Wrap a raw protobuf message in a gRPC-web framing envelope:
 * 1 byte  : 0x00 (no compression)
 * 4 bytes : big-endian message length
 * N bytes : protobuf body
 */
function grpcWebEnvelope(msg: Buffer): Buffer {
  const header = Buffer.allocUnsafe(5);
  header[0] = 0x00;
  header.writeUInt32BE(msg.length, 1);
  return Buffer.concat([header, msg]);
}

/**
 * Parse a gRPC-web response payload.
 * Returns the raw protobuf message bytes (strips the 5-byte frame header).
 */
function parseGrpcWebResponse(data: Buffer): Buffer | null {
  if (data.length < 5) return null;
  const compressed = data[0];
  if (compressed !== 0) {
    console.warn('[gRPC] Compressed gRPC response not supported');
    return null;
  }
  const msgLen = data.readUInt32BE(1);
  if (data.length < 5 + msgLen) return null;
  return data.slice(5, 5 + msgLen);
}

/**
 * Parse GetModelQuotaResponse protobuf:
 *   Field 1 (string model_id)    : tag 0x0A
 *   Field 2 (int64 used_tokens)  : tag 0x10
 *   Field 3 (int64 limit_tokens) : tag 0x18
 *   Field 4 (int64 reset_at_ms)  : tag 0x20
 */
function parseQuotaResponse(buf: Buffer, modelId: string): GrpcQuotaResponse {
  let offset = 0;
  let usedTokens = 0;
  let limitTokens = DEFAULT_LIMITS[modelId] ?? 1_000_000;
  let resetAtUnixMs = 0;
  let parsedModelId = modelId;

  while (offset < buf.length) {
    const [tagByte, afterTag] = decodeVarint(buf, offset);
    offset = afterTag;
    const fieldNumber = tagByte >>> 3;
    const wireType = tagByte & 0x07;

    if (wireType === 0) {
      // Varint
      const [val, nextOffset] = decodeVarint(buf, offset);
      offset = nextOffset;
      if (fieldNumber === 2) usedTokens = val;
      else if (fieldNumber === 3) limitTokens = val;
      else if (fieldNumber === 4) resetAtUnixMs = val;
    } else if (wireType === 2) {
      // Length-delimited
      const [len, nextOffset] = decodeVarint(buf, offset);
      offset = nextOffset;
      if (fieldNumber === 1) {
        parsedModelId = buf.slice(offset, offset + len).toString('utf8');
      }
      offset += len;
    } else {
      // Unknown wire type — skip remaining
      break;
    }
  }

  return { modelId: parsedModelId, usedTokens, limitTokens, resetAtUnixMs };
}

// ─── HTTP transport ───────────────────────────────────────────────────────────

function httpPost(
  host: string,
  port: number,
  path: string,
  body: Buffer,
  timeoutMs = 4000,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host,
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/grpc-web+proto',
          'Content-Length': body.length,
          'X-Grpc-Web': '1',
          'Accept': 'application/grpc-web+proto',
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`gRPC HTTP status ${res.statusCode}`));
          } else {
            resolve(Buffer.concat(chunks));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('gRPC request timed out'));
    });
    req.write(body);
    req.end();
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Probe the Antigravity gRPC language server for quota information.
 * Returns an array of GrpcQuotaResponse for each queried model.
 *
 * @param email  Google account email to query
 * @param port   gRPC-web port (default 7493)
 */
export async function fetchQuotasViaGrpc(
  email: string,
  port = 7493,
): Promise<GrpcQuotaResponse[]> {
  const modelIds = Object.keys(KNOWN_MODELS);
  const results: GrpcQuotaResponse[] = [];

  for (const modelId of modelIds) {
    try {
      const msgBytes = buildGetModelQuotaRequest(modelId, email);
      const body = grpcWebEnvelope(msgBytes);
      const rawResponse = await httpPost('127.0.0.1', port, '/antigravity.QuotaService/GetModelQuota', body);
      const msgBytes2 = parseGrpcWebResponse(rawResponse);
      if (msgBytes2) {
        results.push(parseQuotaResponse(msgBytes2, modelId));
      }
    } catch (err) {
      // Individual model failure is non-fatal — just skip it
      console.debug(`[gRPC] Failed to fetch quota for ${modelId}:`, (err as Error).message);
    }
  }

  return results;
}

/**
 * Quick connectivity check — returns true if the gRPC server responds.
 */
export async function probeGrpcServer(port = 7493): Promise<boolean> {
  try {
    // Send an empty body; any response (even an error) means the server is up
    await httpPost('127.0.0.1', port, '/antigravity.QuotaService/GetModelQuota', Buffer.alloc(0), 2000);
    return true;
  } catch {
    return false;
  }
}
