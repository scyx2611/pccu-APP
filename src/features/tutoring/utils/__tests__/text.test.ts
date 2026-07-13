import { normalizeTutoringText } from '../text';

describe('normalizeTutoringText', () => {
  it('decodes HTML entities', () => {
    expect(normalizeTutoringText('&#x8AB2;&#x7A0B;&#x9032;&#x5EA6;')).toBe('課程進度');
  });

  it('decodes nested HTML entities', () => {
    expect(normalizeTutoringText('&amp;#x9673;&amp;#x5927;&amp;#x6587;')).toBe('陳大文');
  });

  it('repairs UTF-8 text that was interpreted as Latin-1', () => {
    expect(
      normalizeTutoringText(
        '\u00e8\u00aa\u00b2\u00e7\u00a8\u008b\u00e9\u0080\u00b2\u00e5\u00ba\u00a6',
      ),
    ).toBe('課程進度');
  });

  it('keeps already-readable Chinese text unchanged', () => {
    expect(normalizeTutoringText('王小明')).toBe('王小明');
  });
});
