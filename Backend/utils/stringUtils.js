function normalizeString(str) {
  if (!str) return '';
  let normalized = str.replace(/^(the)\s+/i, '');
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f']/g, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  normalized = normalized.replace(/\b\w/g, c => c.toUpperCase());
  return normalized;
}

module.exports = { normalizeString };
