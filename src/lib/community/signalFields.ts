export function getNumericFieldValue(
  data: Record<string, unknown> | null | undefined,
  originalDoc: Record<string, unknown> | null | undefined,
  field: string,
): number {
  const nextValue = data?.[field]
  if (typeof nextValue === 'number') {
    return nextValue
  }

  const previousValue = originalDoc?.[field]
  if (typeof previousValue === 'number') {
    return previousValue
  }

  return 0
}
