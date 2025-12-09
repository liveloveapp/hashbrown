import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export interface TextChunk {
  text: string;
  chunkIndex: number;
  start: number;
  end: number;
}

/**
 * Splits a block of text into chunks using LangChain's RecursiveCharacterTextSplitter,
 * preserving basic positional metadata for each chunk.
 *
 * @param text Input text to split.
 * @param chunkSize Maximum number of characters per chunk.
 * @param overlap Number of overlapping characters between consecutive chunks.
 * @returns Promise resolving to an array of text chunks with positional metadata.
 */
export async function splitTextIntoChunks(
  text: string,
  chunkSize = 1000,
  overlap = 200,
): Promise<TextChunk[]> {
  if (chunkSize <= 0) {
    throw new Error('chunkSize must be a positive number.');
  }

  if (overlap < 0) {
    throw new Error('overlap cannot be negative.');
  }

  if (overlap >= chunkSize) {
    throw new Error('overlap must be smaller than chunkSize.');
  }

  const normalized = text.replace(/\r\n/g, '\n');

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: overlap,
  });

  const rawChunks = await splitter.splitText(normalized);

  const chunks: TextChunk[] = [];
  let searchStart = 0;

  rawChunks.forEach((chunkText, index) => {
    if (!chunkText.trim()) {
      return;
    }

    let start = normalized.indexOf(chunkText, searchStart);

    if (start === -1) {
      // Fallback: if the chunk cannot be located (e.g., due to whitespace trimming),
      // assume it starts at the current search position.
      start = searchStart;
    }

    const end = start + chunkText.length;

    chunks.push({
      text: chunkText,
      chunkIndex: index,
      start,
      end,
    });

    searchStart = Math.max(0, end - overlap);
  });

  return chunks;
}
