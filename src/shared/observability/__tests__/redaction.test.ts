import { redactLogValue } from '../redaction';

describe('redactLogValue', () => {
  it('recursively redacts sensitive fields, traverses arrays, and sanitizes URLs', () => {
    const input = {
      account: 'student-id',
      nested: {
        PASSWORD: 'password-value',
        credentialToken: 'credential-value',
        cookieJar: 'cookie-value',
        responseHtml: '<div>private</div>',
        payload: { private: true },
        messagePayload: 'message-value',
        urls: [
          'https://ecampus.pccu.edu.tw/eCampus/inside.aspx?token=private#section',
          { targetUrl: 'http://example.com/private?q=secret' },
        ],
      },
    };

    expect(redactLogValue(input)).toEqual({
      account: '[Redacted]',
      nested: {
        PASSWORD: '[Redacted]',
        credentialToken: '[Redacted]',
        cookieJar: '[Redacted]',
        responseHtml: '[Redacted]',
        payload: '[Redacted]',
        messagePayload: '[Redacted]',
        urls: ['https://ecampus.pccu.edu.tw', { targetUrl: 'http://example.com' }],
      },
    });
    expect(input.account).toBe('student-id');
  });

  it('replaces circular references without hiding repeated non-circular values', () => {
    const shared = { value: 'safe' };
    const circular: Record<string, unknown> = { first: shared, second: shared };
    circular.self = circular;

    expect(redactLogValue(circular)).toEqual({
      first: { value: 'safe' },
      second: { value: 'safe' },
      self: '[Circular]',
    });
  });
});
