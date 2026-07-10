export interface GenerationNavigationState {
  completedChatId: string
  activeChatId: string | null
  generationChatId: string | null
  leftOrigin: boolean
}

export function shouldAutoOpenGeneratedFeed(state: GenerationNavigationState): boolean {
  return state.activeChatId === state.completedChatId
    && state.generationChatId === state.completedChatId
    && !state.leftOrigin
}
