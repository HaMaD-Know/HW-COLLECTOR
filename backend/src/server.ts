import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AnthropicIdentifier, ProviderError } from './anthropic-provider.ts';
import { loadConfig } from './config.ts';
import { RateLimiter } from './rate-limit.ts';
import { MAX_BODY_BYTES, RequestValidationError, validateIdentifyRequest } from './validation.ts';

const config = loadConfig();
const limiter = new RateLimiter(config.rateLimitPerMinute, config.rateLimitPerDay);
const identifier = config.anthropicApiKey
  ? new AnthropicIdentifier(config.anthropicApiKey, config.model, config.effort, config.requestTimeoutMs)
  : null;
let inFlight = 0;

function log(event: string, fields: Record<string, unknown> = {}): void {
  // Never log request bodies, image data or keys.
  console.info(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

function clientKey(req: IncomingMessage): string {
  if (config.trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-Token');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      reject(new RequestValidationError(413, 'Image is larger than 4 MB.'));
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new RequestValidationError(413, 'Image is larger than 4 MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleIdentify(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (config.clientToken && req.headers['x-client-token'] !== config.clientToken) {
    send(res, 401, { error: 'Unknown client.' });
    return;
  }
  if (!identifier) {
    send(res, 503, { error: 'AI provider is not configured on the server.' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
    send(res, 415, { error: 'Send JSON.' });
    return;
  }
  const wait = limiter.check(clientKey(req));
  if (wait > 0) {
    send(res, 429, { error: 'Too many requests. Try again later.' }, { 'Retry-After': String(wait) });
    return;
  }
  if (inFlight >= config.maxConcurrent) {
    send(res, 503, { error: 'Server is busy. Try again shortly.' }, { 'Retry-After': '5' });
    return;
  }

  inFlight++;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs + 5000);
  res.on('close', () => controller.abort()); // client went away
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readBody(req));
    } catch (error) {
      if (error instanceof RequestValidationError) throw error;
      throw new RequestValidationError(400, 'Body is not valid JSON.');
    }
    const request = validateIdentifyRequest(parsed);
    const result = await identifier.identify(request, controller.signal);
    log('identify.ok', { ms: Date.now() - started, review: result.needsManualReview });
    send(res, 200, result);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      send(res, error.status, { error: error.message });
    } else if (error instanceof ProviderError) {
      log('identify.provider_error', { status: error.status, ms: Date.now() - started });
      const headers: Record<string, string> = error.retryAfterSeconds
        ? { 'Retry-After': String(error.retryAfterSeconds) }
        : {};
      send(res, error.status, { error: error.message }, headers);
    } else {
      log('identify.error', { message: error instanceof Error ? error.name : 'unknown' });
      send(res, 500, { error: 'Identification failed.' });
    }
  } finally {
    clearTimeout(timer);
    inFlight--;
  }
}

const server = createServer((req, res) => {
  applyCors(req, res);
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    send(res, 200, { ok: true, configured: identifier !== null, provider: identifier ? 'anthropic' : null });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/v1/identify') {
    void handleIdentify(req, res);
    return;
  }
  send(res, 404, { error: 'Not found.' });
});

server.requestTimeout = config.requestTimeoutMs + 15000;
server.listen(config.port, () => {
  log('server.start', {
    port: config.port,
    providerConfigured: identifier !== null,
    model: config.model,
    origins: config.allowedOrigins,
  });
  if (!identifier) log('server.warning', { message: 'ANTHROPIC_API_KEY is not set; /v1/identify returns 503.' });
});
