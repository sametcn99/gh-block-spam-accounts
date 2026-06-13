import type { AuthenticatedGitHubUser, GitHubProfile, RateLimitInfo } from "./github";
import type { AppLogEntry } from "./logging";
import type { DetectionSensitivity, SpamDetection } from "./spam";

export type TaskStatus = "idle" | "running" | "completed" | "error";

export type AnalysisProgress = {
  followersCount: number;
  followingCount: number;
  blockedCount: number;
  candidateCount: number;
  processedProfiles: number;
  totalProfiles: number;
};

export type BlockProgress = {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
};

export type BlockOutcome = {
  login: string;
  success: boolean;
  errorMessage: string | null;
};

export type SpamBlockerState = {
  token: string;
  connectionStatus: TaskStatus;
  authenticatedUser: AuthenticatedGitHubUser | null;
  oauthScopes: string | null;
  scopeWarning: string | null;
  canReadBlockedUsers: boolean;
  blockedUserLogins: string[];
  blockedUserProfiles: Record<string, GitHubProfile>;
  selectedBlockedUserLogins: string[];
  detectionSensitivity: DetectionSensitivity;
  customKeywords: string[];
  detections: SpamDetection[];
  selectedLogins: string[];
  analysisStatus: TaskStatus;
  analysisProgress: AnalysisProgress;
  blockStatus: TaskStatus;
  blockDelayMs: number;
  blockProgress: BlockProgress;
  blockOutcomes: BlockOutcome[];
  unblockStatus: TaskStatus;
  unblockProgress: BlockProgress;
  unblockOutcomes: BlockOutcome[];
  rateLimit: RateLimitInfo | null;
  logs: AppLogEntry[];
  lastError: string | null;
};
