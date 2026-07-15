export type FeedSwipeAction =
  | { type: 'none' }
  | { type: 'select'; targetIndex: number }
  | { type: 'regenerate' }

export function resolveFeedSwipe(
  currentIndex: number,
  versionCount: number,
  direction: 'left' | 'right',
): FeedSwipeAction {
  if (direction === 'left') {
    return currentIndex > 0
      ? { type: 'select', targetIndex: currentIndex - 1 }
      : { type: 'none' }
  }

  if (currentIndex >= 0 && currentIndex < versionCount - 1) {
    return { type: 'select', targetIndex: currentIndex + 1 }
  }
  return { type: 'regenerate' }
}
