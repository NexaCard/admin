export const copyText = async (value: string): Promise<void> => {
  const text = String(value || '')
  if (!text) return

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Some browsers expose Clipboard API but reject it outside secure/user-gesture contexts.
    }
  }

  if (typeof document === 'undefined' || !document.body) {
    throw new Error('Clipboard is unavailable')
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    const copied = document.execCommand('copy')
    if (!copied) {
      throw new Error('Copy command was rejected')
    }
  } finally {
    document.body.removeChild(textarea)
  }
}
