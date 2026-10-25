export type MemoryDriftState = "VALID" | "DRIFTED" | "UNVERIFIABLE_SHA";

export interface MemoryPinEntry {
  readonly id: string;
  readonly file: string;
  readonly line: number;
  readonly commitSha: string;
  readonly scopePattern: string;
  readonly claimText: string;
}

export interface MemoryEntryAuditResult {
  readonly entry: MemoryPinEntry;
  readonly state: MemoryDriftState;
  readonly driftedFiles: readonly string[];
}

export interface MemoryAuditReport {
  readonly totalEntries: number;
  readonly validCount: number;
  readonly driftedCount: number;
  readonly unverifiableCount: number;
  readonly results: readonly MemoryEntryAuditResult[];
}

export interface TaskNode {
  readonly id: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly touchedSeams: readonly string[];
}

export interface SeamConflict {
  readonly taskA: string;
  readonly taskB: string;
  readonly overlappingSeams: readonly [string, string];
}

export interface WaveScheduleResult {
  readonly waves: readonly (readonly string[])[];
  readonly serializedConflicts: readonly SeamConflict[];
  readonly maxParallelism: number;
}

export interface KvCacheSimulationInput {
  readonly systemAndSkillTokens: number;
  readonly codebaseContextTokens: number;
  readonly subtasksCount: number;
  readonly reviewFixRounds: number;
  readonly reviewersPerRound: number;
}

export interface KvCacheSimulationComparison {
  readonly coldFreshSubagentTotalTokens: number;
  readonly coldUncachedPrefixTokens: number;
  readonly warmReuseTotalTokens: number;
  readonly warmUncachedPrefixTokens: number;
  readonly warmCachedReadTokens: number;
  readonly uncachedTokenReductionRatio: number;
}

export interface PromptCacheKeyInput {
  readonly url: string;
  readonly prompt: string;
  readonly etag?: string;
  readonly lastModified?: string;
}

export interface ImmutableBlockSignature {
  readonly blockId: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly sha256: string;
  readonly rawContent: string;
}

export interface SignatureVerificationResult {
  readonly valid: boolean;
  readonly violatedBlocks: readonly string[];
  readonly missingBlocks: readonly string[];
}

export interface SkillMetadata {
  readonly name: string;
  readonly description: string;
  readonly disableModelInvocation: boolean;
  readonly folderName: string;
  readonly skillFilePath: string;
  readonly frontmatterBytes: number;
  readonly frontmatterTokensApprox: number;
  readonly totalBytes: number;
  readonly totalLines: number;
  readonly totalTokensApprox: number;
  readonly calledSkills: readonly string[];
  readonly externalRelativeLinks: readonly string[];
  readonly hasOpenAiYaml: boolean;
  readonly openAiAllowImplicit: boolean | undefined;
}

export interface SkillValidationIssue {
  readonly severity: "ERROR" | "WARNING";
  readonly tier: "TIER1_STRUCTURE" | "TIER2_BUDGET" | "TIER3_ROUTING";
  readonly skillName: string;
  readonly code: string;
  readonly message: string;
}

export interface RoutingEvalCase {
  readonly id: string;
  readonly prompt: string;
  readonly expectedSkill: string;
  readonly forbiddenSkills: readonly string[];
  readonly category: "natural" | "understated" | "adversarial";
}

export interface RoutingEvalCaseResult {
  readonly evalCase: RoutingEvalCase;
  readonly rankedSkills: readonly { readonly name: string; readonly score: number }[];
  readonly passed: boolean;
  readonly topSkill: string;
}

export interface CatalogValidationReport {
  readonly passed: boolean;
  readonly totalSkills: number;
  readonly modelInvokedCount: number;
  readonly userInvokedCount: number;
  readonly alwaysLoadedBytes: number;
  readonly alwaysLoadedTokensApprox: number;
  readonly tokenCeiling: number;
  readonly issues: readonly SkillValidationIssue[];
  readonly routingPassCount: number;
  readonly routingTotalCount: number;
  readonly routingResults: readonly RoutingEvalCaseResult[];
}

export interface RepoBenchmarkMetrics {
  readonly repoName: string;
  readonly markdownFileCount: number;
  readonly totalLines: number;
  readonly totalBytes: number;
  readonly totalTokensApprox: number;
  readonly skillCount: number;
  readonly modelInvokedCount: number;
  readonly userInvokedCount: number;
  readonly coldStartBytes: number;
  readonly coldStartTokensApprox: number;
  readonly simulatedFeatureUncachedTokens: number;
  readonly estimatedTurnStopsPerFeature: number;
  readonly brokenStandaloneSkillLinks: number;
  readonly harnessBuiltInCollisions: number;
  readonly unguardedRecursiveSubagentSkills: number;
}
