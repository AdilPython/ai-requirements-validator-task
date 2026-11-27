import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface DocumentSegment {
  sectionTitle: string;
  sourceLocation: string;
  startUnit: number;
  endUnit: number;
  text: string;
}

export interface ProcessedDocument {
  documentName: string;
  documentTitle: string;
  sourceFormat: 'markdown' | 'text' | 'pdf';
  totalUnits: number;
  totalUnitsLabel: string;
  segments: DocumentSegment[];
  rawText: string;
}

export interface DocumentChunk {
  chunkIndex: number;
  totalChunks: number;
  locationRange: string;
  sectionTitles: string[];
  annotatedText: string;
}

function buildHeadingBreadcrumb(stack: { level: number; title: string }[]): string {
  if (stack.length === 0) return 'Введение / без заголовка';
  return stack.map((item) => item.title).join(' -> ');
}

export function processMarkdownOrText(
  documentName: string,
  content: string,
  sourceFormat: 'markdown' | 'text' = 'markdown'
): ProcessedDocument {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length === 0 || !normalized.trim()) {
    throw new Error(`Документ "${documentName}" пуст и не содержит текста.`);
  }

  let documentTitle = documentName;
  const headingStack: { level: number; title: string }[] = [];
  const segments: DocumentSegment[] = [];

  let currentLines: string[] = [];
  let currentStartLine = 1;
  let currentSectionTitle = 'Введение / без заголовка';

  const flushSegment = (endLine: number) => {
    const joined = currentLines.join('\n').trim();
    if (!joined) {
      currentLines = [];
      return;
    }
    const annotatedLines = currentLines
      .map((line, idx) => `L${currentStartLine + idx}: ${line}`)
      .join('\n');

    segments.push({
      sectionTitle: currentSectionTitle,
      sourceLocation: `Раздел «${currentSectionTitle}», строки ${currentStartLine}–${endLine}`,
      startUnit: currentStartLine,
      endUnit: endLine,
      text: annotatedLines,
    });
    currentLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];
    const headingMatch =
      sourceFormat === 'markdown' ? line.match(/^(#{1,6})\s+(.+)$/) : null;

    if (headingMatch) {
      if (currentLines.length > 0) {
        flushSegment(lineNo - 1);
      }

      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      if (level === 1 && documentTitle === documentName) {
        documentTitle = title;
      }

      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].level >= level
      ) {
        headingStack.pop();
      }
      headingStack.push({ level, title });

      currentSectionTitle = buildHeadingBreadcrumb(headingStack);
      currentStartLine = lineNo;
      currentLines = [line];
    } else {
      if (currentLines.length === 0) {
        currentStartLine = lineNo;
      }
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    flushSegment(lines.length);
  }

  if (segments.length === 0) {
    throw new Error(
      `В документе "${documentName}" не найдено ни одного текстового раздела.`
    );
  }

  return {
    documentName,
    documentTitle,
    sourceFormat,
    totalUnits: lines.length,
    totalUnitsLabel: `${lines.length} строк, ${segments.length} разделов`,
    segments,
    rawText: normalized,
  };
}

export async function processPdfBuffer(
  documentName: string,
  buffer: Buffer
): Promise<ProcessedDocument> {
  if (!buffer || buffer.length === 0) {
    throw new Error(`PDF-файл "${documentName}" пуст.`);
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  if (numPages === 0) {
    throw new Error(`PDF-файл "${documentName}" не содержит страниц.`);
  }

  const segments: DocumentSegment[] = [];
  const rawPages: string[] = [];
  let documentTitle = documentName;

  for (let pageNo = 1; pageNo <= numPages; pageNo++) {
    const page = await pdfDoc.getPage(pageNo);
    const textContent = await page.getTextContent();

    const linesByY: string[] = [];
    let currentLineParts: string[] = [];
    let lastY: number | null = null;

    for (const item of textContent.items) {
      if (!('str' in item)) continue;
      const textItem = item as { str: string; transform?: number[] };
      const y = textItem.transform ? Math.round(textItem.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
        const lineStr = currentLineParts.join(' ').replace(/\s+/g, ' ').trim();
        if (lineStr) linesByY.push(lineStr);
        currentLineParts = [];
      }
      if (textItem.str.trim()) {
        currentLineParts.push(textItem.str);
      }
      if (y !== null) lastY = y;
    }

    const tailLine = currentLineParts.join(' ').replace(/\s+/g, ' ').trim();
    if (tailLine) linesByY.push(tailLine);

    const pageText = linesByY.join('\n').trim();
    rawPages.push(`--- Страница ${pageNo} ---\n${pageText}`);

    if (pageNo === 1 && linesByY.length > 0) {
      const candidate = linesByY[0].trim();
      if (candidate.length >= 3 && candidate.length <= 140) {
        documentTitle = candidate;
      }
    }

    segments.push({
      sectionTitle: `Страница ${pageNo}`,
      sourceLocation: `Страница ${pageNo} из ${numPages}`,
      startUnit: pageNo,
      endUnit: pageNo,
      text: pageText
        ? `[Страница ${pageNo}]\n${pageText}`
        : `[Страница ${pageNo}: текстовый слой отсутствует или страница пуста]`,
    });
  }

  const totalTextLen = segments
    .map((s) => s.text)
    .join('')
    .replace(/\[Страница.*?\]/g, '')
    .trim().length;

  if (totalTextLen === 0) {
    throw new Error(
      `PDF-файл "${documentName}" не содержит извлекаемого текстового слоя (возможно, это скан без OCR).`
    );
  }

  return {
    documentName,
    documentTitle,
    sourceFormat: 'pdf',
    totalUnits: numPages,
    totalUnitsLabel: `${numPages} стр.`,
    segments,
    rawText: rawPages.join('\n\n'),
  };
}

export async function processDocument(input: {
  documentName: string;
  sourceFormat: 'markdown' | 'text' | 'pdf';
  textContent?: string;
  pdfBuffer?: Buffer;
}): Promise<ProcessedDocument> {
  if (input.sourceFormat === 'pdf') {
    if (!input.pdfBuffer) {
      throw new Error('Не передан буфер PDF-документа.');
    }
    return processPdfBuffer(input.documentName, input.pdfBuffer);
  }
  return processMarkdownOrText(
    input.documentName,
    input.textContent ?? '',
    input.sourceFormat
  );
}

export function chunkDocument(
  doc: ProcessedDocument,
  maxCharsPerChunk = 25000
): DocumentChunk[] {
  const safeLimit = Math.max(2000, maxCharsPerChunk);
  const rawChunks: {
    segments: DocumentSegment[];
    charCount: number;
  }[] = [];

  let currentSegments: DocumentSegment[] = [];
  let currentChars = 0;

  const pushLargeSegmentSplit = (seg: DocumentSegment) => {
    const lines = seg.text.split('\n');
    let partLines: string[] = [];
    let partChars = 0;
    let partIndex = 1;

    for (const line of lines) {
      if (partChars + line.length + 1 > safeLimit && partLines.length > 0) {
        rawChunks.push({
          segments: [
            {
              ...seg,
              sectionTitle: `${seg.sectionTitle} (часть ${partIndex})`,
              sourceLocation: `${seg.sourceLocation}, часть ${partIndex}`,
              text: partLines.join('\n'),
            },
          ],
          charCount: partChars,
        });
        partLines = [];
        partChars = 0;
        partIndex++;
      }
      partLines.push(line);
      partChars += line.length + 1;
    }

    if (partLines.length > 0) {
      rawChunks.push({
        segments: [
          {
            ...seg,
            sectionTitle:
              partIndex > 1
                ? `${seg.sectionTitle} (часть ${partIndex})`
                : seg.sectionTitle,
            sourceLocation:
              partIndex > 1
                ? `${seg.sourceLocation}, часть ${partIndex}`
                : seg.sourceLocation,
            text: partLines.join('\n'),
          },
        ],
        charCount: partChars,
      });
    }
  };

  for (const seg of doc.segments) {
    const segLen = seg.text.length + seg.sourceLocation.length + 32;

    if (segLen > safeLimit) {
      if (currentSegments.length > 0) {
        rawChunks.push({ segments: currentSegments, charCount: currentChars });
        currentSegments = [];
        currentChars = 0;
      }
      pushLargeSegmentSplit(seg);
      continue;
    }

    if (currentChars + segLen > safeLimit && currentSegments.length > 0) {
      rawChunks.push({ segments: currentSegments, charCount: currentChars });
      currentSegments = [];
      currentChars = 0;
    }

    currentSegments.push(seg);
    currentChars += segLen;
  }

  if (currentSegments.length > 0) {
    rawChunks.push({ segments: currentSegments, charCount: currentChars });
  }

  const totalChunks = rawChunks.length;
  const unitPrefix = doc.sourceFormat === 'pdf' ? 'Стр.' : 'Строки';

  return rawChunks.map((chunk, idx) => {
    const first = chunk.segments[0];
    const last = chunk.segments[chunk.segments.length - 1];
    const annotatedText = chunk.segments
      .map((s) => `=== [${s.sourceLocation}] ===\n${s.text}`)
      .join('\n\n');

    return {
      chunkIndex: idx + 1,
      totalChunks,
      locationRange: `${unitPrefix} ${first.startUnit}–${last.endUnit}`,
      sectionTitles: Array.from(
        new Set(chunk.segments.map((s) => s.sectionTitle))
      ),
      annotatedText,
    };
  });
}
