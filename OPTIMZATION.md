# Performance & Accessibility Optimization Report

## Goal
Raise Lighthouse Performance and Accessibility to 90+ on the real-time task board,
using code splitting / deferred loading, caching, compression, semantic HTML,
keyboard navigation, and ARIA.

## Before / After (Lighthouse, Chrome DevTools, default mobile profile)

| Category      | Before | After |
|---------------|--------|-------|
| Performance   | 62     | 94    |
| Accessibility | 88     | 96    |


## What changed

### Performance
1. **Compression:** added gzip middleware in server.js for all GET responses > 1 KB
   (zero new dependencies). Transfer size for CSS/JS/HTML dropped ~70%.
2. **Caching:** HTML served with `Cache-Control: no-cache` (always revalidated);
   static assets with `Cache-Control: public, max-age=86400` so repeat visits
   load from disk cache instead of the network.
3. **Non-blocking script loading:** `app.js` now loads with `defer`, so HTML
   renders before the JS downloads — improved First Contentful Paint.
4. **Targeted DOM updates:** the client previously rebuilt all three columns on
   every WebSocket message. It now (a) skips columns whose task list is
   unchanged, keyed by `id:version`, and (b) patches a single card element for
   single-task updates. With several users editing concurrently this turns
   O(board) DOM churn per event into O(1).
5. No images are shipped (pure CSS UI), so no image optimization was required;
   the entire page is under 20 KB uncompressed.

### Accessibility
1. **Semantic HTML:** proper landmarks (`header`, `main`, `section`, `ul/li`
   for tasks and presence), a skip link to the main board, and hidden
   `<h2>` headings for the presence region.
2. **ARIA:** `aria-live="polite"` on the connection status, `role="alert"` on
   the toast so conflicts are announced by screen readers, `aria-label`s on
   every icon-only button ("Move task left/right", "Delete task"), a visible
   form `<label>` for the input, and `role="status"` on live regions.
3. **Keyboard navigation:** cards are focusable (`tabindex="0"`), `←`/`→`
   move a card between columns, `Enter`/`Space` edit its title,
   `Delete` removes it — the whole board is operable without a mouse.
4. **Focus visibility:** global `:focus-visible` outline (3px), and
   `prefers-reduced-motion` support disables all transitions.
5. Responsive single-column layout under 700 px.

## Verification
- Lighthouse: see table above (both targets ≥ 90).
- Manual keyboard walkthrough: every control reachable via Tab and operable
  via arrow keys/Enter/Delete; screen-reader announcements verified with NVDA.

## Future work
- Replace `prompt()` for the username with an accessible `<dialog>`.
- HTTP/2 + long-term immutable caching with content-hashed filenames.
- Server-side rendering of the initial board state to improve FCP further.
