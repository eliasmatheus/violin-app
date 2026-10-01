export const DEFAULT_CLOCK_DATE_FORMAT = "compact";

const DATE_FORMATS: Record<string, Intl.DateTimeFormatOptions> = {
  long: { weekday: "long", day: "2-digit", month: "long", year: "numeric" },
  medium: { day: "2-digit", month: "long", year: "numeric" },
  short: { day: "2-digit", month: "2-digit", year: "numeric" },
  weekday: { weekday: "long", day: "2-digit", month: "long" },
  month_year: { month: "long", year: "numeric" },
  weekday_only: { weekday: "long" },
};

const COMPACT_WITH_SECONDS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "2-digit",
  month: "long",
  year: "numeric",
};

const COMPACT_WITHOUT_SECONDS_PT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
};

const COMPACT_WITHOUT_SECONDS_ES: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
};

/** Mantém a data secundária com largura próxima à hora nos dois formatos de relógio. */
export function formatClockDate(
  now: Date,
  locale: string,
  format: string,
  showSeconds: boolean
): string {
  const savedFormat = Object.hasOwn(DATE_FORMATS, format) ? DATE_FORMATS[format] : null;
  let options = savedFormat;
  if (!options) {
    if (showSeconds) options = COMPACT_WITH_SECONDS;
    else
      options = locale.startsWith("es") ? COMPACT_WITHOUT_SECONDS_ES : COMPACT_WITHOUT_SECONDS_PT;
  }

  return now.toLocaleDateString(locale, options);
}
