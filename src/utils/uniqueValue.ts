export function createUniqueValue(
  value: string,
  usedValues: Set<string>,
  suffix: string,
): string {
  const normalized = value.toLowerCase();
  if (!usedValues.has(normalized)) {
    usedValues.add(normalized);
    return value;
  }

  let candidate = `${value}${suffix}`;
  let counter = 2;
  while (usedValues.has(candidate.toLowerCase())) {
    candidate = `${value}${suffix}-${counter}`;
    counter += 1;
  }
  usedValues.add(candidate.toLowerCase());
  return candidate;
}
