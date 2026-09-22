import { Platform } from 'react-native';

export interface PrintOptions {
  html: string;
  title?: string;
}

/**
 * Cross-platform print executor.
 * On Web: uses an invisible iframe or window.open to trigger the native browser print dialog.
 * On Native (Android / iOS / Expo Go): uses expo-print printAsync.
 */
export async function printDocument(
  optionsOrHtml: PrintOptions | string,
  docTitle?: string
): Promise<boolean> {
  const html = typeof optionsOrHtml === 'string' ? optionsOrHtml : optionsOrHtml.html;
  const title = typeof optionsOrHtml === 'string' ? (docTitle || 'POS-WMS Document') : (optionsOrHtml.title || 'POS-WMS Document');
  try {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return false;

      // Method 1: Hidden iframe for seamless web printing without popup blocking
      try {
        const iframeId = '__pos_print_iframe__';
        let iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
        if (iframe) {
          iframe.parentNode?.removeChild(iframe);
        }

        iframe = document.createElement('iframe');
        iframe.id = iframeId;
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();

          // Wait a moment for styles and layout to calculate
          setTimeout(() => {
            try {
              iframe?.contentWindow?.focus();
              iframe?.contentWindow?.print();
            } catch (err) {
              console.warn('[PrintService] Iframe print failed, falling back to window.open:', err);
              fallbackWindowPrint(html, title);
            }
          }, 350);
          return true;
        }
      } catch (err) {
        console.warn('[PrintService] Web iframe creation error:', err);
      }

      // Method 2: Fallback window.open
      return fallbackWindowPrint(html, title);
    } else {
      // Native Android / iOS / Expo Go
      const { printAsync } = require('expo-print');
      await printAsync({ html });
      return true;
    }
  } catch (error) {
    console.error('[PrintService] Print execution error:', error);
    return false;
  }
}

function fallbackWindowPrint(html: string, title: string): boolean {
  try {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 300);
      return true;
    }
  } catch (e) {
    console.error('[PrintService] window.open print failed:', e);
  }
  return false;
}
