import fs from 'node:fs/promises';
import path from 'node:path';
import { getDocument, type TextItem } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Extracts the textual content from a PDF file.
 *
 * @param filePath Absolute or relative path to the PDF file.
 * @returns The concatenated text extracted from every page in reading order.
 */
export async function parsePdfFile(filePath: string): Promise<string> {
  const absolutePath = path.resolve(filePath);
  const fileBuffer = await fs.readFile(absolutePath);
  const pdfData = new Uint8Array(fileBuffer);

  // Suppress console warnings for standardFontDataUrl
  const originalWarn = console.warn;
  const originalError = console.error;

  const suppressFontWarnings = (args: unknown[]): boolean => {
    if (args.length === 0) return false;
    const message = String(args[0] || '');
    return (
      message.includes('standardFontDataUrl') ||
      message.includes('UnknownErrorException')
    );
  };

  console.warn = (...args: unknown[]) => {
    if (!suppressFontWarnings(args)) {
      originalWarn.apply(console, args);
    }
  };

  console.error = (...args: unknown[]) => {
    if (!suppressFontWarnings(args)) {
      originalError.apply(console, args);
    }
  };

  let pdfDocument;
  try {
    const loadingTask = getDocument({
      data: pdfData,
      disableWorker: true,
      standardFontDataUrl: '', // Suppress font data warnings
    });
    pdfDocument = await loadingTask.promise;

    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .map((item) => ('str' in item ? (item as TextItem).str : ''))
        .join(' ')
        .trim();

      if (pageText.length > 0) {
        pages.push(pageText);
      }

      page.cleanup();
    }

    return pages.join('\n\n');
  } finally {
    if (pdfDocument) {
      await pdfDocument.destroy();
    }
    // Restore original console methods
    console.warn = originalWarn;
    console.error = originalError;
  }
}
