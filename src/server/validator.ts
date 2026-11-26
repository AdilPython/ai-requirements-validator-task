import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { z } from 'zod';
import {
  processDocument,
  chunkDocument,
  type ProcessedDocument,
} from './documentProcessor.ts';
import {
  CHUNK_GENAI_RESPONSE_SCHEMA,
  WHOLE_DOC_GENAI_RESPONSE_SCHEMA,
  ChunkExtractionResponseSchema,
  WholeDocumentResponseSchema,
  type ChunkExtractionResponse,
  type WholeDocumentResponse,
} from './schemas.ts';
import { formatMarkdownReport } from './reportFormatter.ts';
import type {
  ValidationReport,
  ExtractedRequirement,
  RequirementAnalysis,
  ValidationFinding,
  DocumentAspectAnalysis,
} from '../types/validation.ts';

const DEPRECATED_MODELS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking',
]);

export function resolveModelName(overrideModel?: string): string {
  const candidate = overrideModel?.trim() || process.env.GEMINI_MODEL?.trim();
  if (candidate) {
    const normalized = candidate.replace(/^models\//, '');
    if (DEPRECATED_MODELS.has(normalized)) {
      throw new Error(
        `Модель "${normalized}" устарела и не поддерживается. Используйте актуальную модель, например gemini-4-hydrogen, gemini-2.5-flash или gemini-2.5-pro.`
      );
    }
    return normalized;
  }
  return 'gemini-4-hydrogen';
}

export function supportsThinkingLevel(model: string): boolean {
  return /^gemini-(3|4)/.test(model);
}

export function resolveAgentVersion(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    }).trim();
    if (sha) return `git:${sha}`;
  } catch {
    // Fallback to package.json version if not a git checkout
  }
  try {
    const pkgRaw = fs.readFileSync(
      path.resolve(process.cwd(), 'package.json'),
      'utf-8'
    );
    const pkg = JSON.parse(pkgRaw) as { version?: string };
    if (pkg.version) return `v${pkg.version}`;
  } catch {
    // Ignore
  }
  return 'v1.0.0';
}

const CHUNK_SYSTEM_INSTRUCTION = `Ты — ведущий инженер-аналитик и эксперт по статическому ревью финтех-спецификаций и программных требований.
Твоя задача на этапе 1 (извлечение и индивидуальный анализ) — обработать переданный фрагмент (чанк) документа с требованиями, НЕ пропустив ни одного раздела.

ПРАВИЛА ЭТАПА 1:
1. Язык ответа — строго русский.
2. Отличай реальные требования (functional, non_functional, integration, data, ui, acceptance, constraint) от заголовков, общих сведений/метаданных и вводных описаний. Разделы с метаданными, пустыми шаблонами или описаниями без требований обязательно перечисли в nonRequirementSectionsObserved (чтобы зафиксировать охват всех разделов), а сами проверяемые положения/пункты/табличные правила/контракты API извлеки в requirements.
3. Сохраняй оригинальную формулировку (originalWording) и точную ссылку на источник (sourceLocation) по маркерам строк L.. или страниц [Страница N] из переданного текста.
4. Для каждого извлечённого требования оцени 7 критериев:
   - unambiguity (Однозначность)
   - completeness (Полнота)
   - verifiability (Проверяемость и тестопригодность)
   - feasibility (Осуществимость)
   - necessity (Необходимость)
   - consistency (Согласованность)
   - terminology (Корректность терминологии)
   Используй значения: pass, partial, fail, not_applicable.
5. Для каждой выявленной проблемы создай объект в findings:
   - severity: Critical | High | Medium | Low
   - certainty: confirmed_defect — только если проблема прямо доказывается точной цитатой из текста (например, явное противоречие, пустая заглушка «заполняются тестировщиками», GET-метод для сохранения состояния, несогласованные коды 200/400/403/404); question_or_risk — если проблема не доказана текстом на 100%, а является пробелом, вопросом к аналитику или потенциальным риском.
   - ЗАПРЕЩЕНО выдумывать цитаты. evidence обязано точно соответствовать тексту документа.`;

const WHOLE_DOC_SYSTEM_INSTRUCTION = `Ты — ведущий инженер-аналитик и архитектор качества требований.
На этапе 2 тебе переданы:
1) Полный реестр всех извлечённых требований документа (REQ-001..REQ-NNN).
2) Находки, уже выявленные по отдельным фрагментам.
3) Текст исходного документа (или полная сводка разделов, если документ очень большой).

Твоя задача — выполнить сквозной анализ документа целиком и вынести итоговый вердикт.

ПРАВИЛА ЭТАПА 2:
1. Язык ответа — строго русский.
2. В documentAnalyses ОБЯЗАТЕЛЬНО оцени все 7 аспектов (по одному объекту на каждый aspect):
   - contradictions (Противоречия между требованиями)
   - missing_requirements (Пропущенные требования, например обработка ошибок, ролевая модель, идемпотентность, чтение настроек и т.д.)
   - duplicates (Дубликаты и избыточные повторения)
   - inconsistent_terminology (Несогласованная терминология, единицы измерения, названия сущностей)
   - missing_business_scenarios (Отсутствующие бизнес-сценарии и граничные кейсы)
   - parent_child_conflicts (Конфликты между родительской и дочерней спецификациями, например Часть A vs Часть B)
   - missing_integration_details (Отсутствующие детали интеграции, контрактов, авторизации, форматов и тайм-аутов)
3. В crossDocumentFindings добавь сквозные и межраздельные находки (не дублируя уже перечисленные дословно, а фиксируя конфликты между частями документа, пропуски и системные риски). Для каждой находки:
   - Укажи точные ID требований в requirementRefs (например ["REQ-004", "REQ-015"] или ["ОБЩЕЕ"]).
   - Укажи severity: Critical | High | Medium | Low.
   - Строго соблюдай правило доказанности: confirmed_defect при наличии прямой цитаты/факта из текста, question_or_risk если это вопрос или потенциальный риск. Никогда не выдумывай цитаты.
4. В verdict чётко определи:
   - decision: not_ready | conditional | ready
   - canStartDevelopment: true/false
   - canStartTesting: true/false
   - rationale: развёрнутое обоснование со ссылками на конкретные находки и разделы.
   - prioritizedRecommendations: конкретный нумерованный план первоочередных исправлений.`;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiStructured<T>(
  ai: GoogleGenAI,
  model: string,
  systemInstruction: string,
  contents: string,
  genaiSchema: Record<string, unknown>,
  zodSchema: z.ZodType<T>
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: genaiSchema,
          ...(supportsThinkingLevel(model)
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } }
            : {}),
        },
      });

      const rawText = response.text;
      if (!rawText || !rawText.trim()) {
        throw new Error('Модель Gemini вернула пустой ответ.');
      }

      let jsonParsed: unknown;
      try {
        jsonParsed = JSON.parse(rawText);
      } catch (parseErr) {
        throw new Error(
          `Модель вернула некорректный JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
        );
      }

      const validated = zodSchema.safeParse(jsonParsed);
      if (!validated.success) {
        const issueSummary = validated.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
          .join('; ');
        throw new Error(
          `Ответ модели не прошёл валидацию схемы: ${issueSummary}`
        );
      }

      return validated.data;
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isAuthOrConfigError =
        msg.includes('API_KEY_INVALID') ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('400') ||
        msg.includes('403') ||
        msg.includes('404');

      if (isAuthOrConfigError || attempt === 2) {
        break;
      }
      await sleep(1000 * Math.pow(2, attempt));
    }
  }

  const rawMsg =
    lastError instanceof Error ? lastError.message : 'Неизвестная ошибка API';

  if (
    rawMsg.includes('API_KEY_INVALID') ||
    rawMsg.includes('PERMISSION_DENIED') ||
    rawMsg.includes('403')
  ) {
    throw new Error(
      `Ошибка авторизации Gemini API (${rawMsg}). Проверьте GEMINI_API_KEY в переменных окружения или в панели Settings > Secrets.`
    );
  }
  if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('429')) {
    throw new Error(
      `Превышена квота запросов Gemini API (429). Повторите попытку позже или проверьте лимиты ключа.`
    );
  }

  throw new Error(`Ошибка при обращении к Gemini API: ${rawMsg}`);
}

export interface ValidateInput {
  documentName: string;
  sourceFormat: 'markdown' | 'text' | 'pdf';
  textContent?: string;
  pdfBuffer?: Buffer;
  modelOverride?: string;
  maxCharsPerChunk?: number;
}

function padId(prefix: string, num: number): string {
  return `${prefix}-${String(num).padStart(3, '0')}`;
}

export async function validateRequirementsDocument(
  input: ValidateInput
): Promise<ValidationReport> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'Не задан ключ GEMINI_API_KEY. Укажите его в файле .env (для CLI) или в настройках Secrets (для веб-сервера).'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const model = resolveModelName(input.modelOverride);
  const agentVersion = resolveAgentVersion();
  const startedAt = Date.now();

  const processed: ProcessedDocument = await processDocument({
    documentName: input.documentName,
    sourceFormat: input.sourceFormat,
    textContent: input.textContent,
    pdfBuffer: input.pdfBuffer,
  });

  const chunks = chunkDocument(processed, input.maxCharsPerChunk ?? 14000);
  const coveredSections = Array.from(
    new Set(processed.segments.map((s) => s.sectionTitle))
  );

  // Pass 1: Extract & analyze each chunk
  const requirements: ExtractedRequirement[] = [];
  const individualAnalyses: RequirementAnalysis[] = [];
  const findings: ValidationFinding[] = [];
  const localRefToGlobalId = new Map<string, string>();
  const reqFindingsMap = new Map<string, string[]>();

  let reqCounter = 1;
  let findingCounter = 1;
  let resolvedDocTitle = processed.documentTitle;

  for (const chunk of chunks) {
    const chunkPrompt = `Документ: ${processed.documentName} (${processed.documentTitle})
Чанк ${chunk.chunkIndex} из ${chunk.totalChunks} (диапазон: ${chunk.locationRange}).
Разделы в этом чанке: ${chunk.sectionTitles.join(' | ')}

Проанализируй КАЖДЫЙ раздел этого чанка, не пропуская ни одного блока. Извлеки все требования, оцени каждое по 7 критериям качества и зафиксируй подтверждённые дефекты или вопросы/риски.

--- НАЧАЛО ФРАГМЕНТА ---
${chunk.annotatedText}
--- КОНЕЦ ФРАГМЕНТА ---`;

    const chunkResult: ChunkExtractionResponse = await callGeminiStructured(
      ai,
      model,
      CHUNK_SYSTEM_INSTRUCTION,
      chunkPrompt,
      CHUNK_GENAI_RESPONSE_SCHEMA,
      ChunkExtractionResponseSchema
    );

    if (
      chunk.chunkIndex === 1 &&
      chunkResult.documentTitle &&
      chunkResult.documentTitle.trim()
    ) {
      resolvedDocTitle = chunkResult.documentTitle.trim();
    }

    for (const rawReq of chunkResult.requirements) {
      const globalId = padId('REQ', reqCounter++);
      const scopedLocalKey = `${chunk.chunkIndex}:${rawReq.localRef}`;
      localRefToGlobalId.set(scopedLocalKey, globalId);
      localRefToGlobalId.set(rawReq.localRef, globalId);

      requirements.push({
        id: globalId,
        docId: rawReq.docId,
        category: rawReq.category,
        section: rawReq.section,
        sourceLocation: rawReq.sourceLocation,
        shortTitle: rawReq.shortTitle,
        originalWording: rawReq.originalWording,
      });

      reqFindingsMap.set(globalId, []);

      individualAnalyses.push({
        requirementId: globalId,
        docId: rawReq.docId,
        verdict: rawReq.verdict,
        criteria: rawReq.criteria,
        summary: rawReq.analysisSummary,
        findingIds: [],
      });
    }

    for (const rawFinding of chunkResult.findings) {
      const fId = padId('FND', findingCounter++);
      const mappedReqIds = Array.from(
        new Set(
          rawFinding.requirementRefs.map((ref) => {
            const scoped = `${chunk.chunkIndex}:${ref}`;
            return (
              localRefToGlobalId.get(scoped) ??
              localRefToGlobalId.get(ref) ??
              ref
            );
          })
        )
      );

      for (const reqId of mappedReqIds) {
        const list = reqFindingsMap.get(reqId);
        if (list && !list.includes(fId)) {
          list.push(fId);
        }
      }

      findings.push({
        findingId: fId,
        requirementIds: mappedReqIds.length > 0 ? mappedReqIds : ['ОБЩЕЕ'],
        category: rawFinding.category,
        severity: rawFinding.severity,
        certainty: rawFinding.certainty,
        evidence: rawFinding.evidence,
        sourceLocation: rawFinding.sourceLocation,
        explanation: rawFinding.explanation,
        recommendation: rawFinding.recommendation,
      });
    }
  }

  // Pass 2: Whole-document analysis & verdict
  const requirementsDigest = requirements
    .map(
      (r) =>
        `${r.id} [${r.docId} | ${r.category} | ${r.sourceLocation}]: ${r.originalWording}`
    )
    .join('\n');

  const findingsDigest = findings
    .map(
      (f) =>
        `${f.findingId} [${f.severity} | ${f.certainty} | ${f.requirementIds.join(', ')}]: ${f.explanation} (Цитата: «${f.evidence}»)`
    )
    .join('\n');

  const contextBody =
    processed.rawText.length <= 45000
      ? `--- ПОЛНЫЙ ТЕКСТ ДОКУМЕНТА ---\n${processed.rawText}\n--- КОНЕЦ ТЕКСТА ---`
      : `--- ОГЛАВЛЕНИЕ И СТРУКТУРА СЕГМЕНТОВ (документ разбит на ${chunks.length} чанков) ---\n${processed.segments
          .map((s) => `${s.sourceLocation}:\n${s.text.slice(0, 1000)}`)
          .join('\n\n')}`;

  const wholeDocPrompt = `Документ: ${processed.documentName} (${resolvedDocTitle})
Всего извлечено требований: ${requirements.length}.

--- РЕЕСТР ИЗВЛЕЧЁННЫХ ТРЕБОВАНИЙ ---
${requirementsDigest}

--- НАХОДКИ ИЗ ЧАНКОВ ---
${findingsDigest || 'Пока не зафиксировано.'}

${contextBody}

Выполни целостный анализ всего документа по всем 7 аспектам (противоречия, пропущенные требования, дубликаты, несогласованная терминология, отсутствующие бизнес-сценарии, конфликты родитель/дочерняя, детали интеграции), добавь сквозные находки и сформируй итоговое заключение о готовности к разработке и тестированию.`;

  const wholeDocResult: WholeDocumentResponse = await callGeminiStructured(
    ai,
    model,
    WHOLE_DOC_SYSTEM_INSTRUCTION,
    wholeDocPrompt,
    WHOLE_DOC_GENAI_RESPONSE_SCHEMA,
    WholeDocumentResponseSchema
  );

  const crossFindingIdsByAspect = new Map<string, string[]>();

  for (const rawCross of wholeDocResult.crossDocumentFindings) {
    const fId = padId('FND', findingCounter++);
    const mappedReqIds = Array.from(
      new Set(
        rawCross.requirementRefs.map(
          (ref) => localRefToGlobalId.get(ref) ?? ref
        )
      )
    );

    for (const reqId of mappedReqIds) {
      const list = reqFindingsMap.get(reqId);
      if (list && !list.includes(fId)) {
        list.push(fId);
      }
    }

    const finding: ValidationFinding = {
      findingId: fId,
      requirementIds: mappedReqIds.length > 0 ? mappedReqIds : ['ОБЩЕЕ'],
      category: rawCross.category,
      severity: rawCross.severity,
      certainty: rawCross.certainty,
      evidence: rawCross.evidence,
      sourceLocation: rawCross.sourceLocation,
      explanation: rawCross.explanation,
      recommendation: rawCross.recommendation,
    };
    findings.push(finding);

    for (const aspectItem of wholeDocResult.documentAnalyses) {
      const overlapsReq = aspectItem.relatedRequirementIds.some((id) =>
        finding.requirementIds.includes(id)
      );
      if (overlapsReq) {
        const arr = crossFindingIdsByAspect.get(aspectItem.aspect) ?? [];
        arr.push(fId);
        crossFindingIdsByAspect.set(aspectItem.aspect, arr);
      }
    }
  }

  for (const analysis of individualAnalyses) {
    analysis.findingIds = reqFindingsMap.get(analysis.requirementId) ?? [];
  }

  const documentAnalyses: DocumentAspectAnalysis[] =
    wholeDocResult.documentAnalyses.map((item) => {
      const relatedFindings = findings
        .filter((f) =>
          f.requirementIds.some((rid) =>
            item.relatedRequirementIds.includes(rid)
          )
        )
        .map((f) => f.findingId);
      const mergedFindingIds = Array.from(
        new Set([
          ...relatedFindings,
          ...(crossFindingIdsByAspect.get(item.aspect) ?? []),
        ])
      );
      return {
        aspect: item.aspect,
        aspectTitle: item.aspectTitle,
        status: item.status,
        summary: item.summary,
        relatedRequirementIds: item.relatedRequirementIds,
        findingIds: mergedFindingIds,
      };
    });

  // Deterministic summary calculations
  let functionalCount = 0;
  let nonFunctionalCount = 0;
  let otherRequirementsCount = 0;
  for (const r of requirements) {
    if (r.category === 'functional') functionalCount++;
    else if (r.category === 'non_functional') nonFunctionalCount++;
    else otherRequirementsCount++;
  }

  let passedRequirements = 0;
  let warningRequirements = 0;
  let failedRequirements = 0;
  for (const a of individualAnalyses) {
    if (a.verdict === 'pass') passedRequirements++;
    else if (a.verdict === 'warning') warningRequirements++;
    else failedRequirements++;
  }

  const severityCounts = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
  };
  let confirmedDefectsCount = 0;
  let questionsAndRisksCount = 0;

  for (const f of findings) {
    severityCounts[f.severity]++;
    if (f.certainty === 'confirmed_defect') confirmedDefectsCount++;
    else questionsAndRisksCount++;
  }

  const criticalFindings = findings.filter((f) => f.severity === 'Critical');

  const durationMs = Date.now() - startedAt;
  const runDate = new Date().toLocaleString('ru-RU', {
    timeZone: 'Asia/Almaty',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const baseReport: Omit<ValidationReport, 'markdownReport'> = {
    id: crypto.randomUUID(),
    passport: {
      documentName: processed.documentName,
      documentTitle: resolvedDocTitle,
      runDate: `${runDate} (UTC+5 / Алматы)`,
      model,
      agentVersion,
      sourceFormat: processed.sourceFormat,
      totalUnitsLabel: processed.totalUnitsLabel,
      chunksProcessed: chunks.length,
      coveredSections,
      durationMs,
    },
    requirements,
    individualAnalyses,
    documentAnalyses,
    findings,
    summary: {
      totalRequirements: requirements.length,
      functionalCount,
      nonFunctionalCount,
      otherRequirementsCount,
      passedRequirements,
      warningRequirements,
      failedRequirements,
      totalFindings: findings.length,
      confirmedDefectsCount,
      questionsAndRisksCount,
      severityCounts,
      criticalFindings,
    },
    verdict: wholeDocResult.verdict,
  };

  const markdownReport = formatMarkdownReport(baseReport);

  return {
    ...baseReport,
    markdownReport,
  };
}
