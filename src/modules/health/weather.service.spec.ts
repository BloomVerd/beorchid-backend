import { Test, TestingModule } from '@nestjs/testing';
import { WeatherService } from './weather.service';

const makeOpenMeteoResponse = (overrides: Record<string, unknown[]> = {}) => ({
  daily: {
    time: ['2026-06-06', '2026-06-07'],
    temperature_2m_max: [30, 28],
    temperature_2m_min: [20, 18],
    precipitation_sum: [0, 5],
    windspeed_10m_max: [12, 8],
    relative_humidity_2m_max: [65, 72],
    weathercode: [0, 61],
    ...overrides,
  },
});

const mockFetch = (body: unknown, ok = true, status = 200) =>
  jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(String(body)),
  } as unknown as Response);

describe('WeatherService', () => {
  let service: WeatherService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WeatherService],
    }).compile();
    service = module.get<WeatherService>(WeatherService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('getForecast', () => {
    it('returns mapped forecasts for a valid response', async () => {
      mockFetch(makeOpenMeteoResponse());

      const result = await service.getForecast(5.6, -0.2);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        date: '2026-06-06',
        temperature: 25,   // (30+20)/2
        humidity: 65,
        rainfall: 0,
        windSpeed: 12,
        description: 'Clear sky',
        icon: 'sun',
      });
      expect(result[1]).toMatchObject({
        date: '2026-06-07',
        temperature: 23,   // (28+18)/2
        humidity: 72,
        rainfall: 5,
        windSpeed: 8,
        description: 'Light rain',
        icon: 'cloud-rain',
      });
    });

    it('rounds temperature to one decimal place', async () => {
      mockFetch(makeOpenMeteoResponse({
        temperature_2m_max: [29],
        temperature_2m_min: [20],
        time: ['2026-06-06'],
        precipitation_sum: [0],
        windspeed_10m_max: [10],
        relative_humidity_2m_max: [60],
        weathercode: [0],
      }));

      const result = await service.getForecast(5.6, -0.2);

      expect(result[0].temperature).toBe(24.5); // (29+20)/2 = 24.5
    });

    it('maps weathercode 0 to Clear sky / sun', async () => {
      mockFetch(makeOpenMeteoResponse({ weathercode: [0, 0] }));
      const result = await service.getForecast(0, 0);
      expect(result[0]).toMatchObject({ description: 'Clear sky', icon: 'sun' });
    });

    it('maps weathercode 1-2 to Partly cloudy / cloud-sun', async () => {
      mockFetch(makeOpenMeteoResponse({ weathercode: [1, 2] }));
      const result = await service.getForecast(0, 0);
      expect(result[0]).toMatchObject({ icon: 'cloud-sun' });
      expect(result[1]).toMatchObject({ icon: 'cloud-sun' });
    });

    it('maps weathercode 3 to Overcast / cloud', async () => {
      mockFetch(makeOpenMeteoResponse({ weathercode: [3, 3] }));
      const result = await service.getForecast(0, 0);
      expect(result[0]).toMatchObject({ description: 'Overcast', icon: 'cloud' });
    });

    it('maps weathercode 63 to Moderate rain / cloud-rain', async () => {
      mockFetch(makeOpenMeteoResponse({ weathercode: [63, 63] }));
      const result = await service.getForecast(0, 0);
      expect(result[0]).toMatchObject({ description: 'Moderate rain', icon: 'cloud-rain' });
    });

    it('maps weathercode 95 to Thunderstorm / cloud-lightning', async () => {
      mockFetch(makeOpenMeteoResponse({ weathercode: [95, 95] }));
      const result = await service.getForecast(0, 0);
      expect(result[0]).toMatchObject({ description: 'Thunderstorm', icon: 'cloud-lightning' });
    });

    it('returns [] when fetch response is not ok', async () => {
      mockFetch('Internal Server Error', false, 500);

      const result = await service.getForecast(5.6, -0.2);

      expect(result).toEqual([]);
    });

    it('returns [] when fetch throws a network error', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const result = await service.getForecast(5.6, -0.2);

      expect(result).toEqual([]);
    });

    it('passes lat and lon as query parameters', async () => {
      const spy = mockFetch(makeOpenMeteoResponse());

      await service.getForecast(5.614818, -0.205874);

      const calledUrl = (spy.mock.calls[0][0] as string);
      expect(calledUrl).toContain('latitude=5.614818');
      expect(calledUrl).toContain('longitude=-0.205874');
    });

    it('requests 7 days of forecast', async () => {
      const spy = mockFetch(makeOpenMeteoResponse());

      await service.getForecast(0, 0);

      expect(spy.mock.calls[0][0] as string).toContain('forecast_days=7');
    });
  });
});
