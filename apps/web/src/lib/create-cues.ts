export type CreateCueKind =
  | "day"
  | "weather"
  | "holiday"
  | "season"
  | "ingredient"
  | "pantry";

export type CreateCue = {
  id: string;
  kind: CreateCueKind;
  label: string;
  detail: string;
};

type HolidayDef = {
  id: string;
  name: string;
  month: number;
  day: number;
  pitch: string;
};

const HOLIDAYS: HolidayDef[] = [
  { id: "new-year", name: "New Year's Day", month: 1, day: 1, pitch: "Resolution-friendly bowls & lighter sips" },
  { id: "valentines", name: "Valentine's Day", month: 2, day: 14, pitch: "Shareable pastries & indulgent coffee drinks" },
  { id: "st-patricks", name: "St. Patrick's Day", month: 3, day: 17, pitch: "Green herbs, avocado, matcha-style specials" },
  { id: "easter", name: "Easter weekend", month: 4, day: 20, pitch: "Brunch sandwiches & spring pastries" },
  { id: "mothers-day", name: "Mother's Day", month: 5, day: 11, pitch: "Upscale brunch plates & floral teas" },
  { id: "memorial-day", name: "Memorial Day", month: 5, day: 26, pitch: "Picnic-friendly handhelds & cold brew" },
  { id: "july-4", name: "Independence Day", month: 7, day: 4, pitch: "All-American breakfast stacks & iced drinks" },
  { id: "labor-day", name: "Labor Day", month: 9, day: 1, pitch: "End-of-summer comfort sandwiches" },
  { id: "halloween", name: "Halloween", month: 10, day: 31, pitch: "Spiced syrups & playful pastry add-ons" },
  { id: "thanksgiving", name: "Thanksgiving", month: 11, day: 27, pitch: "Harvest croissants & seasonal sides" },
  { id: "christmas", name: "Christmas", month: 12, day: 25, pitch: "Festive hot drinks & giftable pastry boxes" },
];

function daysUntil(month: number, day: number, now: Date): number {
  const year = now.getFullYear();
  let target = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (target.getTime() < now.getTime() - 86400000) {
    target = new Date(year + 1, month - 1, day, 12, 0, 0, 0);
  }
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

export function buildDayCue(now = new Date()): CreateCue {
  const day = now.toLocaleDateString(undefined, { weekday: "long" });
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  return {
    id: "day",
    kind: "day",
    label: day,
    detail: isWeekend
      ? "Weekend brunch rush — lean into stacks, pastries, and specialty coffee."
      : "Weekday morning commute — fast coffee, bagels, and portable sandwiches.",
  };
}

export function buildSeasonalIngredientCue(now = new Date()): CreateCue {
  const month = now.getMonth() + 1;
  if (month >= 3 && month <= 5) {
    return {
      id: "ingredients-spring",
      kind: "ingredient",
      label: "Spring produce",
      detail:
        "Spinach, asparagus, strawberries, avocado & fresh herbs — bright salads, garden croissants, and juice refreshers.",
    };
  }
  if (month >= 6 && month <= 8) {
    return {
      id: "ingredients-summer",
      kind: "ingredient",
      label: "Summer produce",
      detail:
        "Berries, stone fruit, tomatoes & cucumbers — iced drinks, cold sandwiches, and chilled juice specials.",
    };
  }
  if (month >= 9 && month <= 11) {
    return {
      id: "ingredients-fall",
      kind: "ingredient",
      label: "Fall harvest",
      detail:
        "Pumpkin, apples, squash & cranberries — spiced lattes, harvest melts, and pastry add-ons.",
    };
  }
  return {
    id: "ingredients-winter",
    kind: "ingredient",
    label: "Winter ingredients",
    detail:
      "Citrus, pomegranate, root vegetables & kale — hot comfort plates, mocha drinks, and hearty melts.",
  };
}

export function buildExpiringPantryCue(
  names: string[]
): CreateCue | null {
  if (names.length === 0) return null;
  const preview = names.slice(0, 5).join(", ");
  const suffix = names.length > 5 ? ` +${names.length - 5} more` : "";
  return {
    id: "pantry-expiring",
    kind: "pantry",
    label:
      names.length === 1
        ? "1 ingredient expiring soon"
        : `${names.length} ingredients expiring soon`,
    detail: `Use before they spoil: ${preview}${suffix}.`,
  };
}

export const CUE_KIND_LABELS: Record<CreateCueKind, string> = {
  day: "Today",
  weather: "Weather",
  holiday: "Holiday",
  season: "Season",
  ingredient: "Seasonal ingredients",
  pantry: "Use soon",
};

export function cueToChatPrompt(cue: CreateCue): string {
  return `Ideas for ${cue.label}: ${cue.detail}`;
}

export function buildSeasonCue(now = new Date()): CreateCue {
  const month = now.getMonth() + 1;
  if (month >= 3 && month <= 5) {
    return {
      id: "season-spring",
      kind: "season",
      label: "Spring",
      detail: "Bright produce, lighter sandwiches, iced tea & juice refreshers.",
    };
  }
  if (month >= 6 && month <= 8) {
    return {
      id: "season-summer",
      kind: "season",
      label: "Summer",
      detail: "Cold brew, frappes, iced juice — keep hot kitchen items minimal.",
    };
  }
  if (month >= 9 && month <= 11) {
    return {
      id: "season-fall",
      kind: "season",
      label: "Fall",
      detail: "Warm spices, mocha & hazelnut drinks, hearty breakfast sandwiches.",
    };
  }
  return {
    id: "season-winter",
    kind: "season",
    label: "Winter",
    detail: "Hot coffee, tea, and comforting melts — promote warm grab-and-go.",
  };
}

export function buildHolidayCues(now = new Date(), withinDays = 45): CreateCue[] {
  const upcoming = HOLIDAYS.map((holiday) => ({
    holiday,
    days: daysUntil(holiday.month, holiday.day, now),
  }))
    .filter((row) => row.days >= 0 && row.days <= withinDays)
    .sort((a, b) => a.days - b.days)
    .slice(0, 2);

  return upcoming.map(({ holiday, days }) => ({
    id: holiday.id,
    kind: "holiday" as const,
    label: days === 0 ? `${holiday.name} — today` : `${holiday.name} — in ${days}d`,
    detail: holiday.pitch,
  }));
}

export function weatherCodeLabel(code: number): string {
  if (code === 0) return "Clear skies";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 67) return "Rainy";
  if (code <= 77) return "Snowy";
  if (code <= 82) return "Rain showers";
  return "Stormy";
}

export function buildWeatherCueFallback(now = new Date()): CreateCue {
  const season = buildSeasonCue(now);
  return {
    id: "weather-fallback",
    kind: "weather",
    label: "Local weather",
    detail: `Seasonal cue: ${season.label.toLowerCase()} menu ideas — ask the chef agent for specifics.`,
  };
}

export function buildCreateCues(
  weather: CreateCue | null,
  now = new Date(),
  pantryExpiringNames: string[] = []
): CreateCue[] {
  const cues = [
    buildDayCue(now),
    buildSeasonCue(now),
    buildSeasonalIngredientCue(now),
    ...buildHolidayCues(now),
  ];
  cues.splice(1, 0, weather ?? buildWeatherCueFallback(now));
  const pantryCue = buildExpiringPantryCue(pantryExpiringNames);
  if (pantryCue) cues.push(pantryCue);
  return cues;
}

export function formatCuesForPrompt(cues: CreateCue[]): string {
  return cues.map((cue) => `- ${cue.label}: ${cue.detail}`).join("\n");
}
