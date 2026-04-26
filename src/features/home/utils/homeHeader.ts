export type YangmingshanWeather = {
  temp?: number;
  code?: number;
  windspeed?: number;
};

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const STRONG_WIND_KMH = 30;

export function getTimeGreeting(date: Date) {
  const hour = date.getHours();
  if (hour >= 18 || hour < 5) return '晚安';
  if (hour >= 12) return '午安';
  return '早安';
}

export function formatYangmingshanWeather(weather: YangmingshanWeather | null) {
  if (!weather || weather.temp === undefined) {
    return '正在讀取陽明山天氣，稍後幫你看風雨狀況。';
  }

  const tempText = `${weather.temp}°C`;
  const windText = weather.windspeed !== undefined ? `，風速約 ${weather.windspeed} km/h` : '';
  const isRainy = weather.code !== undefined && RAIN_CODES.has(weather.code);
  const isWindy = weather.windspeed !== undefined && weather.windspeed >= STRONG_WIND_KMH;

  if (isRainy && isWindy) {
    return `陽明山有雨、風也偏強，${tempText}${windText}。帶傘並留意路面。`;
  }

  if (isRainy) {
    return `陽明山有雨，${tempText}。出門記得帶傘，路面可能濕滑。`;
  }

  if (isWindy) {
    return `陽明山風勢偏強，${tempText}${windText}。上山留意陣風。`;
  }

  return `陽明山 ${tempText}，天氣穩定；上山前仍留意午後變化。`;
}
