import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Copy,
  Check,
  Search,
  FileText,
} from 'lucide-react';
import type {
  ValidationReport,
  RequirementVerdict,
  SeverityLevel,
  CriterionStatus,
  FindingCertainty,
  RequirementCategory,
} from '../types/validation';

type ReportTab =
  | 'overview'
  | 'requirements'
  | 'analysis'
  | 'document'
  | 'findings'
  | 'markdown';

type SeverityFilter = 'all' | SeverityLevel;

interface ReportViewProps {
  report: ValidationReport | null;
  onGoToRun: () => void;
}

function VerdictText({ verdict }: { verdict: RequirementVerdict }) {
  if (verdict === 'pass') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>Соответствует</span>
      </span>
    );
  }
  if (verdict === 'warning') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>Есть замечания</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
      <XCircle className="w-3.5 h-3.5 shrink-0" />
      <span>Нарушение</span>
    </span>
  );
}

function criterionBadge(status: CriterionStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'pass':
      return { label: 'Да', className: 'text-emerald-700 font-medium' };
    case 'partial':
      return { label: 'Част.', className: 'text-amber-700 font-medium' };
    case 'fail':
      return { label: 'Нет', className: 'text-red-700 font-semibold' };
    case 'not_applicable':
      return { label: 'Н/П', className: 'text-slate-400' };
  }
}

function severityStyle(severity: SeverityLevel): {
  label: string;
  className: string;
} {
  switch (severity) {
    case 'Critical':
      return { label: 'Critical', className: 'text-red-700 font-semibold' };
    case 'High':
      return { label: 'High', className: 'text-orange-700 font-semibold' };
    case 'Medium':
      return { label: 'Medium', className: 'text-amber-700 font-medium' };
    case 'Low':
      return { label: 'Low', className: 'text-slate-600 font-medium' };
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

export const ReportView: React.FC<ReportViewProps> = ({
  report,
  onGoToRun,
}) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const filteredFindings = useMemo(() => {
    if (!report) return [];
    const q = searchQuery.trim().toLowerCase();
    return report.findings.filter((f) => {
      if (severityFilter !== 'all' && f.severity !== severityFilter) {
        return false;
      }
      if (!q) return true;
      return (
        f.findingId.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.explanation.toLowerCase().includes(q) ||
        f.evidence.toLowerCase().includes(q) ||
        f.requirementIds.some((id) => id.toLowerCase().includes(q))
      );
    });
  }, [report, severityFilter, searchQuery]);

  if (!report) {
    return (
      <div className="max-w-3xl mx-auto mt-12 bg-white border border-slate-200 rounded-lg p-10 text-center space-y-4">
        <FileText className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-lg font-semibold text-slate-900">
          Отчёт о проверке ещё не сформирован
        </h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
          Запустите статическую проверку документа требований, чтобы получить
          таблицу требований, оценку по 7 критериям, сквозной анализ документа и
          итоговое заключение о готовности к разработке.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onGoToRun}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors"
          >
            Перейти к запуску проверки
          </button>
        </div>
      </div>
    );
  }

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const res = await fetch('/api/report/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (!res.ok) {
        throw new Error('Ошибка генерации PDF');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `validation-report-${report.passport.documentName.replace(/[^a-zA-Z0-9а-яА-Я._-]/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([report.markdownReport], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `validation-report-${report.passport.documentName.replace(/[^a-zA-Z0-9а-яА-Я._-]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `validation-report-${report.passport.documentName.replace(/[^a-zA-Z0-9а-яА-Я._-]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyMarkdown = async () => {
    await navigator.clipboard.writeText(report.markdownReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const {
    passport,
    requirements,
    individualAnalyses,
    documentAnalyses,
    findings,
    summary,
    verdict,
  } = report;

  const decisionColor =
    verdict.decision === 'ready'
      ? 'text-emerald-700'
      : verdict.decision === 'conditional'
        ? 'text-amber-700'
        : 'text-red-700';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="border-b border-slate-200 pb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 font-mono tabular-nums">
            <span>{passport.documentName}</span>
            <span aria-hidden="true">·</span>
            <span>{passport.runDate}</span>
            <span aria-hidden="true">·</span>
            <span>{passport.model}</span>
            <span aria-hidden="true">·</span>
            <span>{passport.agentVersion}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Отчёт проверки: {passport.documentTitle}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-700" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? 'Скопировано' : 'Копировать .md'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>JSON</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Markdown</span>
          </button>

          <button
            type="button"
            disabled={downloadingPdf}
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloadingPdf ? 'Генерация PDF...' : 'Скачать PDF'}</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Извлечено требований</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {summary.totalRequirements}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Без замечаний: {summary.passedRequirements} · Чанков:{' '}
            {passport.chunksProcessed}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Всего находок</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {summary.totalFindings}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Дефекты: {summary.confirmedDefectsCount} · Риски:{' '}
            {summary.questionsAndRisksCount}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Critical / High</div>
          <div
            className={`mt-1 text-2xl font-semibold font-mono tabular-nums ${
              summary.severityCounts.Critical > 0
                ? 'text-red-700'
                : 'text-emerald-700'
            }`}
          >
            {summary.severityCounts.Critical} / {summary.severityCounts.High}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Medium: {summary.severityCounts.Medium} · Low:{' '}
            {summary.severityCounts.Low}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">Готовность документа</div>
          <div className={`mt-1 text-base font-semibold ${decisionColor}`}>
            {verdict.decisionLabel}
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            Разработка: {verdict.canStartDevelopment ? 'Да' : 'Нет'} · Тесты:{' '}
            {verdict.canStartTesting ? 'Да' : 'Нет'}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Разделы отчёта"
        className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit"
      >
        {(
          [
            ['overview', 'Обзор и итог'],
            ['requirements', `Требования (${requirements.length})`],
            ['analysis', `Оценка по критериям (${individualAnalyses.length})`],
            ['document', `Документ целиком (${documentAnalyses.length})`],
            ['findings', `Находки (${findings.length})`],
            ['markdown', 'Markdown'],
          ] as [ReportTab, string][]
        ).map(([tabKey, label]) => (
          <button
            key={tabKey}
            type="button"
            role="tab"
            aria-selected={activeTab === tabKey}
            onClick={() => setActiveTab(tabKey)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tabKey
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h2 className="text-base font-semibold text-slate-900">
                  Итоговое заключение
                </h2>
                <span className={`text-sm font-semibold ${decisionColor}`}>
                  {verdict.decisionLabel}
                </span>
              </div>

              <p className="text-sm text-slate-700 leading-relaxed">
                {verdict.rationale}
              </p>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-xs font-semibold text-slate-900 mb-2.5">
                  Приоритезированные рекомендации
                </h3>
                <ol className="space-y-2 text-sm text-slate-700 list-decimal list-inside">
                  {verdict.prioritizedRecommendations.map((item, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
              <h2 className="text-base font-semibold text-slate-900 border-b border-slate-200 pb-3">
                Паспорт прогона
              </h2>
              <dl className="divide-y divide-slate-100 text-xs">
                <div className="py-2 flex justify-between gap-4">
                  <dt className="text-slate-500">Документ</dt>
                  <dd className="font-mono text-slate-900 text-right break-all">
                    {passport.documentName}
                  </dd>
                </div>
                <div className="py-2 flex justify-between gap-4">
                  <dt className="text-slate-500">Дата прогона</dt>
                  <dd className="font-mono tabular-nums text-slate-900 text-right">
                    {passport.runDate}
                  </dd>
                </div>
                <div className="py-2 flex justify-between gap-4">
                  <dt className="text-slate-500">Модель</dt>
                  <dd className="font-mono text-slate-900 text-right">
                    {passport.model}
                  </dd>
                </div>
                <div className="py-2 flex justify-between gap-4">
                  <dt className="text-slate-500">Версия агента</dt>
                  <dd className="font-mono text-slate-900 text-right">
                    {passport.agentVersion}
                  </dd>
                </div>
                <div className="py-2 flex justify-between gap-4">
                  <dt className="text-slate-500">Охват</dt>
                  <dd className="font-mono tabular-nums text-slate-900 text-right">
                    {passport.totalUnitsLabel} · {passport.chunksProcessed} чанк(а)
                  </dd>
                </div>
                <div className="py-2 flex justify-between gap-4">
                  <dt className="text-slate-500">Длительность</dt>
                  <dd className="font-mono tabular-nums text-slate-900 text-right">
                    {(passport.durationMs / 1000).toFixed(2)} с
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                Критичные дефекты (Critical)
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                Найдено: {summary.criticalFindings.length}
              </span>
            </div>

            {summary.criticalFindings.length === 0 ? (
              <div className="p-6 text-sm text-slate-600">
                Критичных дефектов не зафиксировано.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {summary.criticalFindings.map((crit) => (
                  <div key={crit.findingId} className="p-5 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-red-700">
                        {crit.findingId}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-mono text-slate-800">
                        {crit.requirementIds.join(', ')}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="text-slate-600">{crit.category}</span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="text-slate-500">
                        {certaintyLabel(crit.certainty)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500">
                      {crit.sourceLocation}
                    </div>

                    <div className="text-sm text-slate-900 leading-relaxed">
                      {crit.explanation}
                    </div>

                    <div className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">
                      «{crit.evidence}»
                    </div>

                    <div className="text-xs text-slate-700">
                      <span className="font-medium text-slate-900">
                        Рекомендация:{' '}
                      </span>
                      {crit.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Extracted Requirements Table */}
      {activeTab === 'requirements' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Таблица извлечённых требований
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4 w-24">ID</th>
                  <th className="py-2.5 px-4 w-28">Док. ID</th>
                  <th className="py-2.5 px-4 w-36">Категория</th>
                  <th className="py-2.5 px-4 w-56">Источник</th>
                  <th className="py-2.5 px-4">Оригинальная формулировка</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {requirements.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {row.id}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {row.docId}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      {categoryLabel(row.category)}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {row.sourceLocation}
                    </td>
                    <td className="py-3 px-4 text-slate-900 leading-relaxed">
                      {row.originalWording}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Individual 7-Criteria Matrix */}
      {activeTab === 'analysis' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Индивидуальный анализ по 7 критериям
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-3">ID</th>
                  <th className="py-2.5 px-3">Статус</th>
                  <th className="py-2.5 px-2">Однозн.</th>
                  <th className="py-2.5 px-2">Полнота</th>
                  <th className="py-2.5 px-2">Провер.</th>
                  <th className="py-2.5 px-2">Осущ.</th>
                  <th className="py-2.5 px-2">Необх.</th>
                  <th className="py-2.5 px-2">Соглас.</th>
                  <th className="py-2.5 px-2">Термин.</th>
                  <th className="py-2.5 px-3">Комментарий</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {individualAnalyses.map((item) => {
                  const c = item.criteria;
                  const cells = [
                    c.unambiguity,
                    c.completeness,
                    c.verifiability,
                    c.feasibility,
                    c.necessity,
                    c.consistency,
                    c.terminology,
                  ];
                  return (
                    <tr
                      key={item.requirementId}
                      className="hover:bg-slate-50/70 align-top"
                    >
                      <td className="py-3 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {item.requirementId}
                        <div className="font-normal text-slate-500">
                          {item.docId}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <VerdictText verdict={item.verdict} />
                      </td>
                      {cells.map((st, idx) => {
                        const badge = criterionBadge(st);
                        return (
                          <td
                            key={idx}
                            className={`py-3 px-2 whitespace-nowrap ${badge.className}`}
                          >
                            {badge.label}
                          </td>
                        );
                      })}
                      <td className="py-3 px-3 text-slate-700 leading-relaxed min-w-64">
                        {item.summary}
                        {item.findingIds.length > 0 && (
                          <div className="mt-1 font-mono text-slate-500">
                            Находки: {item.findingIds.join(', ')}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Document-Level 7 Aspects */}
      {activeTab === 'document' && (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
          {documentAnalyses.map((item) => (
            <div key={item.aspect} className="p-5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  {item.aspectTitle}
                </h3>
                <VerdictText verdict={item.status} />
              </div>

              <p className="text-sm text-slate-700 leading-relaxed">
                {item.summary}
              </p>

              {(item.relatedRequirementIds.length > 0 ||
                item.findingIds.length > 0) && (
                <div className="text-xs font-mono text-slate-500">
                  Требования: {item.relatedRequirementIds.join(', ') || '—'} ·
                  Находки: {item.findingIds.join(', ') || '—'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Findings with Evidence */}
      {activeTab === 'findings' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  ['all', 'Все'],
                  ['Critical', 'Critical'],
                  ['High', 'High'],
                  ['Medium', 'Medium'],
                  ['Low', 'Low'],
                ] as [SeverityFilter, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSeverityFilter(key)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    severityFilter === key
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по ID, цитате или сути..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-500 w-72"
              />
            </div>
          </div>

          {filteredFindings.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
              Нет находок по заданному фильтру.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFindings.map((f) => {
                const sev = severityStyle(f.severity);
                return (
                  <div
                    key={f.findingId}
                    className="bg-white border border-slate-200 rounded-lg p-5 space-y-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold text-slate-900">
                          {f.findingId}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className={sev.className}>{sev.label}</span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="font-semibold text-slate-800">
                          {f.category}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-slate-600">
                          {certaintyLabel(f.certainty)}
                        </span>
                      </div>

                      <span className="font-mono text-slate-500">
                        {f.requirementIds.join(', ')}
                      </span>
                    </div>

                    <div className="text-slate-500">{f.sourceLocation}</div>

                    <p className="text-sm text-slate-800 leading-relaxed">
                      {f.explanation}
                    </p>

                    <div className="font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">
                      Свидетельство: «{f.evidence}»
                    </div>

                    <div className="text-slate-700">
                      <span className="font-medium text-slate-900">
                        Рекомендация:{' '}
                      </span>
                      {f.recommendation}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Markdown File */}
      {activeTab === 'markdown' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-600">
              Сформированный отчёт (Markdown)
            </span>
            <button
              type="button"
              onClick={handleDownloadMarkdown}
              className="text-xs font-medium text-slate-900 hover:underline whitespace-nowrap shrink-0"
            >
              Скачать .md
            </button>
          </div>
          <pre className="p-5 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-[70vh] overflow-y-auto">
            {report.markdownReport}
          </pre>
        </div>
      )}
    </div>
  );
};
