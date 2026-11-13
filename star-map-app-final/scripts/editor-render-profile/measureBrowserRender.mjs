// Includes JS rendering, raster completion and readback; NOT isolated GPU time.
export function measureBrowserRender(canvas, render, now = () => performance.now()) {
  const start = now();
  render();
  const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  const ms = now() - start;
  return { ms, readbackBytes: pixels.data.byteLength };
}
