---
'@gpuix/native': patch
---

`onFocus` and `onBlur` now fire in the test renderer. Its offscreen window was never active, and GPUI reports focus changes only for an active window, so focus listeners never ran in tests. The test window now reports itself active without taking the desktop keyboard.
