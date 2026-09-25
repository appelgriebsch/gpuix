---
'@gpuix/native': patch
'@gpuix/react': minor
'@gpuix/solid': minor
---

`Dialog.Popup` takes `initialFocus` and `finalFocus`, like Base UI.

```tsx
<Dialog.Popup initialFocus={searchRef} finalFocus={composerRef}>
```

Each accepts `true` (default), `false` (focus stays), a ref or element, or a function that returns one of these. `initialFocus` defaults to the popup itself. `finalFocus` defaults to the trigger, else to the element focused when the popup opened, so a dialog opened from app state with no `Trigger` now returns focus on close. The Popup no longer takes `autoFocus` for this.

`focusElement(id)` now keeps the request until that element's focus handle exists. Before, a frame that rendered before the element's batch arrived dropped it. This happened with Solid, which applies mutations in a microtask, and on Windows and Linux, which render on their own thread. The test renderer now uses the same path.

Focus moves through the dismiss layer stack, so nested dialogs that open together focus the inner one, and closing both together returns focus to the outer one's target. An explicit `initialFocus` beats an `autoFocus` inside the popup. A pending `focusElement` request is dropped when focus moves any other way first (Tab, a click), so an element created later cannot steal focus.
