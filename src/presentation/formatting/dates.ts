export function parseDate(value: string): Date {
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date(value.replace(' ', 'T')) : d;
}

export function formatDate(value: string): string {
  const d = parseDate(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}
