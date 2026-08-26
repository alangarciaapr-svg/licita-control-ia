export class UpstreamBodyError extends Error {
  constructor(public readonly code: 'UPSTREAM_RESPONSE_TOO_LARGE' | 'INVALID_UPSTREAM_RESPONSE') {
    super(code);
  }
}

/** Bound bytes actually read, including responses without an honest Content-Length. */
export async function readBoundedJson(response: Response, maxBytes = 5_000_000): Promise<unknown> {
  if (Number(response.headers.get('Content-Length')) > maxBytes) {
    await response.body?.cancel();
    throw new UpstreamBodyError('UPSTREAM_RESPONSE_TOO_LARGE');
  }
  if (!response.body) throw new UpstreamBodyError('INVALID_UPSTREAM_RESPONSE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new UpstreamBodyError('UPSTREAM_RESPONSE_TOO_LARGE');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    reader.releaseLock();
  }
}
