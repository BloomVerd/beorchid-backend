import { Injectable, Logger } from '@nestjs/common';
import { WeatherForecast } from './types/health.types';

interface OpenMeteoResponse {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    windspeed_10m_max: number[];
    relative_humidity_2m_max: number[];
    weathercode: number[];
  };
}

/** Maps a WMO weather interpretation code to a human-readable description and icon name. */
function wmoToDescription(code: number): { description: string; icon: string } {
  if (code === 0) return { description: 'Clear sky', icon: 'sun' };
  if (code <= 2) return { description: 'Partly cloudy', icon: 'cloud-sun' };
  if (code === 3) return { description: 'Overcast', icon: 'cloud' };
  if (code <= 48) return { description: 'Foggy', icon: 'cloud' };
  if (code <= 55) return { description: 'Drizzle', icon: 'cloud-drizzle' };
  if (code <= 57) return { description: 'Freezing drizzle', icon: 'cloud-drizzle' };
  if (code === 61) return { description: 'Light rain', icon: 'cloud-rain' };
  if (code === 63) return { description: 'Moderate rain', icon: 'cloud-rain' };
  if (code === 65) return { description: 'Heavy rain', icon: 'cloud-rain' };
  if (code <= 67) return { description: 'Freezing rain', icon: 'cloud-rain' };
  if (code <= 77) return { description: 'Snow', icon: 'cloud-snow' };
  if (code === 80) return { description: 'Light showers', icon: 'cloud-rain' };
  if (code === 81) return { description: 'Showers', icon: 'cloud-rain' };
  if (code === 82) return { description: 'Heavy showers', icon: 'cloud-rain' };
  if (code <= 86) return { description: 'Snow showers', icon: 'cloud-snow' };
  if (code === 95) return { description: 'Thunderstorm', icon: 'cloud-lightning' };
  if (code <= 99) return { description: 'Thunderstorm with hail', icon: 'cloud-lightning' };
  return { description: 'Unknown', icon: 'cloud' };
}

/**
 * Fetches 7-day weather forecasts from the Open-Meteo API (no API key required).
 * Translates WMO weather codes to human-readable descriptions and icon names.
 * Returns an empty array on any network or HTTP error so callers degrade gracefully.
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly baseUrl = 'https://api.open-meteo.com/v1/forecast';

  /**
   * Fetches a 7-day daily forecast for the given coordinates from Open-Meteo.
   * Returns an empty array on network failure or non-200 responses.
   */
  async getForecast(lat: number, lon: number): Promise<WeatherForecast[]> {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      daily: [
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_sum',
        'windspeed_10m_max',
        'relative_humidity_2m_max',
        'weathercode',
      ].join(','),
      timezone: 'auto',
      forecast_days: '7',
    });

    try {
      const response = await fetch(`${this.baseUrl}?${params}`);
      if (!response.ok) {
        this.logger.warn(`Open-Meteo returned ${response.status} for (${lat}, ${lon})`);
        return [];
      }

      const body = (await response.json()) as OpenMeteoResponse;
      const d = body.daily;

      return d.time.map((date, i) => {
        const { description, icon } = wmoToDescription(d.weathercode[i]);
        return {
          date,
          temperature:
            Math.round(((d.temperature_2m_max[i] + d.temperature_2m_min[i]) / 2) * 10) / 10,
          humidity: d.relative_humidity_2m_max[i],
          rainfall: d.precipitation_sum[i],
          windSpeed: d.windspeed_10m_max[i],
          description,
          icon,
        };
      });
    } catch (err) {
      this.logger.warn(`Weather fetch failed for (${lat}, ${lon}): ${(err as Error).message}`);
      return [];
    }
  }
}
