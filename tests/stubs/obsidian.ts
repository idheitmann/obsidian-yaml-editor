// Minimal stub of the Obsidian API surface used by code under test.
// Aliased in place of the real `obsidian` package during unit tests
// (the real package is only available inside the Obsidian runtime).

export class TFile {
  path = "";
  extension = "md";
}

export class App {}

export function debounce<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  return fn;
}
