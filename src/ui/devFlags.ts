/** Dev/playtest flags persisted in localStorage.
 *
 * Placeholder mode forces the procedural figures even though the animated
 * sheets exist — so the PRD's "play 50 matches against rectangle sprites"
 * fun-test can be run honestly, without the art biasing the read. */

const PLACEHOLDER_KEY = 'inkborn.placeholders';

export function placeholderMode(): boolean {
  try {
    return localStorage.getItem(PLACEHOLDER_KEY) === '1';
  } catch {
    return false;
  }
}

/** Flip the flag and return the new value. Caller reloads to apply. */
export function togglePlaceholderMode(): boolean {
  const next = !placeholderMode();
  try {
    localStorage.setItem(PLACEHOLDER_KEY, next ? '1' : '0');
  } catch {
    // storage unavailable — toggle is best-effort
  }
  return next;
}
