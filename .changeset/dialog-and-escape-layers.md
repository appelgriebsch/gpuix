---
'@gpuix/native': minor
'@gpuix/react': minor
'@gpuix/solid': minor
---

Add a headless `Dialog`, and make Escape close only the top open overlay.

```tsx
import * as Dialog from '@gpuix/react/dialog' // or '@gpuix/solid/dialog'

<Dialog.Root>
  <Dialog.Trigger>Settings</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Backdrop style={{ backgroundColor: '#00000080' }} />
    <Dialog.Popup style={{ width: 420, padding: 16, backgroundColor: '#232323' }}>
      <Dialog.Title>Settings</Dialog.Title>
      <Dialog.Close>Done</Dialog.Close>
    </Dialog.Popup>
  </Dialog.Portal>
</Dialog.Root>
```

- Same parts as Base UI: `Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description`, `Close`
- `Portal` is a full-window deferred layer, so the dialog paints over `<virtual-list>`. A modal dialog blocks clicks and the wheel behind it
- The popup takes focus on open, keeps Tab inside while modal, and gives focus back to the trigger on close
- A press on `Backdrop` closes it, unless `disablePointerDismissal` is set

Escape is now a default action on one layer stack per window. Every open Dialog, Select, Combobox, and Tooltip is a layer. Escape closes only the most recently opened one, so a Select inside a Dialog closes first. It works when nothing is focused, and `event.preventDefault()` in any `onKeyDown` keeps the layer open. Custom overlays join the stack with `useDismissLayer`, or `pushDismissLayer(renderer, layer)` without a framework.

A raw `<anchored>` with an explicit `backgroundColor: "transparent"` now paints no fill. Without any fill in its style it still paints `#1A1A1A`.
