import { isAllowedWebViewUrl } from '../hostPolicy';

describe('isAllowedWebViewUrl', () => {
  it.each([
    'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
    'https://ap1.pccu.edu.tw/queryCourse/index.asp',
    'https://ap2.pccu.edu.tw/studentscore/student/index.asp',
    'https://icas.pccu.edu.tw/cfp/',
    'https://ebus.gov.taipei/Route/StopsOfRoute?routeid=0161000900',
  ])('allows an observed exact HTTPS host: %s', (url) => {
    expect(isAllowedWebViewUrl(url)).toBe(true);
  });

  it.each([
    'http://ecampus.pccu.edu.tw/eCampus/inside.aspx',
    'https://ecampus.pccu.edu.tw.evil.example/inside.aspx',
    'https://evil.ecampus.pccu.edu.tw/inside.aspx',
    'https://student:secret@ecampus.pccu.edu.tw/inside.aspx',
    'javascript:alert(1)',
    'not-a-url',
  ])('rejects an untrusted URL: %s', (url) => {
    expect(isAllowedWebViewUrl(url)).toBe(false);
  });
});
