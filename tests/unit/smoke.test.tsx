import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Wordmark } from "@/components/layout/wordmark";

test("[SETUP-1] React components render in the unit test environment", () => {
  render(<Wordmark />);
  expect(screen.getByText("Estetika")).toBeTruthy();
  expect(screen.getByText("BentaTrack")).toBeTruthy();
});

test("[SETUP-2] IndexedDB is available for offline storage tests", () => {
  expect(typeof indexedDB.open).toBe("function");
});
