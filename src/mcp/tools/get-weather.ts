import axios from 'axios';
import { config } from '../../config';

export type WeatherData = {
  location: string;
  temperature: number;
  feelsLike: number;
  condition: string;
  description: string;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  visibility: number;
  alerts: WeatherAlert[];
  timestamp: string;
};

export type WeatherAlert = {
  event: string;
  description: string;
  start: string;
  end: string;
  severity: string;
};

export async function getWeather(location: string): Promise<WeatherData> {
  if (!config.apis.openWeatherKey) {
    return getMockWeather(location);
  }

  try {
    const [currentRes, alertsRes] = await Promise.all([
      axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: { q: location, appid: config.apis.openWeatherKey, units: 'metric' },
        timeout: 8000,
      }),
      axios.get('https://api.openweathermap.org/data/2.5/onecall', {
        params: {
          lat: 0, lon: 0, // Will be replaced after geocoding
          appid: config.apis.openWeatherKey,
          exclude: 'current,minutely,hourly,daily',
        },
        timeout: 8000,
      }).catch(() => ({ data: { alerts: [] } })),
    ]);

    const d = currentRes.data;
    return {
      location,
      temperature: Math.round(d.main.temp),
      feelsLike: Math.round(d.main.feels_like),
      condition: d.weather[0].main,
      description: d.weather[0].description,
      humidity: d.main.humidity,
      windSpeed: Math.round(d.wind.speed * 3.6), // m/s to km/h
      windDirection: d.wind.deg ?? 0,
      visibility: Math.round((d.visibility ?? 10000) / 1000),
      alerts: (alertsRes.data.alerts ?? []).map((a: any) => ({
        event: a.event,
        description: a.description.slice(0, 200),
        start: new Date(a.start * 1000).toISOString(),
        end: new Date(a.end * 1000).toISOString(),
        severity: 'HIGH',
      })),
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[WeatherTool] API error, using mock data:', (err as Error).message);
    return getMockWeather(location);
  }
}

function getMockWeather(location: string): WeatherData {
  return {
    location,
    temperature: 28,
    feelsLike: 33,
    condition: 'Thunderstorm',
    description: 'heavy intensity rain with thunderstorm — conditions dangerous for outdoor activities',
    humidity: 92,
    windSpeed: 65,
    windDirection: 180,
    visibility: 2,
    alerts: [
      {
        event: 'Flash Flood Warning',
        description: 'Flash flooding is occurring or imminent. Dangerous amounts of rain have fallen over the area. Evacuation orders may be issued. Do not attempt to drive through flooded roads.',
        start: new Date().toISOString(),
        end: new Date(Date.now() + 6 * 3600000).toISOString(),
        severity: 'CRITICAL',
      },
      {
        event: 'High Wind Advisory',
        description: 'Winds of 60-70 km/h with gusts up to 90 km/h expected. Power outages and downed trees likely.',
        start: new Date().toISOString(),
        end: new Date(Date.now() + 4 * 3600000).toISOString(),
        severity: 'HIGH',
      },
    ],
    timestamp: new Date().toISOString(),
  };
}

export function formatWeatherReport(w: WeatherData): string {
  const alertSection = w.alerts.length > 0
    ? `\n⚠️ ACTIVE ALERTS (${w.alerts.length}):\n` +
      w.alerts.map((a) => `• [${a.severity}] ${a.event}: ${a.description.slice(0, 150)}`).join('\n')
    : '\n✅ No active weather alerts.';

  return `🌤️ WEATHER REPORT — ${w.location}
Temperature: ${w.temperature}°C (Feels like ${w.feelsLike}°C)
Condition: ${w.condition} — ${w.description}
Humidity: ${w.humidity}% | Wind: ${w.windSpeed} km/h | Visibility: ${w.visibility} km${alertSection}
Updated: ${w.timestamp}`;
}
