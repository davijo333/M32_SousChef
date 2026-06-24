import {
  buildWeatherCueFallback,
  type CreateCue,
  weatherCodeLabel,
} from "@/lib/create-cues";

const DEFAULT_LAT = 40.7128;
const DEFAULT_LON = -74.006;

export async function fetchWeatherCue(): Promise<CreateCue> {
  const lat = Number(process.env.KITCHEN_WEATHER_LAT ?? DEFAULT_LAT);
  const lon = Number(process.env.KITCHEN_WEATHER_LON ?? DEFAULT_LON);

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("current", "temperature_2m,weather_code");
    url.searchParams.set("temperature_unit", "fahrenheit");

    const res = await fetch(url.toString(), {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return buildWeatherCueFallback();

    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const temp = data.current?.temperature_2m;
    const code = data.current?.weather_code ?? 0;
    const label = weatherCodeLabel(code);

    return {
      id: "weather",
      kind: "weather",
      label: temp != null ? `${Math.round(temp)}°F · ${label}` : label,
      detail:
        temp != null && temp >= 78
          ? "Hot day — push iced drinks, cold brew, and lighter sandwiches."
          : temp != null && temp <= 45
            ? "Cool day — feature hot coffee, tea, and warm breakfast plates."
            : "Mild weather — balance hot & iced menu, highlight seasonal produce.",
    };
  } catch {
    return buildWeatherCueFallback();
  }
}
