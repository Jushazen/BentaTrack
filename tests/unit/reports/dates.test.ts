import { describe, expect, test } from "vitest";
import {
  manilaDateKey,
  parseManilaDateKey,
  periodBuckets,
  periodRange,
  periodTitle,
  shiftPeriod,
} from "@/lib/dates";

const iso = (range: { start: Date; end: Date }) => [
  range.start.toISOString(),
  range.end.toISOString(),
];

describe("Manila report periods", () => {
  test("[FR-021-TZ] a day runs from midnight to midnight Philippine time (UTC+8)", () => {
    // 23:59:59 on Sunday 27 Sep in Manila is still 15:59:59 UTC.
    expect(iso(periodRange("day", new Date("2026-09-27T15:59:59Z")))).toEqual([
      "2026-09-26T16:00:00.000Z",
      "2026-09-27T16:00:00.000Z",
    ]);
    // One second later it's Monday in Manila.
    expect(iso(periodRange("day", new Date("2026-09-27T16:00:00Z")))).toEqual([
      "2026-09-27T16:00:00.000Z",
      "2026-09-28T16:00:00.000Z",
    ]);
  });

  test("[FR-021-TZ] weeks start on Monday, even when the report is opened on a Sunday", () => {
    const sunday = new Date("2026-09-27T04:00:00Z");
    expect(iso(periodRange("week", sunday))).toEqual([
      "2026-09-20T16:00:00.000Z",
      "2026-09-27T16:00:00.000Z",
    ]);
    const monday = new Date("2026-09-20T16:00:00Z");
    expect(periodRange("week", monday).start.toISOString()).toBe("2026-09-20T16:00:00.000Z");
    expect(periodTitle("week", periodRange("week", sunday))).toBe("21–27 September 2026");
  });

  test("[FR-021-TZ] months and years start at Manila midnight, not UTC midnight", () => {
    // 1 Jan 2026 00:00 in Manila is 31 Dec 2025 16:00 UTC.
    const newYear = new Date("2025-12-31T16:00:00Z");
    expect(iso(periodRange("year", newYear))).toEqual([
      "2025-12-31T16:00:00.000Z",
      "2026-12-31T16:00:00.000Z",
    ]);
    expect(periodRange("year", new Date("2025-12-31T15:59:59Z")).start.toISOString()).toBe(
      "2024-12-31T16:00:00.000Z",
    );
    expect(iso(periodRange("month", new Date("2026-02-15T00:00:00Z")))).toEqual([
      "2026-01-31T16:00:00.000Z",
      "2026-02-28T16:00:00.000Z",
    ]);
  });

  test("[FR-021-TZ] chart buckets cover the period exactly", () => {
    const anchor = new Date("2026-09-24T00:00:00Z");
    expect(periodBuckets("day", periodRange("day", anchor))).toHaveLength(24);
    const week = periodBuckets("week", periodRange("week", anchor));
    expect(week.map((b) => b.label)).toEqual([
      "Mon 21",
      "Tue 22",
      "Wed 23",
      "Thu 24",
      "Fri 25",
      "Sat 26",
      "Sun 27",
    ]);
    expect(periodBuckets("month", periodRange("month", anchor))).toHaveLength(30);
    const year = periodBuckets("year", periodRange("year", anchor));
    expect(year).toHaveLength(12);
    expect(year[0].start.toISOString()).toBe("2025-12-31T16:00:00.000Z");
    expect(year[11].end.toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });

  test("[FR-021-TZ] date keys are Manila calendar dates and bad dates are rejected", () => {
    expect(manilaDateKey(new Date("2025-12-31T16:00:00Z"))).toBe("2026-01-01");
    expect(parseManilaDateKey("2026-03-01")?.toISOString()).toBe("2026-02-28T16:00:00.000Z");
    expect(parseManilaDateKey("2026-02-30")).toBeNull();
    expect(parseManilaDateKey("yesterday")).toBeNull();
    // Stepping from 31 January lands on the last day of February.
    expect(manilaDateKey(shiftPeriod("month", parseManilaDateKey("2026-01-31")!, 1))).toBe(
      "2026-02-28",
    );
  });
});
