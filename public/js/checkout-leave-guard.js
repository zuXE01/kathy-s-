// Keep customer details in memory only. Warn before discarding checkout edits.
export function createCheckoutLeaveGuard() {
  let dirty = false;
  return {
    changed() { dirty = true; },
    reset() { dirty = false; },
    beforeUnload(event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    },
    followLink(event, confirmLeave) {
      if (!dirty || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download') || link.getAttribute('href').startsWith('#')) return;
      if (!confirmLeave('Leave checkout? Your unsaved customer details will be lost. Your cart will remain in this tab.')) {
        event.preventDefault();
      } else {
        dirty = false;
      }
    }
  };
}
