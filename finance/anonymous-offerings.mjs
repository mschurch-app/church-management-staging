const digits = '零一二三四五六七八九';
const units = [[1000, '千'], [100, '百'], [10, '十'], [1, '']];

export function anonymousOfferingName(sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 9999) throw new RangeError('主知名序號超出範圍。');
  let suffix = '', remaining = sequence, zero = false;
  for (const [value, unit] of units) {
    const digit = Math.floor(remaining / value);
    if (digit) {
      if (zero) suffix += '零';
      suffix += (value === 10 && digit === 1 && !suffix ? '' : digits[digit]) + unit;
      zero = false;
    } else if (suffix && remaining) zero = true;
    remaining %= value;
  }
  return '主知名' + suffix;
}

function sequenceOf(name) {
  if (!/^主知名[一二三四五六七八九十百千零]+$/.test(name || '')) return 0;
  let sequence = 0, digit = 0;
  for (const character of name.slice(3)) {
    const unit = { 十: 10, 百: 100, 千: 1000 }[character];
    if (unit) { sequence += (digit || 1) * unit; digit = 0; }
    else digit = digits.indexOf(character);
  }
  sequence += digit;
  return sequence > 0 && sequence <= 9999 && anonymousOfferingName(sequence) === name ? sequence : 0;
}

// Preserve existing numbered names. Old anonymous records receive display names
// without writing to storage; they are only updated by an explicit draft save.
export function anonymousOfferingNames(groups) {
  const names = new Map(), used = new Set();
  const anonymous = groups.filter(group => group.anonymous);
  for (const group of anonymous) {
    const sequence = sequenceOf(group.name);
    if (sequence && !used.has(sequence)) { names.set(group, anonymousOfferingName(sequence)); used.add(sequence); }
  }
  let sequence = 1;
  for (const group of anonymous) {
    if (names.has(group)) continue;
    while (used.has(sequence)) sequence++;
    names.set(group, anonymousOfferingName(sequence)); used.add(sequence++);
  }
  return names;
}

export function nextAnonymousOfferingName(groups) {
  const sequences = [...anonymousOfferingNames(groups).values()].map(sequenceOf);
  return anonymousOfferingName(Math.max(0, ...sequences) + 1);
}
