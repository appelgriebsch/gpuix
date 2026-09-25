---
'@gpuix/native': patch
---

`getElementBounds()`, automation `click()`, and the text selection start region now use an element's real box when it has padding. Before, the box was shifted right and down by the padding, so a click near the right or bottom edge of a padded element could land outside it.
