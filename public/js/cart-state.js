// Pure cart state; the interface stores the draft in this tab's session storage.
export function createCart() {
  const lines = new Map();
  const key = (id, label) => JSON.stringify([id, label]);
  return {
    add(item, option) {
      const cents = Math.round(Number(option.price) * 100);
      if (!item.id || !Number.isSafeInteger(cents) || cents < 0) return false;
      const id = key(item.id, option.label), previous = lines.get(id);
      if (previous && previous.quantity >= 99) return false;
      lines.set(id, { id, name:item.name, section:item.section, label:option.label, cents, quantity:(previous?.quantity || 0)+1 });
      return true;
    },
    change(id, delta) {
      const line = lines.get(id);
      if (!line || ![-1,1].includes(delta)) return;
      line.quantity = Math.min(99, line.quantity + delta);
      if (line.quantity <= 0) lines.delete(id);
    },
    remove(id) { lines.delete(id); },
    clear() { lines.clear(); },
    snapshot() {
      const items = [...lines.values()].map(line => ({...line}));
      return {items, count:items.reduce((sum,line)=>sum+line.quantity,0), total:items.reduce((sum,line)=>sum+line.cents*line.quantity,0)};
    }
  };
}
