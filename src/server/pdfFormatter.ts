import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import type {
  ValidationReport,
  RequirementVerdict,
  CriterionStatus,
  FindingCertainty,
  SeverityLevel,
} from '../types/validation.ts';

interface FontSet {
  regular: string;
  bold: string;
  mono: string;
}

function getPackageFontDir(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve('dejavu-fonts-ttf/package.json');
    return path.join(path.dirname(pkgPath), 'ttf');
  } catch {
    const cwdCandidate = path.resolve(
      process.cwd(),
      'node_modules/dejavu-fonts-ttf/ttf'
    );
    return fs.existsSync(cwdCandidate) ? cwdCandidate : null;
  }
}

export function resolveFontPaths(): FontSet {
  const pkgFontDir = getPackageFontDir();
  const candidates: FontSet[] = [];

  if (pkgFontDir) {
    candidates.push({
      regular: path.join(pkgFontDir, 'DejaVuSans.ttf'),
      bold: path.join(pkgFontDir, 'DejaVuSans-Bold.ttf'),
      mono: path.join(pkgFontDir, 'DejaVuSansMono.ttf'),
    });
  }

  candidates.push(
    // macOS system Cyrillic TTF fonts
    {
      regular: '/System/Library/Fonts/Supplemental/Arial.ttf',
      bold: '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
      mono: '/System/Library/Fonts/Supplemental/Courier New.ttf',
    },
    {
      regular: '/System/Library/Fonts/Supplemental/Arial.ttf',
      bold: '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
      mono: '/System/Library/Fonts/Supplemental/Arial.ttf',
    },
    {
      regular: '/Library/Fonts/Arial Unicode.ttf',
      bold: '/Library/Fonts/Arial Unicode.ttf',
      mono: '/Library/Fonts/Arial Unicode.ttf',
    },
    // Linux system Cyrillic TTF fonts
    {
      regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      mono: '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    },
    {
      regular: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
      bold: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
      mono: '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
    },
    // Windows system Cyrillic TTF fonts
    {
      regular: 'C:\\Windows\\Fonts\\arial.ttf',
      bold: 'C:\\Windows\\Fonts\\arialbd.ttf',
      mono: 'C:\\Windows\\Fonts\\cour.ttf',
    }
  );

  for (const c of candidates) {
    if (
      fs.existsSync(c.regular) &&
      fs.existsSync(c.bold) &&
      fs.existsSync(c.mono)
    ) {
      return c;
    }
  }

  throw new Error(
    'Не найдены TrueType-шрифты с поддержкой кириллицы (dejavu-fonts-ttf / системные Arial, DejaVuSans, LiberationSans) для генерации PDF.'
  );
}

function verdictRu(v: RequirementVerdict): string {
  switch (v) {
    case 'pass':
      return 'Соответствует';
    case 'warning':
      return 'Есть замечания';
    case 'fail':
      return 'Нарушение';
  }
}

function statusRu(s: CriterionStatus): string {
  switch (s) {
    case 'pass':
      return 'Да';
    case 'partial':
      return 'Частично';
    case 'fail':
      return 'Нет';
    case 'not_applicable':
      return 'Н/П';
  }
}

function certaintyRu(c: FindingCertainty): string {
  return c === 'confirmed_defect'
    ? 'Подтверждённый дефект'
    : 'Вопрос / Потенциальный риск';
}

function severityColor(s: SeverityLevel): string {
  switch (s) {
    case 'Critical':
      return '#B91C1C';
    case 'High':
      return '#C2410C';
    case 'Medium':
      return '#B45309';
    case 'Low':
      return '#475569';
  }
}

export async function generatePdfReportBuffer(
  report: ValidationReport
): Promise<Buffer> {
  const fonts = resolveFontPaths();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 52, left: 48, right: 48 },
      bufferPages: true,
      info: {
        Title: `Отчёт проверки: ${report.passport.documentTitle}`,
        Author: 'AI Requirements Validator',
        Subject: 'Статический аудит требований',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('Sans', fonts.regular);
    doc.registerFont('Sans-Bold', fonts.bold);
    doc.registerFont('Mono', fonts.mono);

    const contentWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const ensureSpace = (minHeight: number) => {
      const bottomLimit = doc.page.height - doc.page.margins.bottom;
      if (doc.y + minHeight > bottomLimit) {
        doc.addPage();
      }
    };

    const drawHeading = (text: string) => {
      ensureSpace(44);
      doc.moveDown(0.7);
      doc
        .font('Sans-Bold')
        .fontSize(13)
        .fillColor('#0F172A')
        .text(text, { width: contentWidth });
      const lineY = doc.y + 3;
      doc
        .strokeColor('#CBD5E1')
        .lineWidth(0.75)
        .moveTo(doc.page.margins.left, lineY)
        .lineTo(doc.page.margins.left + contentWidth, lineY)
        .stroke();
      doc.moveDown(0.5);
    };

    const drawKeyValue = (label: string, value: string) => {
      ensureSpace(18);
      doc
        .font('Sans-Bold')
        .fontSize(9.5)
        .fillColor('#334155')
        .text(`${label}: `, { continued: true, width: contentWidth });
      doc.font('Sans').fontSize(9.5).fillColor('#0F172A').text(value);
    };

    // Title Banner
    doc
      .font('Sans-Bold')
      .fontSize(18)
      .fillColor('#0F172A')
      .text('Отчёт статической проверки требований', {
        width: contentWidth,
      });
    doc.moveDown(0.2);
    doc
      .font('Sans')
      .fontSize(10.5)
      .fillColor('#475569')
      .text(report.passport.documentTitle, { width: contentWidth });
    doc.moveDown(0.6);

    // 1. Passport
    drawHeading('1. Паспорт прогона');
    drawKeyValue('Документ', report.passport.documentName);
    drawKeyValue('Дата и время прогона', report.passport.runDate);
    drawKeyValue('Модель LLM', report.passport.model);
    drawKeyValue('Версия агента', report.passport.agentVersion);
    drawKeyValue(
      'Формат и объём',
      `${report.passport.sourceFormat.toUpperCase()} (${report.passport.totalUnitsLabel})`
    );
    drawKeyValue(
      'Обработано чанков / разделов',
      `${report.passport.chunksProcessed} / ${report.passport.coveredSections.length}`
    );
    drawKeyValue(
      'Длительность анализа',
      `${(report.passport.durationMs / 1000).toFixed(2)} с`
    );

    // 2. Summary & Verdict
    drawHeading('2. Сводка и итоговое заключение');
    drawKeyValue('Итоговый вердикт', report.verdict.decisionLabel);
    drawKeyValue(
      'Готовность к разработке',
      report.verdict.canStartDevelopment ? 'Да' : 'Нет'
    );
    drawKeyValue(
      'Готовность к тестированию',
      report.verdict.canStartTesting ? 'Да' : 'Нет'
    );
    drawKeyValue(
      'Извлечено требований',
      `${report.summary.totalRequirements} (функциональных: ${report.summary.functionalCount}, нефункциональных: ${report.summary.nonFunctionalCount}, прочих: ${report.summary.otherRequirementsCount})`
    );
    drawKeyValue(
      'Статус требований',
      `соответствуют: ${report.summary.passedRequirements} · с замечаниями: ${report.summary.warningRequirements} · с нарушениями: ${report.summary.failedRequirements}`
    );
    drawKeyValue(
      'Находки по критичности',
      `Всего: ${report.summary.totalFindings} (Critical: ${report.summary.severityCounts.Critical}, High: ${report.summary.severityCounts.High}, Medium: ${report.summary.severityCounts.Medium}, Low: ${report.summary.severityCounts.Low})`
    );
    drawKeyValue(
      'Доказанность находок',
      `Подтверждённых дефектов: ${report.summary.confirmedDefectsCount} · Вопросов / рисков: ${report.summary.questionsAndRisksCount}`
    );

    doc.moveDown(0.35);
    doc
      .font('Sans')
      .fontSize(9.5)
      .fillColor('#0F172A')
      .text(report.verdict.rationale, { width: contentWidth, lineGap: 2 });

    doc.moveDown(0.4);
    doc
      .font('Sans-Bold')
      .fontSize(10)
      .fillColor('#0F172A')
      .text('Приоритезированные рекомендации:', { width: contentWidth });
    report.verdict.prioritizedRecommendations.forEach((rec, i) => {
      ensureSpace(24);
      const cleaned = rec.replace(/^\s*\d+[.)]\s+/, '').trim();
      doc
        .font('Sans')
        .fontSize(9.5)
        .fillColor('#1E293B')
        .text(`${i + 1}. ${cleaned}`, { width: contentWidth, lineGap: 1.5 });
    });

    // 3. Critical Defects
    drawHeading('3. Критичные дефекты (Critical)');
    if (report.summary.criticalFindings.length === 0) {
      doc
        .font('Sans')
        .fontSize(9.5)
        .fillColor('#334155')
        .text('Критичных дефектов не выявлено.', { width: contentWidth });
    } else {
      report.summary.criticalFindings.forEach((cf, idx) => {
        ensureSpace(70);
        doc
          .font('Sans-Bold')
          .fontSize(9.5)
          .fillColor('#B91C1C')
          .text(
            `${idx + 1}. ${cf.findingId} · ${cf.category} · Требования: ${cf.requirementIds.join(', ') || 'ОБЩЕЕ'}`,
            { width: contentWidth }
          );
        doc
          .font('Sans')
          .fontSize(9)
          .fillColor('#475569')
          .text(`Источник: ${cf.sourceLocation}`, { width: contentWidth });
        doc
          .font('Sans')
          .fontSize(9.5)
          .fillColor('#0F172A')
          .text(cf.explanation, { width: contentWidth });
        doc
          .font('Mono')
          .fontSize(8.5)
          .fillColor('#334155')
          .text(`Цитата: «${cf.evidence}»`, { width: contentWidth });
        doc
          .font('Sans')
          .fontSize(9)
          .fillColor('#0F172A')
          .text(`Рекомендация: ${cf.recommendation}`, { width: contentWidth });
        doc.moveDown(0.45);
      });
    }

    // 4. Requirement Extraction Table
    drawHeading('4. Извлечённые требования');
    for (const req of report.requirements) {
      ensureSpace(58);
      doc
        .font('Sans-Bold')
        .fontSize(9.5)
        .fillColor('#0F172A')
        .text(`${req.id} (${req.docId}) — ${req.shortTitle}`, {
          width: contentWidth,
        });
      doc
        .font('Sans')
        .fontSize(8.5)
        .fillColor('#475569')
        .text(`${req.sourceLocation} · Категория: ${req.category}`, {
          width: contentWidth,
        });
      doc
        .font('Sans')
        .fontSize(9)
        .fillColor('#1E293B')
        .text(req.originalWording, { width: contentWidth });
      doc.moveDown(0.35);
    }

    // 5. Individual Requirement Analysis
    drawHeading('5. Индивидуальный анализ требований');
    for (const item of report.individualAnalyses) {
      ensureSpace(64);
      const c = item.criteria;
      doc
        .font('Sans-Bold')
        .fontSize(9.5)
        .fillColor('#0F172A')
        .text(`${item.requirementId} (${item.docId}) — ${verdictRu(item.verdict)}`, {
          width: contentWidth,
        });
      doc
        .font('Mono')
        .fontSize(8)
        .fillColor('#334155')
        .text(
          `Однозн: ${statusRu(c.unambiguity)} | Полн: ${statusRu(c.completeness)} | Провер: ${statusRu(c.verifiability)} | Осущ: ${statusRu(c.feasibility)} | Необх: ${statusRu(c.necessity)} | Согл: ${statusRu(c.consistency)} | Терм: ${statusRu(c.terminology)}`,
          { width: contentWidth }
        );
      doc
        .font('Sans')
        .fontSize(9)
        .fillColor('#1E293B')
        .text(item.summary, { width: contentWidth });
      if (item.findingIds.length > 0) {
        doc
          .font('Sans')
          .fontSize(8.5)
          .fillColor('#475569')
          .text(`Связанные находки: ${item.findingIds.join(', ')}`, {
            width: contentWidth,
          });
      }
      doc.moveDown(0.35);
    }

    // 6. Document-Level Analysis
    drawHeading('6. Анализ документа целиком');
    for (const aspect of report.documentAnalyses) {
      ensureSpace(58);
      doc
        .font('Sans-Bold')
        .fontSize(10)
        .fillColor('#0F172A')
        .text(`${aspect.aspectTitle} — ${verdictRu(aspect.status)}`, {
          width: contentWidth,
        });
      doc
        .font('Sans')
        .fontSize(9)
        .fillColor('#1E293B')
        .text(aspect.summary, { width: contentWidth });
      if (aspect.relatedRequirementIds.length > 0 || aspect.findingIds.length > 0) {
        doc
          .font('Sans')
          .fontSize(8.5)
          .fillColor('#475569')
          .text(
            `Требования: ${aspect.relatedRequirementIds.join(', ') || '—'} · Находки: ${aspect.findingIds.join(', ') || '—'}`,
            { width: contentWidth }
          );
      }
      doc.moveDown(0.4);
    }

    // 7. Findings Registry
    drawHeading('7. Реестр находок с доказательствами');
    for (const f of report.findings) {
      ensureSpace(78);
      doc
        .font('Sans-Bold')
        .fontSize(9.5)
        .fillColor(severityColor(f.severity))
        .text(
          `${f.findingId} · ${f.severity} · ${f.category} (${certaintyRu(f.certainty)})`,
          { width: contentWidth }
        );
      doc
        .font('Sans')
        .fontSize(8.5)
        .fillColor('#475569')
        .text(
          `Требования: ${f.requirementIds.join(', ') || 'ОБЩЕЕ'} · Локация: ${f.sourceLocation}`,
          { width: contentWidth }
        );
      doc
        .font('Mono')
        .fontSize(8.5)
        .fillColor('#334155')
        .text(`Свидетельство: «${f.evidence}»`, { width: contentWidth });
      doc
        .font('Sans')
        .fontSize(9)
        .fillColor('#0F172A')
        .text(`Объяснение: ${f.explanation}`, { width: contentWidth });
      doc
        .font('Sans')
        .fontSize(9)
        .fillColor('#1E293B')
        .text(`Рекомендация: ${f.recommendation}`, { width: contentWidth });
      doc.moveDown(0.45);
    }

    // Page footers
    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(i);
      doc
        .font('Sans')
        .fontSize(8)
        .fillColor('#64748B')
        .text(
          `Агент проверки требований · Страница ${i + 1} из ${pageRange.count}`,
          doc.page.margins.left,
          doc.page.height - 32,
          { align: 'right', width: contentWidth }
        );
    }

    doc.end();
  });
}
