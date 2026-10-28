# vite-preload-listener-memory-leak

Minimal reproduction: in production builds, the CSS preload helper keeps its
`load` / `error` listeners on the injected `<link rel="stylesheet">`. The link
stays in `document.head` for the lifetime of the page, so those listeners keep
the whole `__vitePreload()` scope alive — including `baseModule`, the dynamic
`import()` factory passed by user code.

If that factory is defined inside a component or function scope, everything
captured by that scope is retained as well.

Verified with **Vite 8.3.5**, Chrome, plain JavaScript (no framework).

## Reproduce

```bash
npm install
npm run build
npx serve dist        # or any static server, must be HTTP (not file://)
```

Open the served URL, then:

1. Click **mount**. This appends a `<div>` to the body and triggers
   `import('./panel.js')`. Because `panel.js` imports a CSS file, Vite inserts a
   `<link rel="stylesheet">` and attaches `load` / `error` listeners to it.
2. Click **unmount**. The `<div>` is removed from the document.
3. Open DevTools → Memory → click **Collect garbage** twice.
4. Evaluate `window.__probe.deref()` in the console.

**Actual:** it still returns the detached element, and the node shows up under
*Detached* in a heap snapshot.

**Expected:** `undefined` — nothing references the node anymore.

## Control experiment

Move the loader out of the function scope:

```js
// before (leaks)
function mountLeak() {
  const load = () => import('./panel.js')
  load()
}

// after (does not leak)
const loadPanel = () => import('./panel.js')
function mountLeak() {
  loadPanel()
}
```

Rebuild, repeat steps 1–4 → `window.__probe.deref()` returns `undefined`.

This shows the leak depends on *where* the loader is defined, not on the loader
itself: `__vitePreload()` captures it, and the listener closure captures the
scope it was defined in.

## Why this happens

Generated code for the dynamic import (Vite 8.3.5, `build.minify: false`):

```js
__vitePreload(() => import('./panel-xxx.js'), ['./panel-xxx.css'], import.meta.url)
```

Inside the helper, for CSS dependencies:

```js
if (isCss) return new Promise((res, rej) => {
  link.addEventListener('load', res)
  link.addEventListener('error', () => rej(new Error(`Unable to preload CSS for ${dep}`)))
})
```

Neither listener is ever removed. Since the `<link>` is never removed from
`document.head` either, the closure chain stays reachable from a GC root:

```
document.head
  -> <link rel="stylesheet">
    -> registered event listener
      -> closure
        -> __vitePreload scope (contains `baseModule`)
          -> the function scope where the loader was defined
            -> `config.designDom`
              -> the detached DOM node
```

## Notes

- **Build only.** `vite dev` uses native `import()` plus injected `<style>`
  tags, so `__vitePreload` is never emitted and nothing leaks.
- **Only one copy leaks.** `__vitePreload` dedupes preloads in a `seen` cache,
  so the `<link>` (and its listeners) is created once per CSS file.
- Requires a real Node environment; `vite build` depends on native binaries
  (rolldown in Vite 8), so WebContainer-style sandboxes cannot run it.