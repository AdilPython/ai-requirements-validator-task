import type {
  ValidationReport,
  RequirementVerdict,
  CriterionStatus,
  SeverityLevel,
  FindingCertainty,
  RequirementCategory,
} from '../types/validation.ts';

function verdictLabel(verdict: RequirementVerdict): string {
  switch (verdict) {
    case 'pass':
      return 'Соответствует';
    case 'warning':
      return 'Есть замечания';
    case 'fail':
      return 'Нарушение';
  }
}

function criterionStatusLabel(status: CriterionStatus): string {
  switch (status) {
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

function severityLabel(severity: SeverityLevel): string {
  switch (severity) {
    case 'Critical':
      return 'Critical (Критичный)';
    case 'High':
      return 'High (Высокий)';
    case 'Medium':
      return 'Medium (Средний)';
    case 'Low':
      return 'Low (Низкий)';
  }
}

function certaintyLabel(certainty: FindingCertainty): string {
  return certainty === 'confirmed_defect'
    ? 'Подтверждённый дефект'
    : 'Вопрос / Потенциальный риск';
}

function categoryLabel(cat: RequirementCategory): string {
  switch (cat) {
    case 'functional':
      return 'Функциональное';
    case 'non_functional':
      return 'Нефункциональное';
    case 'integration':
      return 'Интеграция / API';
    case 'data':
      return 'Данные';
    case 'ui':
      return 'UI / UX';
    case 'acceptance':
      return 'Приёмка';
    case 'constraint':
      return 'Ограничение';
  }
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

export function formatMarkdownReport(
  report: Omit<ValidationReport, 'markdownReport'>
): string {
  const {
    passport,
    requirements,
    individualAnalyses,
    documentAnalyses,
    findings,
    summary,
    verdict,
  } = report;

  const lines: string[] = [];

  lines.push('# Отчёт статической проверки требований');
  lines.push('');

  lines.push('## 1. Паспорт прогона');
  lines.push('');
  lines.push('| Параметр | Значение |');
  lines.push('| :--- | :--- |');
  lines.push(`| **Документ** | ${escapeCell(passport.documentName)} |`);
  lines.push(
    `| **Заголовок документа** | ${escapeCell(passport.documentTitle)} |`
  );
  lines.push(`| **Дата и время прогона** | ${escapeCell(passport.runDate)} |`);
  lines.push(`| **Модель LLM** | \`${escapeCell(passport.model)}\` |`);
  lines.push(
    `| **Версия агента** | \`${escapeCell(passport.agentVersion)}\` |`
  );
  lines.push(
    `| **Формат и объём** | ${escapeCell(passport.sourceFormat.toUpperCase())} (${escapeCell(passport.totalUnitsLabel)}) |`
  );
  lines.push(`| **Обработано чанков** | ${passport.chunksProcessed} |`);
  lines.push(
    `| **Охвачено разделов/страниц** | ${passport.coveredSections.length} |`
  );
  lines.push(
    `| **Длительность анализа** | ${(passport.durationMs / 1000).toFixed(2)} с |`
  );
  lines.push('');

  lines.push('## 2. Таблица извлечённых требований');
  lines.push('');
  lines.push(
    '| ID | ID в документе | Тип | Источник | Оригинальная формулировка |'
  );
  lines.push('| :--- | :--- | :--- | :--- | :--- |');
  for (const req of requirements) {
    lines.push(
      `| ${escapeCell(req.id)} | ${escapeCell(req.docId)} | ${escapeCell(categoryLabel(req.category))} | ${escapeCell(req.sourceLocation)} | ${escapeCell(req.originalWording)} |`
    );
  }
  lines.push('');

  lines.push('## 3. Индивидуальный анализ каждого требования');
  lines.push('');
  lines.push(
    '| ID | Статус | Однозначность | Полнота | Проверяемость | Осуществимость | Необходимость | Согласованность | Терминология | Находки |'
  );
  lines.push(
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |'
  );
  for (const item of individualAnalyses) {
    const c = item.criteria;
    lines.push(
      `| ${escapeCell(item.requirementId)} | ${escapeCell(verdictLabel(item.verdict))} | ${criterionStatusLabel(c.unambiguity)} | ${criterionStatusLabel(c.completeness)} | ${criterionStatusLabel(c.verifiability)} | ${criterionStatusLabel(c.feasibility)} | ${criterionStatusLabel(c.necessity)} | ${criterionStatusLabel(c.consistency)} | ${criterionStatusLabel(c.terminology)} | ${escapeCell(item.findingIds.join(', ') || '—')} |`
    );
  }
  lines.push('');

  for (const item of individualAnalyses) {
    lines.push(
      `### ${item.requirementId} (${item.docId}) — ${verdictLabel(item.verdict)}`
    );
    lines.push('');
    lines.push(item.summary);
    if (item.findingIds.length > 0) {
      lines.push(`- **Связанные находки:** ${item.findingIds.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## 4. Анализ документа целиком');
  lines.push('');
  for (const aspect of documentAnalyses) {
    lines.push(
      `### ${aspect.aspectTitle} — ${verdictLabel(aspect.status)}`
    );
    lines.push('');
    lines.push(aspect.summary);
    lines.push('');
    if (aspect.relatedRequirementIds.length > 0) {
      lines.push(
        `- **Затронутые требования:** ${aspect.relatedRequirementIds.join(', ')}`
      );
    }
    if (aspect.findingIds.length > 0) {
      lines.push(`- **Связанные находки:** ${aspect.findingIds.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## 5. Находки с доказательствами и ссылками на источник');
  lines.push('');
  for (const f of findings) {
    lines.push(
      `### ${f.findingId} · ${severityLabel(f.severity)} · ${f.category} (${certaintyLabel(f.certainty)})`
    );
    lines.push('');
    lines.push(`- **Требования:** ${f.requirementIds.join(', ') || 'ОБЩЕЕ'}`);
    lines.push(`- **Расположение в источнике:** ${f.sourceLocation}`);
    lines.push(`- **Цитата / свидетельство:** «${f.evidence}»`);
    lines.push(`- **Объяснение:** ${f.explanation}`);
    lines.push(`- **Рекомендация:** ${f.recommendation}`);
    lines.push('');
  }

  lines.push('## 6. Статистика и сводка по критичности');
  lines.push('');
  lines.push(`- **Всего извлечено требований:** ${summary.totalRequirements} (функциональных: ${summary.functionalCount}, нефункциональных: ${summary.nonFunctionalCount}, прочих: ${summary.otherRequirementsCount})`);
  lines.push(
    `- **Результат по требованиям:** соответствуют — ${summary.passedRequirements}, с замечаниями — ${summary.warningRequirements}, с нарушениями — ${summary.failedRequirements}`
  );
  lines.push(
    `- **Всего находок:** ${summary.totalFindings} (подтверждённых дефектов: ${summary.confirmedDefectsCount}, вопросов и рисков: ${summary.questionsAndRisksCount})`
  );
  lines.push(
    `- **По критичности:** Critical — ${summary.severityCounts.Critical}, High — ${summary.severityCounts.High}, Medium — ${summary.severityCounts.Medium}, Low — ${summary.severityCounts.Low}`
  );
  lines.push('');

  lines.push('## 7. Критичные дефекты (Critical)');
  lines.push('');
  if (summary.criticalFindings.length === 0) {
    lines.push('Критичных дефектов не выявлено.');
    lines.push('');
  } else {
    for (const cf of summary.criticalFindings) {
      lines.push(
        `1. **${cf.findingId}** (${cf.requirementIds.join(', ') || 'ОБЩЕЕ'} · ${cf.sourceLocation}): ${cf.explanation}`
      );
      lines.push(`   - *Цитата:* «${cf.evidence}»`);
      lines.push(`   - *Исправление:* ${cf.recommendation}`);
    }
    lines.push('');
  }

  lines.push('## 8. Итоговое заключение и приоритезированные рекомендации');
  lines.push('');
  lines.push(`**Вердикт:** ${verdict.decisionLabel}`);
  lines.push(
    `- **Можно ли начинать разработку:** ${verdict.canStartDevelopment ? 'Да' : 'Нет'}`
  );
  lines.push(
    `- **Можно ли начинать тестирование:** ${verdict.canStartTesting ? 'Да' : 'Нет'}`
  );
  lines.push('');
  lines.push(verdict.rationale);
  lines.push('');
  lines.push('### Приоритезированные рекомендации');
  lines.push('');
  verdict.prioritizedRecommendations.forEach((rec, idx) => {
    lines.push(`${idx + 1}. ${rec}`);
  });
  lines.push('');

  return lines.join('\n');
}
