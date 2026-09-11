# Camera: filters and recording

The post page (`pages/general/EnhancedPostPage.jsx`) owns the camera screen. The pieces it uses live here.

## How a filtered video is made

```
camera ─▶ hidden <video> ─▶ filter renderer ─▶ <canvas> ─┬─▶ preview (what you see)
                               ▲                          └─▶ canvas.captureStream() ─▶ MediaRecorder ─▶ file
                    text stickers (texture)
```

The canvas is both the preview and the thing that gets recorded, so the filter you see is the filter in the file. It is baked in while recording. The review screen plays the recorded file itself, and "Change filter" there means recording again. There is no unfiltered copy to re-grade.

- **Renderer:** `filters/webglRenderer.js`. It does one WebGL 1 pass per camera frame. `filters/canvasRenderer.js` is the 2D-canvas fallback, which only offers filters that CSS `ctx.filter` can express.
- **Frame loop:** `frameLoop.js`. It renders once per camera frame via `requestVideoFrameCallback`, falling back to about 30 fps.
- **Recorder settings:** `recorder.js`. It chooses the container and a bitrate scaled to the frame, capped at 2.5 Mbps, and caps the frame at 720p (`filters/frame.js`). The server re-encodes every upload to a 360/480/720p ladder anyway.
- **Camera and permissions:** `cameraSession.js` and `cameraErrors.js`. A refused camera is asked once and never re-prompted without a tap. Every failure has fixed wording, and browser exception text is never shown.

## Adding a filter

Add one entry to `VIDEO_FILTERS` in `filters/registry.js`:

```js
define('golden-hour', 'Golden Hour', 'mood',
  { temperature: 0.4, exposure: 0.1, glow: 0.3, vignette: 0.3 },
  'sepia(0.3) saturate(1.2) brightness(1.08)'),   // CSS fallback, or null
```

- `params` only needs what changes; everything else stays at `NEUTRAL`.
- The available adjustments are listed in `NEUTRAL` and `PARAM_RANGES`.
- `css` is used only where WebGL is unavailable. Use `null` if the look needs `smooth` or `glow`; the fallback then hides the filter.

`npm test` then checks that the new filter differs visibly from every other filter and stays inside the allowed ranges. `npm run test:browser` checks the GPU renders it the same as the JS reference.

## Adding an adjustment the shader does not have yet

1. Add it to `NEUTRAL` and `PARAM_RANGES` in `filters/registry.js`.
2. Implement it twice, in the same order:
   - in `gradePixel`/`renderReference` in `filters/colorMath.js`;
   - in `FRAGMENT_SHADER` in `filters/shader.js`.
3. Map it to a uniform in `uniformsFor`, and set that uniform in `WebGLFilterRenderer.draw()`.

The unit test "declares exactly the uniforms the renderer sets" fails until the JS side and the GLSL agree. The browser test compares GPU pixels with the reference.

## Other effects (face, background, AR, stickers, transitions)

Every registry entry has `kind: 'filter'`. Effects that are not a colour grade need their own pipeline stage:

- a segmentation mask for backgrounds;
- landmarks for face effects;
- time remapping for speed.

Add a new `kind` and let the renderer dispatch on it, rather than special-casing effects in the page. Text stickers already work this way: they are rasterised once into `overlayRaster.js` and composited by the shader.

## Tests

- **`npm test`:** Node's built-in runner, no dependencies. It covers the registry, the colour maths, the shader/uniform contract, the selection reducer, the camera session (permissions, fallbacks, switching, torch), the recorder settings, the frame loop and the upload error wording. It also runs in the Docker build.
- **`npm run test:browser`:** bundles the real post page with Vite's esbuild and drives it in headless Chrome or Edge (set `CHROME_PATH` to choose). It uses a synthetic camera with known colours and covers:
  - filters in the preview and in the recorded file (MP4 and WebM);
  - camera switching and pausing mid-take;
  - review, posting, and gallery video/image uploads;
  - upload failure;
  - every camera error path.
