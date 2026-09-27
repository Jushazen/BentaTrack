"use client";

// Single-series bar chart of peso amounts (Chart.js). One series, so no legend: the caption names
// it. Colours come from the theme tokens and are re-read when the theme attribute changes. A table view of
// the same numbers sits under the chart for screen readers and exact values.
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { useMemo, useSyncExternalStore } from "react";
import { Bar } from "react-chartjs-2";
import { formatPeso } from "@/lib/money";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

type Palette = { bar: string; text: string; grid: string; surface: string };

const FALLBACK: Palette = { bar: "#7a4e3c", text: "#6b5850", grid: "#e5d9d3", surface: "#ffffff" };

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    // Light: leather brown. Dark: the lighter accent, which keeps contrast on the dark surface.
    bar: token("--indicator", FALLBACK.bar),
    text: token("--muted", FALLBACK.text),
    grid: token("--border", FALLBACK.grid),
    surface: token("--bg", FALLBACK.surface),
  };
}

/**
 * The theme attribute next-themes sets on <html>. Watched directly because next-themes updates it
 * in an effect, after the render in which its resolvedTheme changes.
 */
function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme", "class", "style"] });
  return () => observer.disconnect();
}

function currentTheme(): string {
  return document.documentElement.getAttribute("data-theme") ?? "light";
}

/** Whole pesos for axis ticks: 1234500 → "₱12,345". */
function axisPeso(centavos: number): string {
  const pesos = Math.round(centavos / 100);
  return `${pesos < 0 ? "-" : ""}₱${Math.abs(pesos).toLocaleString("en-PH")}`;
}

export function PesoBarChart({
  title,
  labels,
  values,
  categoryLabel,
}: {
  /** Names the series, e.g. "Net sales by day". */
  title: string;
  labels: string[];
  /** Centavos, one per label. */
  values: number[];
  /** Heading of the label column in the table view, e.g. "Day". */
  categoryLabel: string;
}) {
  const theme = useSyncExternalStore(subscribeToTheme, currentTheme, () => "");
  // The canvas is drawn only in the browser, so the server snapshot never paints anything.
  const palette = useMemo(() => (theme ? readPalette() : FALLBACK), [theme]);

  const data = useMemo<ChartData<"bar">>(
    () => ({
      labels,
      datasets: [
        {
          label: title,
          data: values,
          backgroundColor: palette.bar,
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 32,
          // A 2px surface-coloured gap between neighbouring bars.
          borderColor: palette.surface,
          borderWidth: { left: 1, right: 1 },
        },
      ],
    }),
    [labels, values, title, palette],
  );

  const options = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (item) => formatPeso(Number(item.raw)) },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: palette.text, autoSkip: true, maxRotation: 0 },
          border: { color: palette.grid },
        },
        y: {
          beginAtZero: true,
          grid: { color: palette.grid },
          border: { display: false },
          ticks: { color: palette.text, maxTicksLimit: 5, callback: (v) => axisPeso(Number(v)) },
        },
      },
    }),
    [palette],
  );

  const total = values.reduce((sum, value) => sum + value, 0);

  return (
    <figure className="space-y-3">
      <figcaption className="text-text font-medium">{title}</figcaption>
      <div className="h-64">
        <Bar
          data={data}
          options={options}
          role="img"
          aria-label={`${title}: ${formatPeso(total)} in total. Exact amounts are in the table below.`}
        />
      </div>
      <details className="text-sm">
        <summary className="text-link min-h-11 cursor-pointer py-2 font-medium">
          Show as table
        </summary>
        <table className="w-full">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-muted border-border border-b text-left">
              <th scope="col" className="py-2 font-medium">
                {categoryLabel}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={`${label}-${i}`} className="border-border border-b last:border-b-0">
                <th scope="row" className="text-text py-1.5 text-left font-normal">
                  {label}
                </th>
                <td className="text-text py-1.5 text-right tabular-nums">
                  {formatPeso(values[i])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
