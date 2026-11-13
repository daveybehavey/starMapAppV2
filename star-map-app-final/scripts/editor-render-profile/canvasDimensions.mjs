// Include even same-value assignments: browsers clear the bitmap on every reset.
export function captureCanvasDimensions(canvas, label, commands) {
  return new Proxy(canvas, {
    set(target, key, value) {
      if (key === "width" || key === "height") {
        commands.push([label, "dimension", key, value]);
      }
      target[key] = value;
      return true;
    },
  });
}
