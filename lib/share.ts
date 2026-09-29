import { APP_NAME } from "./brand";

export function eventLinks(origin: string, code: string) {
  const base = `${origin.replace(/\/$/, "")}/e/${code}`;
  return {
    home: base,
    timer: `${base}/timer`,
    marker: `${base}/marker`,
    board: `${base}/board`,
    admin: `${base}/admin`,
  };
}

/** WhatsApp-ready helper invite: Timer + Marker links and the PIN. */
export function helperShareText(opts: {
  origin: string;
  code: string;
  name: string;
  pin: string | null;
}): string {
  const links = eventLinks(opts.origin, opts.code);
  const lines = [
    `*${APP_NAME} · ${opts.name}*`,
    `Timer: ${links.timer}`,
    `Marker: ${links.marker}`,
  ];
  if (opts.pin) lines.push(`PIN: ${opts.pin}`);
  lines.push(`Board: ${links.board}`);
  return lines.join("\n");
}
