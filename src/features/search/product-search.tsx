"use client";

// Live product search box (FR-026–028). Type a name or code to see matches; Enter on a typed or
// scanner-typed barcode or code opens that product straight away. Reused by checkout (leaf 4.1)
// through `onPick`.
import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { inputClasses } from "@/components/ui/field";
import { StockStatusBadge } from "@/features/products/product-badges";
import { formatPeso } from "@/lib/money";
import { lookupProductAction, searchProductsAction } from "./actions";
import type { SearchHit } from "./queries";

const DEBOUNCE_MS = 150;

type ProductSearchProps = {
  onPick: (hit: SearchHit) => void;
  /** Enter on text that isn't an exact code or barcode. Defaults to picking the only match. */
  onNoExactMatch?: (query: string, results: SearchHit[]) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
};

export function ProductSearch({
  onPick,
  onNoExactMatch,
  label = "Find a product",
  placeholder = "Name, code, or barcode",
  autoFocus,
}: ProductSearchProps) {
  const id = useId();
  const listId = `${id}-results`;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [looking, setLooking] = useState(false);
  // Only the newest request may update the results, whatever order the replies arrive in.
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const request = ++latest.current;
    if (!q) return;
    const timer = setTimeout(async () => {
      try {
        const result = await searchProductsAction(q);
        if (request !== latest.current) return;
        setResults(result.ok ? result.data : []);
        setSearched(q);
        setActive(-1);
      } catch {
        // Offline or the server is unreachable: keep the last results.
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  function reset() {
    latest.current++;
    setQuery("");
    setResults([]);
    setSearched("");
    setOpen(false);
    setActive(-1);
  }

  function pick(hit: SearchHit) {
    reset();
    onPick(hit);
  }

  async function submit() {
    const q = query.trim();
    if (!q || looking) return;
    setLooking(true);
    try {
      const found = await lookupProductAction(q);
      if (!found.ok) {
        toast.error(found.error.message);
        return;
      }
      if (found.data) {
        pick(found.data);
        return;
      }
      const matches = searched === q ? results : [];
      if (onNoExactMatch) onNoExactMatch(q, matches);
      else if (matches.length === 1 && matches[0]) pick(matches[0]);
      else toast.error(`No product has the code or barcode “${q}”.`);
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLooking(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => {
        const next = i + step;
        if (next < -1) return results.length - 1;
        if (next >= results.length) return -1;
        return next;
      });
    } else if (event.key === "Escape") {
      // First Escape closes the list and keeps the text; a second one clears it (browser default).
      if (open) event.preventDefault();
      setOpen(false);
      setActive(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = open && active >= 0 ? results[active] : undefined;
      if (chosen) pick(chosen);
      else void submit();
    }
  }

  const trimmed = query.trim();
  const showList = open && trimmed !== "" && searched === trimmed;

  return (
    <div className="relative space-y-1.5">
      <label htmlFor={id} className="text-text block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <input
          id={id}
          type="search"
          role="combobox"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          autoFocus={autoFocus}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-busy={looking || undefined}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (!event.target.value.trim()) reset();
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={`${inputClasses} pl-9`}
        />
      </div>
      {showList && (
        <div className="border-border bg-bg absolute inset-x-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-lg border shadow-lg">
          {results.length === 0 ? (
            <p role="status" className="text-muted px-3 py-3">
              No products match “{trimmed}”.
            </p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Matching products" className="py-1">
              {results.map((hit, index) => (
                <li
                  key={hit.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  // Keep focus in the input so the list doesn't close before the click lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(hit)}
                  className="aria-selected:bg-secondary hover:bg-secondary flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="text-text block truncate font-medium">{hit.name}</span>
                    <span className="text-muted block truncate text-sm">
                      {hit.code}
                      {hit.barcode ? ` · ${hit.barcode}` : ""} · {hit.categoryName}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-text text-sm">{formatPeso(hit.sellingPrice)}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-muted text-[13px]">{hit.stockQuantity} left</span>
                      <StockStatusBadge status={hit.status} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
