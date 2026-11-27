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
        `Модель "${normalized}" устарела и не поддерживается. Используйте актуальную модель, например gemini-3.5-flash-lite, gemini-2.5-flash или gemini-2.5-pro.`
      );
    }
    return normalized;
  }
  return 'gemini-3.5-flash-lite';
}

export function supportsThinkingLevel(model: string): boolean {
  if (model.includes('flash-lite')) {
    return false;
  }
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
2. Отличай реальные требования (functional, non_functional, integration, data, ui, acceptance, constraint) от заголовков, общих сведений/метаданных и вводных описаний.
   - Обязательно извлеки требования из ВСЕХ содержательных разделов: цели, UI-дизайн, BPMN/Sequence ограничения, функциональные требования (Ф-1..Ф-N), нефункциональные (SLA/время отправки), требования к данным (поля, валюта, единицы измерения), требования к интеграции (повторная доставка / идемпотентность), требования к тестированию, критерии приёмки, а также правила/логику/параметры/статусы REST API.
   - Разделы с метаданными, пустыми шаблонами или описаниями без требований перечисли в nonRequirementSectionsObserved (чтобы зафиксировать охват всех разделов).
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
5. Обязательно проверяй API- и финтех-дефекты (при наличии в тексте):
   - Использование HTTP GET для операций изменения состояния и передача чувствительных идентификаторов (например, cardId) в URL query-параметрах вместо POST/PUT JSON request body, а также противоречие «Content-Type: application/json» при пометке «Тело не используется» и отсутствие описания обязательных заголовков.
   - Возврат HTTP 200 OK с телом ошибки (например, {"result":"ERROR"}) для ошибок бизнес-валидации вместо корректных HTTP 400/422, а также несогласованные заголовки и описания статусов (например, «200. Successful — Created», описание 404 внутри раздела 403).
   - Отсутствие Production Base URL («Prod: —»), Swagger/OpenAPI («Swagger: —»), отсутствие метода чтения настроек при заявленном «чтение порога», расхождение типов данных (integer vs string), обязательность amount при enabled=0.
   - Финтех-особенности: расхождение единиц хранения и округления (тенге vs тиыны), отсутствие ключа идемпотентности/дедупликации событий процессинга при заявленной устойчивости к повторной доставке, граничные условия возвратов и сдвига даты операции/проведения на рубеже месяца и часового пояса, незаполненные разделы тестирования/ревью/согласования.
6. Для каждой выявленной проблемы создай объект в findings (без дублирования одной и той же проблемы):
   - severity: Critical | High | Medium | Low
   - certainty: confirmed_defect — только если проблема прямо доказывается точной цитатой из текста; question_or_risk — если проблема не доказана текстом на 100%, а является пробелом, вопросом к аналитику или потенциальным риском.
   - ЗАПРЕЩЕНО выдумывать цитаты. evidence обязано точно соответствовать тексту документа.`;

const WHOLE_DOC_SYSTEM_INSTRUCTION = `Ты — ведущий инженер-аналитик и архитектор качества требований.
На этапе 2 тебе переданы:
1) Полный реестр всех извлечённых требований документа (REQ-001..REQ-NNN).
2) Находки, уже выявленные на этапе 1.
3) Текст исходного документа (или полная сводка разделов, если документ очень большой).

Твоя задача — выполнить сквозной анализ документа целиком и вынести итоговый вердикт.

ПРАВИЛА ЭТАПА 2:
1. Язык ответа — строго русский.
2. В documentAnalyses ОБЯЗАТЕЛЬНО оцени все 7 аспектов (по одному объекту на каждый aspect):
   - contradictions (Противоречия между требованиями)
   - missing_requirements (Пропущенные требования, например обработка ошибок, ролевая модель, идемпотентность, чтение настроек, округление/тиыны)
   - duplicates (Дубликаты и избыточные повторения)
   - inconsistent_terminology (Несогласованная терминология, единицы измерения, названия сущностей)
   - missing_business_scenarios (Отсутствующие бизнес-сценарии и граничные кейсы, возвраты на границе месяца, отключение уведомлений, неактивные карты)
   - parent_child_conflicts (Конфликты между родительской и дочерней спецификациями, например Часть A vs Часть B)
   - missing_integration_details (Отсутствующие детали интеграции, Prod URL, контракты заголовков/ошибок, идемпотентность событий, тайм-ауты)
3. В crossDocumentFindings добавляй ТОЛЬКО НОВЫЕ межраздельные находки и системные пропуски, НЕ повторяя находки, которые уже зафиксированы в блоке «НАХОДКИ ИЗ ЧАНКОВ».
   - Укажи точные ID требований в requirementRefs (например ["REQ-004", "REQ-015"] или ["ОБЩЕЕ"]).
   - Укажи severity: Critical | High | Medium | Low.
   - Строго соблюдай правило доказанности: confirmed_defect при наличии прямой цитаты/факта из текста, question_or_risk если это вопрос или потенциальный риск. Никогда не выдумывай цитаты.
4. В verdict чётко определи:
   - decision: not_ready | conditional | ready
   - canStartDevelopment: true/false
   - canStartTesting: true/false
   - rationale: развёрнутое обоснование со ссылками на конкретные находки и разделы.
   - prioritizedRecommendations: массив конкретных рекомендаций БЕЗ префиксов нумерации в начале строки (не пиши «1. » в самом тексте элемента).`;

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

export function stripLeadingNumbering(text: string): string {
  return text.replace(/^\s*\d+[.)]\s+/, '').trim();
}

const SEVERITY_RANK: Record<ValidationFinding['severity'], number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

function normalizeEvidenceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[*_`#«»"'“”]/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeWords(text: string): Set<string> {
  const matches = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  return new Set(matches);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function hasExplicitUnitNumber(location: string): boolean {
  return /(?:строк|страниц|\bL\d+|\d+)/i.test(location);
}

export type RawFindingCandidate = Omit<ValidationFinding, 'findingId'>;

export function deduplicateFindings(
  candidates: RawFindingCandidate[]
): ValidationFinding[] {
  const merged: RawFindingCandidate[] = [];

  for (const candidate of candidates) {
    const normCandEv = normalizeEvidenceText(candidate.evidence);
    const candTokens = tokenizeWords(candidate.explanation);
    const normCandLoc = candidate.sourceLocation.toLowerCase().trim();

    let matchIndex = -1;

    for (let i = 0; i < merged.length; i++) {
      const existing = merged[i];
      const normExEv = normalizeEvidenceText(existing.evidence);
      const exTokens = tokenizeWords(existing.explanation);
      const normExLoc = existing.sourceLocation.toLowerCase().trim();

      const expSim = jaccardSimilarity(candTokens, exTokens);
      const exactEvidenceMatch =
        normCandEv.length > 0 && normCandEv === normExEv;
      const substringEvidenceMatch =
        normCandEv.length >= 12 &&
        normExEv.length >= 12 &&
        (normCandEv.includes(normExEv) || normExEv.includes(normCandEv));
      const sameCategory =
        existing.category.toLowerCase().trim() ===
        candidate.category.toLowerCase().trim();
      const sameLocation =
        normCandLoc.length > 0 && normCandLoc === normExLoc;

      const isDuplicate =
        (exactEvidenceMatch && (sameCategory || expSim >= 0.25)) ||
        (substringEvidenceMatch && expSim >= 0.3) ||
        (sameLocation && expSim >= 0.55);

      if (isDuplicate) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex === -1) {
      merged.push({
        ...candidate,
        requirementIds:
          candidate.requirementIds.length > 0
            ? Array.from(new Set(candidate.requirementIds))
            : ['ОБЩЕЕ'],
      });
      continue;
    }

    const existing = merged[matchIndex];
    const specificReqIds = Array.from(
      new Set([...existing.requirementIds, ...candidate.requirementIds])
    ).filter((id) => id !== 'ОБЩЕЕ');

    const bestSeverity =
      SEVERITY_RANK[candidate.severity] > SEVERITY_RANK[existing.severity]
        ? candidate.severity
        : existing.severity;

    const bestCertainty =
      existing.certainty === 'confirmed_defect' ||
      candidate.certainty === 'confirmed_defect'
        ? 'confirmed_defect'
        : 'question_or_risk';

    const bestLocation =
      hasExplicitUnitNumber(existing.sourceLocation) &&
      !hasExplicitUnitNumber(candidate.sourceLocation)
        ? existing.sourceLocation
        : !hasExplicitUnitNumber(existing.sourceLocation) &&
            hasExplicitUnitNumber(candidate.sourceLocation)
          ? candidate.sourceLocation
          : existing.sourceLocation.length >= candidate.sourceLocation.length
            ? existing.sourceLocation
            : candidate.sourceLocation;

    const bestEvidence =
      existing.evidence.length >= candidate.evidence.length
        ? existing.evidence
        : candidate.evidence;

    const bestExplanation =
      existing.explanation.length >= candidate.explanation.length
        ? existing.explanation
        : candidate.explanation;

    const bestRecommendation =
      existing.recommendation.length >= candidate.recommendation.length
        ? existing.recommendation
        : candidate.recommendation;

    merged[matchIndex] = {
      ...existing,
      requirementIds: specificReqIds.length > 0 ? specificReqIds : ['ОБЩЕЕ'],
      severity: bestSeverity,
      certainty: bestCertainty,
      sourceLocation: bestLocation,
      evidence: bestEvidence,
      explanation: bestExplanation,
      recommendation: bestRecommendation,
    };
  }

  return merged.map((item, idx) => ({
    ...item,
    findingId: padId('FND', idx + 1),
  }));
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

  const chunks = chunkDocument(processed, input.maxCharsPerChunk ?? 25000);
  const coveredSections = Array.from(
    new Set(processed.segments.map((s) => s.sectionTitle))
  );

  // Pass 1: Extract & analyze each chunk
  const requirements: ExtractedRequirement[] = [];
  const individualAnalyses: RequirementAnalysis[] = [];
  const rawFindings: RawFindingCandidate[] = [];
  const localRefToGlobalId = new Map<string, string>();

  let reqCounter = 1;
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

      rawFindings.push({
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

  const intermediateFindings = deduplicateFindings(rawFindings);
  const findingsDigest = intermediateFindings
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

--- НАХОДКИ ИЗ ЧАНКОВ (НЕ ДУБЛИРУЙ ИХ В crossDocumentFindings) ---
${findingsDigest || 'Пока не зафиксировано.'}

${contextBody}

Выполни целостный анализ всего документа по всем 7 аспектам (противоречия, пропущенные требования, дубликаты, несогласованная терминология, отсутствующие бизнес-сценарии, конфликты родитель/дочерняя, детали интеграции), добавь ТОЛЬКО недостающие сквозные находки и сформируй итоговое заключение о готовности к разработке и тестированию.`;

  const wholeDocResult: WholeDocumentResponse = await callGeminiStructured(
    ai,
    model,
    WHOLE_DOC_SYSTEM_INSTRUCTION,
    wholeDocPrompt,
    WHOLE_DOC_GENAI_RESPONSE_SCHEMA,
    WholeDocumentResponseSchema
  );

  for (const rawCross of wholeDocResult.crossDocumentFindings) {
    const mappedReqIds = Array.from(
      new Set(
        rawCross.requirementRefs.map(
          (ref) => localRefToGlobalId.get(ref) ?? ref
        )
      )
    );

    rawFindings.push({
      requirementIds: mappedReqIds.length > 0 ? mappedReqIds : ['ОБЩЕЕ'],
      category: rawCross.category,
      severity: rawCross.severity,
      certainty: rawCross.certainty,
      evidence: rawCross.evidence,
      sourceLocation: rawCross.sourceLocation,
      explanation: rawCross.explanation,
      recommendation: rawCross.recommendation,
    });
  }

  // Deduplicate all findings across chunks and Pass 2 before assigning final FND-XXX IDs
  const findings = deduplicateFindings(rawFindings);

  for (const analysis of individualAnalyses) {
    analysis.findingIds = findings
      .filter((f) => f.requirementIds.includes(analysis.requirementId))
      .map((f) => f.findingId);
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
      return {
        aspect: item.aspect,
        aspectTitle: item.aspectTitle,
        status: item.status,
        summary: item.summary,
        relatedRequirementIds: item.relatedRequirementIds,
        findingIds: Array.from(new Set(relatedFindings)),
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

  const normalizedVerdict = {
    ...wholeDocResult.verdict,
    prioritizedRecommendations: wholeDocResult.verdict.prioritizedRecommendations
      .map(stripLeadingNumbering)
      .filter((s) => s.length > 0),
  };

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
    verdict: normalizedVerdict,
  };

  const markdownReport = formatMarkdownReport(baseReport);

  return {
    ...baseReport,
    markdownReport,
  };
}
