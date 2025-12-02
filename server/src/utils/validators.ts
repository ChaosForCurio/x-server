export function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

export function optionalString(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }
  return undefined;
}

export function parseSchedule(raw?: string | null) {
  if (!raw) {
    return undefined;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid schedule timestamp");
  }
  if (date.getTime() <= Date.now()) {
    throw new Error("Scheduled time must be in the future");
  }
  return date;
}
