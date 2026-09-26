---
'@gpuix/native': minor
'@gpuix/react': minor
'@gpuix/solid': minor
---

`setImagePixels` on an `<img>` ref takes an optional `{ format: 'rgba' | 'bgra' }`. The default stays `'rgba'`. `'bgra'` is GPUI's native byte order, so the upload skips a full per-pixel swizzle on the UI thread. ffmpeg (`-pix_fmt bgra`), VideoToolbox, and node-canvas `toBuffer('raw')` already produce BGRA.

```ts
img.current?.setImagePixels(width, height, canvas.toBuffer('raw'), { format: 'bgra' })
```

An unknown format throws. node-canvas raw buffers are premultiplied, so use them only for opaque canvases.
