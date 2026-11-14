import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import React, { act } from "react";
import { create } from "react-test-renderer";
register("./fullscreenPreview.loader.mjs", import.meta.url);
const { FullscreenPreview } = await import("../../src/components/FullscreenPreview.tsx");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Minimal DOM adapter: focus mutates activeElement, inert ancestors reject it.
// All effects and key handlers come from the actual component/useFocusTrap.
class Element {
  children = [];
  parentElement = null;
  inert = false;
  append(...children) {
    this.children.push(...children);
    for (const child of children) child.parentElement = this;
  }
  isInert() { return this.inert || this.parentElement?.isInert(); }
  focus() {
    if (this.isInert()) return;
    document.activeElement = this;
  }
  querySelectorAll() { return this.focusables ?? []; }
}

for (const strict of [false, true]) {
  test(`fullscreen modal focus lifecycle${strict ? " in StrictMode" : ""}`, async () => {
    const oldDocument = globalThis.document;
    const oldHTMLElement = globalThis.HTMLElement;
    const listeners = new Set();
    const body = new Element(), app = new Element(), background = new Element();
    const opener = new Element(), dialog = new Element(), exit = new Element();
    const last = new Element(), persistent = new Element();
    persistent.inert = true;
    body.append(app, background, persistent);
    app.append(opener, dialog);
    dialog.append(exit, last);
    dialog.focusables = [exit, last];
    globalThis.HTMLElement = Element;
    globalThis.document = {
      body, activeElement: opener,
      addEventListener: (type, handler) => listeners.add(handler),
      removeEventListener: (type, handler) => listeners.delete(handler),
    };
    let root, closes = 0;
    const key = (key, shiftKey = false) => {
      const event = { key, shiftKey, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      for (const handler of [...listeners]) handler(event);
      return event;
    };
    const onClose = () => { closes++; root.update(null); };
    const mount = async () => {
      await act(() => {
        const child = React.createElement(FullscreenPreview, { onClose }, React.createElement("button", null, "Preview action"));
        root = create(strict ? React.createElement(React.StrictMode, null, child) : child,
          { createNodeMock: (element) => element.props.role === "dialog" ? dialog : null });
      });
    };
    try {
      await mount();
      const props = root.root.findByProps({ role: "dialog" }).props;
      assert.equal(props["aria-modal"], "true");
      assert.equal(props["aria-label"], "Fullscreen preview");
      assert.equal(props.tabIndex, -1);
      assert.equal(document.activeElement, exit, "open focuses Exit fullscreen");
      assert.equal(opener.inert, true);
      assert.equal(background.inert, true);
      assert.equal(dialog.inert, false);
      last.focus();
      assert.equal(key("Tab").defaultPrevented, true);
      assert.equal(document.activeElement, exit, "Tab wraps last to first");
      assert.equal(key("Tab", true).defaultPrevented, true);
      assert.equal(document.activeElement, last, "Shift+Tab wraps first to last");
      // The real overlay currently has only one focusable control.
      dialog.focusables = [exit];
      exit.focus();
      assert.equal(key("Tab").defaultPrevented, true);
      assert.equal(key("Tab", true).defaultPrevented, true);
      assert.equal(document.activeElement, exit);
      await act(() => key("Escape"));
      assert.equal(closes, 1);
      assert.equal(document.activeElement, opener, "Escape restores opener after clearing inert");
      assert.equal(background.inert, false);
      assert.equal(opener.inert, false);
      assert.equal(persistent.inert, true, "preserves prior inert state");
      assert.equal(listeners.size, 0);
      await act(() => root.unmount());
      await mount();
      await act(() => root.root.findByProps({ "aria-label": "Exit fullscreen" }).props.onClick());
      assert.equal(closes, 2);
      assert.equal(document.activeElement, opener, "button close restores opener");
      assert.equal(listeners.size, 0);
    } finally {
      if (root) await act(() => root.unmount());
      globalThis.document = oldDocument;
      globalThis.HTMLElement = oldHTMLElement;
    }
  });
}
