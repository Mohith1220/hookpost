// Test helper for twa.spec.ts and billing.twa.spec.ts (jsdom only).
//
// TWA_BOOTSTRAP_SCRIPT leaves a MutationObserver on <html>. A real page load
// discards it with the document; these specs reuse one jsdom document for many
// "page loads", so an observer left behind would put the data-hp-twa attribute
// back after the next test has deliberately cleared it.

const observers: MutationObserver[] = [];

/** Call once per spec file, before the first bootstrap run. */
export const trackObservers = (): void => {
  const Real = window.MutationObserver;
  window.MutationObserver = class extends Real {
    constructor(callback: MutationCallback) {
      super(callback);
      observers.push(this);
    }
  };
};

/** Call when a "new page load" starts: the old document's observers are gone. */
export const endPageLoad = (): void => {
  observers.splice(0).forEach((o) => o.disconnect());
};
