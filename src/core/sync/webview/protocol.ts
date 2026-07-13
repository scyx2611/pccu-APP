import { SYNC_KINDS, type SyncKind } from '../contracts';

export type WebViewProtocolIdentity<K extends SyncKind = SyncKind> = Readonly<{
  requestId: string;
  generation: number;
  nonce: string;
  syncKind: K;
}>;

export type WebViewEnvelope = WebViewProtocolIdentity &
  Readonly<{
    version: 1;
    event: string;
    payload: unknown;
  }>;

export type DecodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'malformed' | 'unsupported_version' | 'identity_mismatch' };

const syncKindSet = new Set<string>(SYNC_KINDS);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function decodeWebViewEnvelope(
  raw: string,
  expected: WebViewProtocolIdentity,
): DecodeResult<WebViewEnvelope> {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (!isRecord(candidate) || typeof candidate.version !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (candidate.version !== 1) {
    return { ok: false, reason: 'unsupported_version' };
  }

  if (
    typeof candidate.requestId !== 'string' ||
    candidate.requestId.length === 0 ||
    typeof candidate.generation !== 'number' ||
    !Number.isInteger(candidate.generation) ||
    candidate.generation < 0 ||
    typeof candidate.nonce !== 'string' ||
    candidate.nonce.length === 0 ||
    typeof candidate.syncKind !== 'string' ||
    !syncKindSet.has(candidate.syncKind) ||
    typeof candidate.event !== 'string' ||
    candidate.event.length === 0 ||
    !Object.prototype.hasOwnProperty.call(candidate, 'payload')
  ) {
    return { ok: false, reason: 'malformed' };
  }

  if (
    candidate.requestId !== expected.requestId ||
    candidate.generation !== expected.generation ||
    candidate.nonce !== expected.nonce ||
    candidate.syncKind !== expected.syncKind
  ) {
    return { ok: false, reason: 'identity_mismatch' };
  }

  return {
    ok: true,
    value: {
      version: 1,
      requestId: candidate.requestId,
      generation: candidate.generation,
      nonce: candidate.nonce,
      syncKind: candidate.syncKind as SyncKind,
      event: candidate.event,
      payload: candidate.payload,
    },
  };
}

export function buildLegacyProtocolPrelude(identity: WebViewProtocolIdentity): string {
  const serializedIdentity = JSON.stringify(identity);
  return `
/*__MYCCU_PROTOCOL_IDENTITY__${serializedIdentity}__*/
(function() {
  var identity = ${serializedIdentity};
  var bridge = window.ReactNativeWebView;
  if (!bridge || typeof bridge.postMessage !== 'function') return;

  var marker = identity.requestId + ':' + identity.generation + ':' + identity.nonce;
  if (bridge.__MYCCU_PROTOCOL_MARKER__ === marker) return;

  var originalPostMessage =
    bridge.__MYCCU_PROTOCOL_ORIGINAL_POST_MESSAGE__ || bridge.postMessage.bind(bridge);
  bridge.__MYCCU_PROTOCOL_ORIGINAL_POST_MESSAGE__ = originalPostMessage;
  bridge.postMessage = function(rawPayload) {
    var payload = rawPayload;
    if (typeof rawPayload === 'string') {
      try {
        payload = JSON.parse(rawPayload);
      } catch (error) {}
    }
    originalPostMessage(JSON.stringify({
      version: 1,
      requestId: identity.requestId,
      generation: identity.generation,
      nonce: identity.nonce,
      syncKind: identity.syncKind,
      event: 'legacy-message',
      payload: payload
    }));
  };
  bridge.__MYCCU_PROTOCOL_MARKER__ = marker;
})();
/*__MYCCU_PROTOCOL_PRELUDE_END__*/
`;
}
