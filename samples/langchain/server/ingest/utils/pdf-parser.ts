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

  const loadingTask = getDocument({ data: pdfData, disableWorker: true });
  const pdfDocument = await loadingTask.promise;

  try {
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
    await pdfDocument.destroy();
  }
}
