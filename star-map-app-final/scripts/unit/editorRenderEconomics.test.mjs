import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import React, { act } from "react";
import { create } from "react-test-renderer";

register("./editorRenderEconomics.loader.mjs", import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const counts = {};
globalThis.__editorRenderEntry = (name) => {
  counts[name] = (counts[name] || 0) + 1;
};
const { default: DateTimeControls } = await import("../../src/components/DateTimeControls.tsx");
const { default: LocationSearch } = await import("../../src/components/LocationSearch.tsx");
const { ProPresetsPanel } = await import("../../src/components/ProPresetsPanel.tsx");
const { useStore } = await import("../../src/lib/store.ts");
const { styles } = await import("../../src/lib/config.ts");

const h = React.createElement;
const noop = () => {};

// The real parent subscribes to text/style through useEditorLogic. Keep the
// child's real props stable while reproducing those parent renders. Compare
// memo.type (the original function) with the exported memoized component.
test("text/style store updates skip unchanged editor controls", async () => {
  const original = useStore.getState();
  const report = {};
  try {
    useStore.setState({ location: { name: "", latitude: 0, longitude: 0, timezone: "UTC" } });
    for (const [name, Component, props] of [
      [
        "DateTimeControls",
        DateTimeControls,
        { dateTime: "2026-01-01T21:00:00Z", timezone: "UTC", onChange: noop },
      ],
      ["LocationSearch", LocationSearch, { onLocationChange: noop }],
      ["ProPresetsPanel", ProPresetsPanel, { selectedOccasion: null, onSelect: noop }],
    ]) {
      for (const [variant, Child] of [
        ["before", Component.type],
        ["after", Component],
      ]) {
        useStore.setState({
          selectedStyle: styles.at(-1).id,
          textBoxes: [
            {
              id: "title",
              label: "Title",
              text: "",
              fontFamily: "cinzel",
              color: "#ffffff",
              size: 28,
              align: "center",
              position: { x: 0.5, y: 0.15 },
            },
          ],
        });
        function Parent() {
          useStore((state) => state.selectedStyle);
          useStore((state) => state.textBoxes);
          return h(Child, props);
        }
        let root;
        await act(() => {
          root = create(h(Parent));
        });
        const beforeTree = JSON.stringify(root.toJSON());
        counts[name] = 0;
        for (const style of styles) {
          // One style change and three keystrokes for each of the five styles.
          for (const input of [style.id, "O", "Ou", "Our"]) {
            await act(() => {
              if (input === style.id) useStore.getState().setStyle(input);
              else useStore.getState().updateTextBox("title", { text: input });
            });
            assert.equal(JSON.stringify(root.toJSON()), beforeTree, `${name}: ${input}`);
          }
        }
        report[`${name} ${variant}`] = counts[name];
        assert.equal(counts[name], variant === "before" ? styles.length * 4 : 0);
        await act(() => root.unmount());
      }
    }
    assert.equal(styles.length, 5);
    console.log("Render-entry profile (5 styles × 4 parent updates):", report);
  } finally {
    useStore.setState(original, true);
  }
});

test("date prop and callback changes use the latest timezone and handler", async () => {
  const calls = [];
  let root;
  await act(() => {
    root = create(h(DateTimeControls, { dateTime: "2026-01-01T21:00:00Z", timezone: "UTC", onChange: noop }));
  });
  await act(() =>
    root.update(
      h(DateTimeControls, {
        dateTime: "2026-02-02T21:00:00Z",
        timezone: "America/Vancouver",
        onChange: (iso) => calls.push(iso),
      })
    )
  );
  const date = root.root.findByProps({ id: "star-date" });
  assert.equal(date.props.value, "2026-02-02");
  await act(() => date.props.onChange({ target: { value: "2026-02-03" } }));
  assert.deepEqual(calls, ["2026-02-03T21:00:00.000Z"]);
  await act(() => root.unmount());
});

test("location subscription and local exact-coordinate toggle still update", async () => {
  const original = useStore.getState();
  let root;
  try {
    useStore.setState({ location: { name: "", latitude: 0, longitude: 0, timezone: "UTC" } });
    await act(() => {
      root = create(h(LocationSearch, { onLocationChange: noop }));
    });
    await act(() =>
      useStore.getState().setLocation({ name: "X", latitude: 48, longitude: -123, timezone: "UTC" })
    );
    assert.ok(root.root.findAllByType("input").some((input) => input.props.value === "X"));
    const toggle = root.root
      .findAllByType("button")
      .find((button) => JSON.stringify(button.props.children).includes("Exact location"));
    assert.ok(toggle);
    const before = root.toJSON();
    await act(() => toggle.props.onClick());
    assert.notDeepEqual(root.toJSON(), before);
  } finally {
    if (root) await act(() => root.unmount());
    useStore.setState(original, true);
  }
});

test("preset selection and changed callbacks stay live for every style", async () => {
  const calls = [];
  let root;
  await act(() => {
    root = create(h(ProPresetsPanel, { selectedOccasion: null, onSelect: noop }));
  });
  for (const style of styles) {
    const onSelect = (id) => calls.push([style.id, id]);
    await act(() => root.update(h(ProPresetsPanel, { selectedOccasion: style.id, onSelect })));
    const button = root.root.findAllByType("button")[0];
    await act(() => button.props.onClick());
    assert.equal(calls.at(-1)[0], style.id);
    assert.equal(typeof calls.at(-1)[1], "string");
  }
  assert.equal(calls.length, 5);
  await act(() => root.unmount());
});
