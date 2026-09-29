export function eventLinks(origin: string, code: string) {
  const base = `${origin.replace(/\/$/, "")}/e/${code}`;
  return {
    board: `${base}/board`,
    helper: helperLink(origin, code),
  };
}

/** The only helper URL. Admin's Helper QR and Share helper both use this. No PIN. */
export function helperLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/e/${code}/help`;
}
