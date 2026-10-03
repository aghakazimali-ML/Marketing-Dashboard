/** Neutralize CSV formula injection for Excel/Sheets. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Safe external IDs for third-party APIs (alphanumeric, :, _, -, .) */
export function isSafeExternalId(id: string): boolean {
  return /^[A-Za-z0-9:_.\-]{1,128}$/.test(id.trim());
}

export function safeClientError(status: number, fallback = "Request failed") {
  if (status >= 500) return fallback;
  return `Upstream API error (${status})`;
}

/** Prefix text that spreadsheet apps could evaluate as a formula. */
export function safeSpreadsheetText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
