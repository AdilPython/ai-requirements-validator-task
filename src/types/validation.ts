export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export type FindingCertainty = 'confirmed_defect' | 'question_or_risk';

export type RequirementCategory =
  | 'functional'
  | 'non_functional'
  | 'integration'
  | 'data'
  | 'ui'
  | 'acceptance'
  | 'constraint';

export type CriterionStatus = 'pass' | 'partial' | 'fail' | 'not_applicable';

export type RequirementVerdict = 'pass' | 'warning' | 'fail';

export type ReadinessDecision = 'not_ready' | 'conditional' | 'ready';

export interface RunPassport {
  documentName: string;
  documentTitle: string;
  runDate: string;
  model: string;
  agentVersion: string;
  sourceFormat: 'markdown' | 'text' | 'pdf';
  totalUnitsLabel: string;
  chunksProcessed: number;
  coveredSections: string[];
  durationMs: number;
}

export interface ExtractedRequirement {
  id: string;
  docId: string;
  category: RequirementCategory;
  section: string;
  sourceLocation: string;
  shortTitle: string;
  originalWording: string;
}

export interface IndividualCriteriaEvaluation {
  unambiguity: CriterionStatus;
  completeness: CriterionStatus;
  verifiability: CriterionStatus;
  feasibility: CriterionStatus;
  necessity: CriterionStatus;
  consistency: CriterionStatus;
  terminology: CriterionStatus;
}

export interface RequirementAnalysis {
  requirementId: string;
  docId: string;
  verdict: RequirementVerdict;
  criteria: IndividualCriteriaEvaluation;
  summary: string;
  findingIds: string[];
}

export type DocumentAnalysisAspect =
  | 'contradictions'
  | 'missing_requirements'
  | 'duplicates'
  | 'inconsistent_terminology'
  | 'missing_business_scenarios'
  | 'parent_child_conflicts'
  | 'missing_integration_details';

export interface DocumentAspectAnalysis {
  aspect: DocumentAnalysisAspect;
  aspectTitle: string;
  status: RequirementVerdict;
  summary: string;
  relatedRequirementIds: string[];
  findingIds: string[];
}

export interface ValidationFinding {
  findingId: string;
  requirementIds: string[];
  category: string;
  severity: SeverityLevel;
  certainty: FindingCertainty;
  evidence: string;
  sourceLocation: string;
  explanation: string;
  recommendation: string;
}

export interface ValidationSummary {
  totalRequirements: number;
  functionalCount: number;
  nonFunctionalCount: number;
  otherRequirementsCount: number;
  passedRequirements: number;
  warningRequirements: number;
  failedRequirements: number;
  totalFindings: number;
  confirmedDefectsCount: number;
  questionsAndRisksCount: number;
  severityCounts: {
    Critical: number;
    High: number;
    Medium: number;
    Low: number;
  };
  criticalFindings: ValidationFinding[];
}

export interface FinalVerdict {
  decision: ReadinessDecision;
  decisionLabel: string;
  canStartDevelopment: boolean;
  canStartTesting: boolean;
  rationale: string;
  prioritizedRecommendations: string[];
}

export interface ValidationReport {
  id: string;
  passport: RunPassport;
  requirements: ExtractedRequirement[];
  individualAnalyses: RequirementAnalysis[];
  documentAnalyses: DocumentAspectAnalysis[];
  findings: ValidationFinding[];
  summary: ValidationSummary;
  verdict: FinalVerdict;
  markdownReport: string;
}

export interface DefaultDocumentResponse {
  filename: string;
  title: string;
  content: string;
  sizeBytes: number;
  lineCount: number;
}
