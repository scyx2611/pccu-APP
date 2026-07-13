import {
  buildLegacyProtocolPrelude,
  decodeWebViewEnvelope,
  type WebViewProtocolIdentity,
} from '../protocol';

const expected: WebViewProtocolIdentity = {
  requestId: 'request-7',
  generation: 5,
  nonce: 'nonce-5',
  syncKind: 'schedule',
};

const envelope = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    ...expected,
    event: 'legacy-message',
    payload: { type: 'SCHEDULE_RESULT', data: [] },
    ...overrides,
  });

describe('decodeWebViewEnvelope', () => {
  it('accepts a valid envelope bound to the active request identity', () => {
    expect(decodeWebViewEnvelope(envelope(), expected)).toEqual({
      ok: true,
      value: {
        version: 1,
        ...expected,
        event: 'legacy-message',
        payload: { type: 'SCHEDULE_RESULT', data: [] },
      },
    });
  });

  it.each(['not-json', 'null', '[]', '{}'])('rejects malformed input: %s', (raw) => {
    expect(decodeWebViewEnvelope(raw, expected)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects unsupported protocol versions', () => {
    expect(decodeWebViewEnvelope(envelope({ version: 2 }), expected)).toEqual({
      ok: false,
      reason: 'unsupported_version',
    });
  });

  it.each([
    ['requestId', 'request-8'],
    ['generation', 4],
    ['nonce', 'nonce-4'],
    ['syncKind', 'grade'],
  ])('rejects a mismatched %s', (field, value) => {
    expect(decodeWebViewEnvelope(envelope({ [field]: value }), expected)).toEqual({
      ok: false,
      reason: 'identity_mismatch',
    });
  });

  it.each([
    [{ requestId: '' }],
    [{ generation: -1 }],
    [{ nonce: '' }],
    [{ syncKind: 'unknown' }],
    [{ event: '' }],
  ])('rejects invalid required fields: %o', (overrides) => {
    expect(decodeWebViewEnvelope(envelope(overrides), expected)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('buildLegacyProtocolPrelude', () => {
  it('installs one wrapper per identity while preserving the original bridge', () => {
    const script = buildLegacyProtocolPrelude(expected);

    expect(script).toContain(JSON.stringify(expected));
    expect(script).toContain('__MYCCU_PROTOCOL_ORIGINAL_POST_MESSAGE__');
    expect(script).toContain('__MYCCU_PROTOCOL_MARKER__');
    expect(script).toContain("event: 'legacy-message'");
    expect(script).toContain('/*__MYCCU_PROTOCOL_PRELUDE_END__*/');
  });
});
