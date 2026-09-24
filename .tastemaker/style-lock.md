# Style lock — BentaTrack (Estetika)

Established: 2026-09-24. Source: SRS V2 §2.5/§3.1 constraints (white + brown, light + dark, text labels with icons) + tastemaker `generate_palette.py --mood elegant --seed 3` (light and dark), hand-tuned to the SRS two-colour rule, user-approved plan (leaf 3.1).

## Palette
Tokens live in `src/app/globals.css` as CSS variables (`--bg`, `--surface`, …) mapped to Tailwind colors (`bg-bg`, `text-muted`, …). Never hard-code a hex in a component.

| Role | Light | Dark | Use |
|---|---|---|---|
| bg | `#FFFFFF` | `#140E0B` | content area, the quietest surface |
| surface | `#F8F3F0` | `#201916` | sidebar, cards, bottom bar |
| text | `#221814` (17.37 vs bg) | `#FDEEE9` (16.93 vs bg) | body, headings |
| muted | `#6B5850` (6.69 vs bg) | `#BFABA2` (8.71 vs bg) | labels, captions, inactive nav |
| primary | `#7A4E3C` | `#9B6A58` | primary buttons, active-nav text (light), focus ring |
| on-primary | `#FFFFFF` (7.04 vs primary) | `#FFFFFF` (4.57 vs primary) | label on primary fill |
| secondary | `#EFE4DE` | `#392A25` | active nav row fill, secondary buttons |
| accent | `#A86F4C` | `#D19A78` | light: indicator bars/borders only; dark: links + active-nav indicator |
| border | `#E5D9D3` | `#3A302C` | decorative hairlines only |
| warn (Low Stock) | `#A3470A` | `#F5A524` | status text/badges |
| danger (Out of Stock, errors) | `#B42318` | `#F47067` | status text/badges |
| ok (success, online) | `#18733C` | `#5FCE86` | status text/badges |

- Button label: white on primary in both modes.
- Dark mode: **runtime toggle — both modes ship, user-switchable.** Default follows the device (`prefers-color-scheme`), explicit choice persists (next-themes, `data-theme` on `<html>`). Companion pair from the same seed (3), each verified with its own `check_contrast.py --matrix` run.

## Color contract
Floors: text 4.5:1 · button label on fill 4.5:1 · fill/indicator vs page 3:1 · decorative hairline exempt.

Legal pairings (matrix run 2026-09-24):
- Text-safe (≥4.5), light: text/muted/primary/warn/danger/ok on bg, surface, secondary; on-primary on primary (7.04); primary on secondary (5.64).
- Text-safe (≥4.5), dark: text/muted/accent/warn/danger/ok on bg, surface, secondary; on-primary on primary (4.57).
- UI-safe (3.0–4.5): light accent on bg 4.16 / surface 3.78 / secondary 3.34 → indicators and borders only, never text. Dark primary on bg 4.19 / surface 3.79 → button fills only; dark primary on secondary 3.00 (floor, avoid).
- Decorative (<3.0): muted on primary, text on primary (light 2.47), border on anything.
- Hand-tuning notes: generator bg `#fff8f6` → `#FFFFFF` (SRS "white"); generator primary `#946452` → `#7A4E3C` (same hue, 7.04 label contrast); generator teal accent `#3f7b8e` replaced by caramel `#A86F4C` (SRS allows only white + brown).
- Rule that follows: in **dark** mode, text links and the active-nav indicator use accent, not primary.

## Typography
- Display: **Gloock** (serif), only for the "Estetika" wordmark and page titles (h1). Elegant/editorial mood pairing.
- Body/UI: **Inter** for everything else, including buttons, nav, tables, forms.
- Scale: base 16px (no smaller on phones: avoids iOS zoom on inputs); nav 15px; small labels 13px; h1 28px desktop / 24px phone.
- Loaded with `next/font/google`, self-hosted at build, so fonts work offline.

## Shape language
- Radius: 8px controls/cards (`rounded-lg`), 999px only for count badges.
- Shadow: none in the shell; hairline `border` color for separation. Sheets/drawers get one soft shadow for lift.
- Borders: 1px hairlines (decorative); state is never carried by the border color alone.

## Density & spacing
- Base unit 4px. Shell rows 44px min (touch target), nav item padding space-3 (12px) × space-3.
- Content card internal padding: space-6 (24px); dense tiles space-4 (16px).
- Content area padding: space-4 (16px) phone, space-8 (32px) desktop.
- Overall: calm, medium density; users have basic computer skills and use phones.

## Reference intelligence
- Reference board: `.tastemaker/reference-board.md` (viewed sources, thin; client's own named references carry most weight).
- Design read: app shell for a small boutique's owner + one staff member, mode Operate, lane "quiet boutique back-office".
- Dials: variance 3, motion 2, density 5, art direction 3.
- Foundation: existing repo stack (Tailwind 4, lucide-react, next-themes, sonner). No new packages.
- Quality bar: Shopee/Lazada mobile app (client-named, SRS §1.5): labelled bottom tab bar; Shopify POS: fast product search/scan, count badges.
- Direction contract: Thesis "a calm, warm tool that gets out of the way at the counter"; First viewport = the page's one job with the nav always visible; System = two-colour tokens + Inter UI + Gloock titles; Risk = serif titles could feel precious, so they're limited to wordmark + h1.
- Anti-references: indigo SaaS dashboards, gradient cards, icon-only rails, dense admin-template chrome.

## Taste memory
- Profile priors used: none (cold start, no `~/.tastemaker/profile.md`).
- Decision log: `.tastemaker/decisions.log`.
- Pending review: shell look (leaf-3.1:G2, screenshots in `docs/design/3.1/`).
- Profile promotion: none.

## Navigation chrome
- Sidebar (≥1024px): surface background, 248px, grouped Sell / Stock / Owner (Owner group hidden for staff). Content area: bg.
- Phone/tablet (<1024px): top bar (wordmark + page title) and a bottom tab bar with 4 **labelled** tabs (Home, Checkout, Products, More); "More" opens a sheet listing the rest, labelled. Deliberately NOT the icon-only collapse: SRS §2.5 forbids icon-only controls.
- Active item: secondary-filled row + 3px left indicator bar (light: primary, dark: accent), text in text color, `aria-current="page"`.
- Inactive hover: bg-on-surface shift (desktop, pointer devices only).
- No breadcrumbs (flat structure); the page title sits in the top bar.

## Mood descriptors
calm, warm, trustworthy, uncluttered

## Assets
- Icons: lucide-react (already in repo), 1.75px stroke, 20px in nav, always beside a text label.
- Logo: none supplied yet. Placeholder is a **text wordmark** "Estetika" in Gloock + "BentaTrack" in Inter small caps (`src/components/layout/wordmark.tsx`). No invented symbol; owner's official logo replaces it (SRS §2.6).
- No photography or illustration in the shell.

## Motion
- Feel: quick and restrained.
- Curve: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.
- Durations: press 100ms, nav highlight 150ms, sheet/drawer 220ms, toast (sonner default).
- Screen tracks: app shell only (panel/sheet transitions, state changes). No scroll storytelling, no GSAP.
- Frequency rules: navigation clicks don't animate the page content (used all day).
- Reduced motion: transitions drop to instant; state (open/closed, active) still changes.

## Do not
- No third colour (no blue/teal/purple accents); status colours are only for status.
- No icon-only buttons or links anywhere, including phone.
- No shadows on cards in the shell; no gradients.
- No hard-coded hex values in components.
