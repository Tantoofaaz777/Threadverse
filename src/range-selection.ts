export interface RangeSelection {
  startIndex: number | null
  endIndex: number | null
}

export function toggleRangeEndpoint(selection: RangeSelection, index: number): RangeSelection {
  if (index === selection.startIndex) {
    return { startIndex: null, endIndex: selection.endIndex }
  }

  if (index === selection.endIndex) {
    return { startIndex: selection.startIndex, endIndex: null }
  }

  if (selection.startIndex !== null && selection.endIndex !== null) {
    return { startIndex: index, endIndex: null }
  }

  if (selection.startIndex === null && selection.endIndex === null) {
    return { startIndex: index, endIndex: null }
  }

  const existing = selection.startIndex ?? selection.endIndex!
  return {
    startIndex: Math.min(existing, index),
    endIndex: Math.max(existing, index),
  }
}
