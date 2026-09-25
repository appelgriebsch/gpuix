---
'@gpuix/native': patch
---

Shift+Tab now moves focus out of an `<input>` or `<textarea>`. The editor tracks its focus handle on a wrapper and on the text element inside it, and GPUI's tab order counted that as two stops, so moving backwards landed on the same field. Fixed in the GPUI fork: a handle tracked twice is one tab stop.
