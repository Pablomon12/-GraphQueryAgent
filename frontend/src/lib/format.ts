export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected error'
}
