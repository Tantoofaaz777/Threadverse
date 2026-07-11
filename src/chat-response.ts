export function shouldAcceptActiveChatResponse(
  responseRequestId: number | undefined,
  latestRequestId: number,
): boolean {
  return responseRequestId === undefined || responseRequestId === latestRequestId
}
