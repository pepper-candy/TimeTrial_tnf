/** Race-day flow doc on the Sprint-Event branch (moved under `.cursor/plan/`). */
export const SPRINT_COMPLETE_FLOW_URL =
  "https://github.com/pepper-candy/TimeTrial_tnf/blob/Sprint-Event/.cursor/plan/SPRINT-COMPLETE-FLOW.md";

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

/** Sprint Finish Cam deep link (PIN via PinGate). TT helpers stay on /help → Timer|Marker. */
export function finishCamLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/e/${code}/finish-cam`;
}

/** Sprint Starter deep link (PIN still via PinGate). Hub stays `/help`. */
export function starterLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/e/${code}/starter`;
}
