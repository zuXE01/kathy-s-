// Shared visual placeholders. Status text remains in the page's live region.
const loadingToken = Symbol('loadingToken');
export function showSkeleton(container, count = 4) {
  const cards = [];
  const token = Symbol('skeleton');
  container[loadingToken] = token;
  container.setAttribute('aria-busy','true');
  container.replaceChildren();
  for (let index = 0; index < count; index++) {
    const card = document.createElement('div');
    card.className = 'loading-card'; card.setAttribute('aria-hidden','true');
    for (const shape of ['icon','title','line','line short','control']) {
      const block = document.createElement('span');
      block.className = 'skeleton skeleton-' + shape;
      card.append(block);
    }
    cards.push(card); container.append(card);
  }
  return function finishLoading() {
    if (container[loadingToken] !== token) return;
    cards.forEach(card => card.remove());
    container.setAttribute('aria-busy','false');
  };
}
