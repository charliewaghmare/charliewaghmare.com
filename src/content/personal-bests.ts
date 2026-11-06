/**
 * Personal bests.
 *
 * These are not read from Garmin. When you run a new best, edit this list
 * and push the change. The training page picks it up on the next deploy.
 *
 * Example:
 * {
 *   event: "5K",
 *   mark: "18:42",
 *   date: "2026-04-12",
 *   note: "UBC",
 * }
 */

export type PersonalBest = {
  /** What the best is for, such as "5K" or "Half marathon". */
  event: string;
  /** The time or mark, written the way you want it shown. */
  mark: string;
  /** The day you ran it, YYYY-MM-DD. */
  date: string;
  /** Optional place or note. */
  note?: string;
};

export const personalBests: PersonalBest[] = [];
