import { z } from 'zod';
import { Type } from '@google/genai';

export const SeverityEnum = z.enum(['Critical', 'High', 'Medium', 'Low']);
export const CertaintyEnum = z.enum(['confirmed_defect', 'question_or_risk']);
export const RequirementCategoryEnum = z.enum([
  'functional',
  'non_functional',
  'integration',
  'data',
  'ui',
  'acceptance',
  'constraint',
]);
export const CriterionStatusEnum = z.enum([
  'pass',
  'partial',
  'fail',
  'not_applicable',
]);
export const VerdictEnum = z.enum(['pass', 'warning', 'fail']);
export const ReadinessEnum = z.enum(['not_ready', 'conditional', 'ready']);
export const DocumentAspectEnum = z.enum([
  'contradictions',
  'missing_requirements',
  'duplicates',
  'inconsistent_terminology',
  'missing_business_scenarios',
  'parent_child_conflicts',
  'missing_integration_details',
]);

export const ChunkRequirementSchema = z.object({
  localRef: z.string().min(1),
  docId: z.string().min(1),
  category: RequirementCategoryEnum,
  section: z.string().min(1),
  sourceLocation: z.string().min(1),
  shortTitle: z.string().min(1),
  originalWording: z.string().min(1),
  verdict: VerdictEnum,
  criteria: z.object({
    unambiguity: CriterionStatusEnum,
    completeness: CriterionStatusEnum,
    verifiability: CriterionStatusEnum,
    feasibility: CriterionStatusEnum,
    necessity: CriterionStatusEnum,
    consistency: CriterionStatusEnum,
    terminology: CriterionStatusEnum,
  }),
  analysisSummary: z.string().min(1),
});

export const RawFindingSchema = z.object({
  requirementRefs: z.array(z.string()),
  category: z.string().min(1),
  severity: SeverityEnum,
  certainty: CertaintyEnum,
  evidence: z.string().min(1),
  sourceLocation: z.string().min(1),
  explanation: z.string().min(1),
  recommendation: z.string().min(1),
});

export const ChunkExtractionResponseSchema = z.object({
  documentTitle: z.string().min(1),
  nonRequirementSectionsObserved: z.array(z.string()),
  requirements: z.array(ChunkRequirementSchema),
  findings: z.array(RawFindingSchema),
});

export const WholeDocumentResponseSchema = z.object({
  documentAnalyses: z
    .array(
      z.object({
        aspect: DocumentAspectEnum,
        aspectTitle: z.string().min(1),
        status: VerdictEnum,
        summary: z.string().min(1),
        relatedRequirementIds: z.array(z.string()),
      })
    )
    .min(7),
  crossDocumentFindings: z.array(RawFindingSchema),
  verdict: z.object({
    decision: ReadinessEnum,
    decisionLabel: z.string().min(1),
    canStartDevelopment: z.boolean(),
    canStartTesting: z.boolean(),
    rationale: z.string().min(1),
    prioritizedRecommendations: z.array(z.string()).min(1),
  }),
});

export type ChunkExtractionResponse = z.infer<
  typeof ChunkExtractionResponseSchema
>;
export type WholeDocumentResponse = z.infer<typeof WholeDocumentResponseSchema>;

const RAW_FINDING_GENAI_SCHEMA = {
  type: Type.OBJECT,
  required: [
    'requirementRefs',
    'category',
    'severity',
    'certainty',
    'evidence',
    'sourceLocation',
    'explanation',
    'recommendation',
  ],
  properties: {
    requirementRefs: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Список ID требований (localRef или REQ-xxx), к которым относится находка. Для отсутствующих требований может быть ["ОБЩЕЕ"].',
    },
    category: {
      type: Type.STRING,
      description:
        'Категория проблемы: Противоречие, Неполнота, Двусмысленность, Непроверяемость, Неосуществимость, Конфликт спецификаций, Пропущенный сценарий, Детали интеграции, Терминология, Лишнее проектное решение, Дубликат.',
    },
    severity: {
      type: Type.STRING,
      enum: ['Critical', 'High', 'Medium', 'Low'],
    },
    certainty: {
      type: Type.STRING,
      enum: ['confirmed_defect', 'question_or_risk'],
      description:
        'confirmed_defect — если проблема прямо доказана текстом; question_or_risk — если это вопрос или потенциальный риск без прямого доказательства.',
    },
    evidence: {
      type: Type.STRING,
      description:
        'Точная цитата из исходного документа (или указание на пустой/отсутствующий раздел с цитатой заголовка). Запрещено выдумывать текст.',
    },
    sourceLocation: {
      type: Type.STRING,
      description:
        'Точная ссылка на место в документе (раздел, номера строк или номер страницы).',
    },
    explanation: {
      type: Type.STRING,
      description: 'Подробное объяснение проблемы и её влияния.',
    },
    recommendation: {
      type: Type.STRING,
      description: 'Конкретная рекомендация по исправлению.',
    },
  },
};

export const CHUNK_GENAI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: [
    'documentTitle',
    'nonRequirementSectionsObserved',
    'requirements',
    'findings',
  ],
  properties: {
    documentTitle: {
      type: Type.STRING,
      description: 'Название документа.',
    },
    nonRequirementSectionsObserved: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Список заголовков/метаданных/описательных блоков в чанке, которые не являются требованиями (чтобы подтвердить, что ни один раздел не пропущен).',
    },
    requirements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: [
          'localRef',
          'docId',
          'category',
          'section',
          'sourceLocation',
          'shortTitle',
          'originalWording',
          'verdict',
          'criteria',
          'analysisSummary',
        ],
        properties: {
          localRef: {
            type: Type.STRING,
            description: 'Уникальный локальный ключ в чанке, например C1-R01.',
          },
          docId: {
            type: Type.STRING,
            description:
              'Идентификатор в документе (например Ф-1) или Б/Н с указанием пункта.',
          },
          category: {
            type: Type.STRING,
            enum: [
              'functional',
              'non_functional',
              'integration',
              'data',
              'ui',
              'acceptance',
              'constraint',
            ],
          },
          section: { type: Type.STRING },
          sourceLocation: {
            type: Type.STRING,
            description: 'Раздел и строки или страница из маркеров текста.',
          },
          shortTitle: { type: Type.STRING },
          originalWording: {
            type: Type.STRING,
            description: 'Оригинальная формулировка из документа без искажений.',
          },
          verdict: {
            type: Type.STRING,
            enum: ['pass', 'warning', 'fail'],
          },
          criteria: {
            type: Type.OBJECT,
            required: [
              'unambiguity',
              'completeness',
              'verifiability',
              'feasibility',
              'necessity',
              'consistency',
              'terminology',
            ],
            properties: {
              unambiguity: {
                type: Type.STRING,
                enum: ['pass', 'partial', 'fail', 'not_applicable'],
              },
              completeness: {
                type: Type.STRING,
                enum: ['pass', 'partial', 'fail', 'not_applicable'],
              },
              verifiability: {
                type: Type.STRING,
                enum: ['pass', 'partial', 'fail', 'not_applicable'],
              },
              feasibility: {
                type: Type.STRING,
                enum: ['pass', 'partial', 'fail', 'not_applicable'],
              },
              necessity: {
                type: Type.STRING,
                enum: ['pass', 'partial', 'fail', 'not_applicable'],
              },
              consistency: {
                type: Type.STRING,
                enum: ['pass', 'partial', 'fail', 'not_applicable'],
              },
              terminology: {
                type: Type.STRING,
                enum: ['pass', 'partial', 'fail', 'not_applicable'],
              },
            },
          },
          analysisSummary: { type: Type.STRING },
        },
      },
    },
    findings: {
      type: Type.ARRAY,
      items: RAW_FINDING_GENAI_SCHEMA,
    },
  },
};

export const WHOLE_DOC_GENAI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: ['documentAnalyses', 'crossDocumentFindings', 'verdict'],
  properties: {
    documentAnalyses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: [
          'aspect',
          'aspectTitle',
          'status',
          'summary',
          'relatedRequirementIds',
        ],
        properties: {
          aspect: {
            type: Type.STRING,
            enum: [
              'contradictions',
              'missing_requirements',
              'duplicates',
              'inconsistent_terminology',
              'missing_business_scenarios',
              'parent_child_conflicts',
              'missing_integration_details',
            ],
          },
          aspectTitle: { type: Type.STRING },
          status: {
            type: Type.STRING,
            enum: ['pass', 'warning', 'fail'],
          },
          summary: { type: Type.STRING },
          relatedRequirementIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      },
    },
    crossDocumentFindings: {
      type: Type.ARRAY,
      items: RAW_FINDING_GENAI_SCHEMA,
    },
    verdict: {
      type: Type.OBJECT,
      required: [
        'decision',
        'decisionLabel',
        'canStartDevelopment',
        'canStartTesting',
        'rationale',
        'prioritizedRecommendations',
      ],
      properties: {
        decision: {
          type: Type.STRING,
          enum: ['not_ready', 'conditional', 'ready'],
        },
        decisionLabel: { type: Type.STRING },
        canStartDevelopment: { type: Type.BOOLEAN },
        canStartTesting: { type: Type.BOOLEAN },
        rationale: { type: Type.STRING },
        prioritizedRecommendations: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
    },
  },
};
