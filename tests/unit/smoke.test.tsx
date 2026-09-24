import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import HomePage from "@/app/page";

test("[SETUP-1] home page renders the app name", () => {
  render(<HomePage />);
  expect(screen.getByRole("heading", { name: "BentaTrack" })).toBeTruthy();
});

test("[SETUP-2] IndexedDB is available for offline storage tests", () => {
  expect(typeof indexedDB.open).toBe("function");
});
