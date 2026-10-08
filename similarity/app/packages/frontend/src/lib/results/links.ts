/** Only https://app.powerbi.com links are rendered as anchors (002 `reportListHTML`). */
export function safeReportUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'app.powerbi.com' && !parsed.port && !parsed.username && !parsed.password ? parsed.href : null;
  } catch {
    return null;
  }
}
