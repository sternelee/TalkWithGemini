export type SkillDataLocale = "en" | "zh-CN";

export interface TextSkillRisk {
  level: "low" | "medium" | "high" | string;
  textOnly: boolean;
  scriptRequired: boolean;
  externalToolRequired: boolean;
  networkRequired: boolean;
  reviewRequiredForHighStakes: boolean;
}

export interface TextSkillActivation {
  embeddingText: string;
  useWhen: string[];
  avoidWhen: string[];
  exampleQueries: string[];
}

export interface SkillCatalogEntry {
  id: string;
  name: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  audience: string;
  language: string;
  outputFormat: string;
  risk: TextSkillRisk;
  activation: TextSkillActivation;
  file?: string;
  builtIn?: boolean;
  isCustom?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TextSkill extends SkillCatalogEntry {
  content: string;
}

export interface SkillDatasetRuntime {
  environment: string;
  storage: string;
  executionModel: string;
  supportsScripts: boolean;
  supportsExternalTools: boolean;
  supportsNetwork: boolean;
}

export interface SkillCatalog {
  schemaVersion: string;
  generatedAt: string;
  locale: SkillDataLocale;
  datasetName: string;
  description: string;
  intendedRuntime: SkillDatasetRuntime;
  globalPolicy: Record<string, unknown>;
  sourceBasis?: unknown[];
  skillCount: number;
  categories: string[];
  skills: SkillCatalogEntry[];
}

export interface SkillCandidate {
  skill: SkillCatalogEntry;
  score: number;
}

export type SkillInvocationMode = "manual" | "auto";

export interface SelectedSkill {
  skill: SkillCatalogEntry;
  mode: SkillInvocationMode;
}

export interface AppliedSkill {
  skill: TextSkill;
  mode: SkillInvocationMode;
}

export interface AppliedSkillInvocation {
  id: string;
  title: string;
  category: string;
  mode: SkillInvocationMode;
}

export interface SkillSelectionResult {
  selectedSkillIds: string[];
  reason?: string;
}
