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

export const personalBests: PersonalBest[] = [
  {
    event: "10K",
    mark: "33:35",
    date: "2026-05-10",
    note: "Sporting Life 10K",
  },
  {
    event: "5K",
    mark: "15:43",
    date: "2026-11-17",
    note: "Thunderbirds Time Trial",
  },
  {
    event: "1500m",
    mark: "4:07",
    date: "2026-07-21",
    note: "UTTC Twilight 4",
  },
  {
    event: "800m",
    mark: "1:56",
    date: "2026-07-07",
    note: "UTTC 800m Night",
  },
];
