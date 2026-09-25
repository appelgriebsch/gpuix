---
'@gpuix/native': minor
'@gpuix/react': minor
'@gpuix/solid': minor
---

Focus is now visible by default, and there is a headless `Button`.

- `focusVisible` nested style, like `hover` and `active`. It applies after keyboard focus only, like CSS `:focus-visible`, on text fields too. GPUI applies it natively
- `outlineWidth`, `outlineColor`, `outlineOffset`: a line outside the border box that takes no layout space, so a focus ring added with `focusVisible` moves nothing. It follows `borderRadius`
- default keyboard focus look, with no ring: a focusable control (`Button`, a `tabIndex` div) dims to 70% opacity; `<input>` and `<textarea>` draw nothing, the caret already shows focus. Any `focusVisible` replaces it, `focusVisible: {}` turns it off
- `Select.Content` and `Dialog.Popup` pass `focusVisible: {}`; they are focused only to receive keys
- `@gpuix/solid` exports the `HostElement` type, for refs such as `initialFocus={() => field}`
- `Button` (`@gpuix/react/button`, `@gpuix/solid/button`), shaped like Base UI: a tab stop with `role="button"` that fires `onClick` on press, Enter key down (not on repeat) and Space key up. `disabled` removes it from the Tab order, `focusableWhenDisabled` keeps it. `buttonProps()` gives the same behavior to your own parts; `Dialog.Trigger` and `Dialog.Close` now use it, so Space activates them on release

```tsx
<Button onClick={save} disabled={saving}>Save</Button>
<div tabIndex={0} style={{ focusVisible: { outlineWidth: 2, outlineColor: '#89b4fa', outlineOffset: 2 } }} />
```
