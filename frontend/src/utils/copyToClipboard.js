export const copyToClipboard = async (text) => {
  if (typeof text !== 'string') return false;
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  const ua = String(window?.navigator?.userAgent || '').toLowerCase();
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (ua.includes('mac') && 'ontouchend' in document);

  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_err) {
      // Safari/iOS may reject async clipboard writes outside strict user activation.
      // Fall through to execCommand-based copy.
    }
  }

  // Fallback for older browsers and stricter iOS clipboard behavior.
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.left = '0';
  textarea.style.top = '0';
  textarea.style.fontSize = '16px';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);

  try {
    if (isIOS) {
      // iOS Safari often requires explicit range selection for execCommand copy.
      textarea.contentEditable = 'true';
      textarea.readOnly = false;

      const range = document.createRange();
      range.selectNodeContents(textarea);

      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      textarea.setSelectionRange(0, textarea.value.length);
    } else {
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
    }

    return document.execCommand('copy');
  } catch (_err) {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
};

export default copyToClipboard;
