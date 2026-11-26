import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import {
  processMarkdownOrText,
  processPdfBuffer,
  chunkDocument,
} from '../src/server/documentProcessor.ts';
import {
  ChunkExtractionResponseSchema,
  WholeDocumentResponseSchema,
} from '../src/server/schemas.ts';
import { formatMarkdownReport } from '../src/server/reportFormatter.ts';
import { generatePdfReportBuffer } from '../src/server/pdfFormatter.ts';
import { parseCliArgs } from '../scripts/analyze.ts';
import {
  validateRequirementsDocument,
  resolveModelName,
  supportsThinkingLevel,
} from '../src/server/validator.ts';
import type { ValidationReport } from '../src/types/validation.ts';

async function createSamplePdfBuffer(pages: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf').fontSize(12);
    pages.forEach((text, idx) => {
      if (idx > 0) doc.addPage();
      doc.text(text);
    });
    doc.end();
  });
}

describe('documentProcessor', () => {
  it('parses docs/requirements.md preserving line numbers and sections', async () => {
    const content = await fs.readFile(
      path.resolve(process.cwd(), 'docs/requirements.md'),
      'utf-8'
    );
    const processed = processMarkdownOrText(
      'docs/requirements.md',
      content,
      'markdown'
    );

    assert.equal(processed.sourceFormat, 'markdown');
    assert.equal(processed.documentTitle, 'Уведомление о расходах по карте');
    assert.ok(processed.segments.length >= 10);
    assert.ok(
      processed.segments.some((s) =>
        s.sectionTitle.includes('Функциональные требования')
      )
    );
    assert.ok(
      processed.segments.some((s) => s.sectionTitle.includes('Часть B. REST API'))
    );
    assert.ok(
      processed.segments.some((s) => s.text.includes('L37:') && s.text.includes('Ф-1.'))
    );
  });

  it('chunks large documents without skipping any sections', async () => {
    const content = await fs.readFile(
      path.resolve(process.cwd(), 'docs/requirements.md'),
      'utf-8'
    );
    const processed = processMarkdownOrText(
      'docs/requirements.md',
      content,
      'markdown'
    );
    const chunks = chunkDocument(processed, 2500);

    assert.ok(chunks.length >= 4, `Expected >= 4 chunks, got ${chunks.length}`);
    const allChunkSections = new Set(chunks.flatMap((c) => c.sectionTitles));
    for (const seg of processed.segments) {
      assert.ok(
        allChunkSections.has(seg.sectionTitle) ||
          Array.from(allChunkSections).some((t) =>
            t.startsWith(seg.sectionTitle)
          ),
        `Section "${seg.sectionTitle}" was skipped during chunking`
      );
    }
  });

  it('extracts PDF text with preserved page numbers', async () => {
    const pdfBuf = await createSamplePdfBuffer([
      'Спецификация платежного шлюза\nФ-1. Система выполняет списание в KZT.',
      'Ф-2. Таймаут шлюза не превышает 3 секунды.',
    ]);
    const processed = await processPdfBuffer('sample.pdf', pdfBuf);

    assert.equal(processed.sourceFormat, 'pdf');
    assert.equal(processed.totalUnits, 2);
    assert.equal(processed.segments.length, 2);
    assert.ok(processed.segments[0].text.includes('[Страница 1]'));
    assert.ok(processed.segments[0].text.includes('Ф-1.'));
    assert.ok(processed.segments[1].text.includes('[Страница 2]'));
    assert.ok(processed.segments[1].text.includes('Ф-2.'));
  });
});

describe('schemas', () => {
  it('validates structured chunk response and rejects invalid severity', () => {
    const valid = ChunkExtractionResponseSchema.safeParse({
      documentTitle: 'Тестовый документ',
      nonRequirementSectionsObserved: ['Общие сведения'],
      requirements: [
        {
          localRef: 'C1-R01',
          docId: 'Ф-1',
          category: 'functional',
          section: 'Функциональные требования',
          sourceLocation: 'Раздел «Функциональные требования», строки 10–12',
          shortTitle: 'Задание порога',
          originalWording: 'Держатель карты задаёт порог.',
          verdict: 'warning',
          criteria: {
            unambiguity: 'pass',
            completeness: 'partial',
            verifiability: 'pass',
            feasibility: 'pass',
            necessity: 'pass',
            consistency: 'pass',
            terminology: 'pass',
          },
          analysisSummary: 'Не указано поведение для заблокированной карты.',
        },
      ],
      findings: [
        {
          requirementRefs: ['C1-R01'],
          category: 'Неполнота',
          severity: 'High',
          certainty: 'question_or_risk',
          evidence: 'Держатель карты задаёт порог.',
          sourceLocation: 'Строка 10',
          explanation: 'Не описаны граничные состояния.',
          recommendation: 'Уточнить статусы карт.',
        },
      ],
    });
    assert.equal(valid.success, true);

    const invalid = ChunkExtractionResponseSchema.safeParse({
      documentTitle: 'Тест',
      nonRequirementSectionsObserved: [],
      requirements: [],
      findings: [
        {
          requirementRefs: ['REQ-001'],
          category: 'Ошибка',
          severity: 'Blocker',
          certainty: 'confirmed_defect',
          evidence: 'Цитата',
          sourceLocation: 'Строка 1',
          explanation: 'Описание',
          recommendation: 'Исправить',
        },
      ],
    });
    assert.equal(invalid.success, false);
  });

  it('requires all 7 document-level aspects in WholeDocumentResponseSchema', () => {
    const aspectNames = [
      ['contradictions', 'Противоречия'],
      ['missing_requirements', 'Пропущенные требования'],
      ['duplicates', 'Дубликаты'],
      ['inconsistent_terminology', 'Терминология'],
      ['missing_business_scenarios', 'Бизнес-сценарии'],
      ['parent_child_conflicts', 'Конфликты родитель/дочерняя'],
      ['missing_integration_details', 'Детали интеграции'],
    ] as const;

    const valid = WholeDocumentResponseSchema.safeParse({
      documentAnalyses: aspectNames.map(([aspect, aspectTitle]) => ({
        aspect,
        aspectTitle,
        status: 'fail',
        summary: 'Выявлены замечания.',
        relatedRequirementIds: ['REQ-001'],
      })),
      crossDocumentFindings: [],
      verdict: {
        decision: 'not_ready',
        decisionLabel: 'Не готово к разработке',
        canStartDevelopment: false,
        canStartTesting: false,
        rationale: 'Найдены критичные противоречия.',
        prioritizedRecommendations: ['Исправить REST-метод.'],
      },
    });
    assert.equal(valid.success, true);
  });
});

describe('report formatting (Markdown & PDF)', () => {
  it('renders Russian Markdown and valid Cyrillic PDF buffer', async () => {
    const base: Omit<ValidationReport, 'markdownReport'> = {
      id: 'test-report-1',
      passport: {
        documentName: 'docs/requirements.md',
        documentTitle: 'Уведомление о расходах по карте',
        runDate: '25.11.2026, 20:15:00',
        model: 'gemini-4-hydrogen',
        agentVersion: 'v1.0.0',
        sourceFormat: 'markdown',
        totalUnitsLabel: '199 строк, 20 разделов',
        chunksProcessed: 2,
        coveredSections: ['Часть A', 'Часть B'],
        durationMs: 4200,
      },
      requirements: [
        {
          id: 'REQ-001',
          docId: 'Ф-1',
          category: 'functional',
          section: 'Функциональные требования',
          sourceLocation: 'Строка 37',
          shortTitle: 'Установка порога',
          originalWording:
            'Держатель активной карты KZT задаёт целый порог от 1 000 до 1 000 000 ₸.',
        },
      ],
      individualAnalyses: [
        {
          requirementId: 'REQ-001',
          docId: 'Ф-1',
          verdict: 'warning',
          criteria: {
            unambiguity: 'pass',
            completeness: 'partial',
            verifiability: 'pass',
            feasibility: 'pass',
            necessity: 'pass',
            consistency: 'fail',
            terminology: 'pass',
          },
          summary: 'Противоречит обязательному amount при enabled=0.',
          findingIds: ['FND-001'],
        },
      ],
      documentAnalyses: [
        {
          aspect: 'parent_child_conflicts',
          aspectTitle: 'Конфликты между родительской и дочерней спецификациями',
          status: 'fail',
          summary: 'Обнаружены расхождения между Частью A и Частью B.',
          relatedRequirementIds: ['REQ-001'],
          findingIds: ['FND-001'],
        },
      ],
      findings: [
        {
          findingId: 'FND-001',
          requirementIds: ['REQ-001'],
          category: 'Конфликт спецификаций',
          severity: 'Critical',
          certainty: 'confirmed_defect',
          evidence: 'REST type | GET | /alerts/saveLimit',
          sourceLocation: 'Часть B, строка 104',
          explanation: 'Операция изменения состояния оформлена через HTTP GET.',
          recommendation: 'Изменить метод на PUT или POST.',
        },
      ],
      summary: {
        totalRequirements: 1,
        functionalCount: 1,
        nonFunctionalCount: 0,
        otherRequirementsCount: 0,
        passedRequirements: 0,
        warningRequirements: 1,
        failedRequirements: 0,
        totalFindings: 1,
        confirmedDefectsCount: 1,
        questionsAndRisksCount: 0,
        severityCounts: { Critical: 1, High: 0, Medium: 0, Low: 0 },
        criticalFindings: [
          {
            findingId: 'FND-001',
            requirementIds: ['REQ-001'],
            category: 'Конфликт спецификаций',
            severity: 'Critical',
            certainty: 'confirmed_defect',
            evidence: 'REST type | GET | /alerts/saveLimit',
            sourceLocation: 'Часть B, строка 104',
            explanation: 'Операция изменения состояния оформлена через HTTP GET.',
            recommendation: 'Изменить метод на PUT или POST.',
          },
        ],
      },
      verdict: {
        decision: 'not_ready',
        decisionLabel: 'Не готово к разработке и тестированию',
        canStartDevelopment: false,
        canStartTesting: false,
        rationale: 'Требуется устранить критичный дефект контракта API.',
        prioritizedRecommendations: [
          'Заменить GET на POST/PUT в /alerts/saveLimit.',
        ],
      },
    };

    const md = formatMarkdownReport(base);
    assert.ok(md.includes('## 1. Паспорт прогона'));
    assert.ok(md.includes('## 5. Находки с доказательствами'));
    assert.ok(md.includes('## 7. Критичные дефекты (Critical)'));
    assert.ok(md.includes('FND-001'));

    const fullReport: ValidationReport = { ...base, markdownReport: md };
    const pdfBuffer = await generatePdfReportBuffer(fullReport);
    assert.ok(pdfBuffer.subarray(0, 5).toString('ascii') === '%PDF-');
    assert.ok(pdfBuffer.length > 5000);
  });
});

describe('CLI and error handling', () => {
  it('parses --input and --output flags accurately', () => {
    const opts = parseCliArgs([
      '--input',
      'docs/requirements.md',
      '--output',
      'output/report.pdf',
    ]);
    assert.equal(opts.inputPath, 'docs/requirements.md');
    assert.equal(opts.outputPath, 'output/report.pdf');
  });

  it('rejects validation clearly when GEMINI_API_KEY is missing', async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await assert.rejects(
        () =>
          validateRequirementsDocument({
            documentName: 'docs/requirements.md',
            sourceFormat: 'markdown',
            textContent: '# Тест\nФ-1. Проверка.',
          }),
        /GEMINI_API_KEY/
      );
    } finally {
      if (previousKey !== undefined) {
        process.env.GEMINI_API_KEY = previousKey;
      }
    }
  });

  it('resolves valid Gemini models and gates thinkingLevel properly', () => {
    assert.equal(resolveModelName('gemini-2.5-flash'), 'gemini-2.5-flash');
    assert.equal(resolveModelName('models/gemini-2.5-pro'), 'gemini-2.5-pro');
    assert.equal(resolveModelName('gemini-4-hydrogen'), 'gemini-4-hydrogen');
    assert.throws(() => resolveModelName('gemini-1.5-flash'), /устарела/);

    assert.equal(supportsThinkingLevel('gemini-4-hydrogen'), true);
    assert.equal(supportsThinkingLevel('gemini-3.1-flash-lite'), true);
    assert.equal(supportsThinkingLevel('gemini-2.5-flash'), false);
    assert.equal(supportsThinkingLevel('gemini-2.5-pro'), false);
  });
});
