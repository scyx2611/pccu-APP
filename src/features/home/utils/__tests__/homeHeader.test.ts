import { formatYangmingshanWeather, getTimeGreeting } from '../homeHeader';

describe('home header copy', () => {
  it('greets by time of day', () => {
    expect(getTimeGreeting(new Date('2026-04-25T08:00:00+08:00'))).toBe('早安');
    expect(getTimeGreeting(new Date('2026-04-25T13:00:00+08:00'))).toBe('午安');
    expect(getTimeGreeting(new Date('2026-04-25T21:00:00+08:00'))).toBe('晚安');
  });

  it('prioritizes rain and strong wind with useful Yangmingshan weather guidance', () => {
    expect(formatYangmingshanWeather({ temp: 22, code: 61, windspeed: 12 })).toBe(
      '陽明山有雨，22°C。出門記得帶傘，路面可能濕滑。',
    );
    expect(formatYangmingshanWeather({ temp: 20, code: 1, windspeed: 35 })).toBe(
      '陽明山風勢偏強，20°C，風速約 35 km/h。上山留意陣風。',
    );
    expect(formatYangmingshanWeather({ temp: 19, code: 63, windspeed: 38 })).toBe(
      '陽明山有雨、風也偏強，19°C，風速約 38 km/h。帶傘並留意路面。',
    );
    expect(formatYangmingshanWeather({ temp: 24, code: 1, windspeed: 8 })).toBe(
      '陽明山 24°C，天氣穩定；上山前仍留意午後變化。',
    );
  });
});
