/** Short pulses. Many phones only fire vibrate from a user gesture (pointer up/down). */
export function haptic(pattern: number | number[] = 18) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported (iPhone Safari) */
  }
}

export function hapticTap() {
  haptic(18);
}

/** Hold completed and the action committed. */
export function hapticHoldOk() {
  haptic([24, 40, 36]);
}

export function hapticBellCheck() {
  haptic(22);
}
