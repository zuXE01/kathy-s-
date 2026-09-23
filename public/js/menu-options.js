export function parseOptions(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 12) throw new Error('Use at most 12 sizes or portions.');
  const labels = new Set();
  return lines.map(line => {
    const parts = line.split('|').map(part => part.trim());
    if (parts.length !== 2 || !parts[0] || parts[0].length > 60 || !/^\d+(\.\d{1,2})?$/.test(parts[1]) || Number(parts[1]) > 100000) throw new Error('Use label | price on each line, for example: Slice | 145.');
    if (labels.has(parts[0].toLowerCase())) throw new Error('Each size or portion needs a unique label.');
    labels.add(parts[0].toLowerCase());
    return { label: parts[0], price: Number(parts[1]) };
  });
}
