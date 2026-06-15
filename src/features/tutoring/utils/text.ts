function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(parseInt(num, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function cleanPlainText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function repairUtf8AsLatin1(value: string): string {
  if (!/[\u0080-\u009f]|[\u00c0-\u00ff]/.test(value)) {
    return value;
  }

  const bytes: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 255) {
      return value;
    }
    bytes.push(`%${code.toString(16).padStart(2, '0')}`);
  }

  try {
    return decodeURIComponent(bytes.join(''));
  } catch {
    return value;
  }
}

function textQualityScore(value: string): number {
  if (!value) return -1000;

  const hanCount = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const entityCount = value.match(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi)?.length ?? 0;
  const replacementCount = value.match(/[\ufffd\u0080-\u009f]/g)?.length ?? 0;
  const mojibakeCount = value.match(/[\u00c0-\u00ff]/g)?.length ?? 0;

  return hanCount * 8 + cleanPlainText(value).length - entityCount * 10 - replacementCount * 20 - mojibakeCount * 2;
}

export function normalizeTutoringText(value?: string | number | null): string {
  let text = String(value ?? '');

  for (let index = 0; index < 3; index += 1) {
    const decoded = decodeHtmlEntities(text);
    if (decoded === text) break;
    text = decoded;
  }

  const repaired = repairUtf8AsLatin1(text);
  if (textQualityScore(repaired) > textQualityScore(text)) {
    text = repaired;
  }

  return cleanPlainText(text);
}
