import { create } from "zustand";
import { buildCandidateLogins } from "../domain/shared/buildCandidateLogins";
import { createLogEntry } from "../domain/shared/createLogEntry";
import { extractRateLimitInfo } from "../domain/shared/extractRateLimitInfo";
import { getErrorStatus } from "../domain/shared/getErrorStatus";
import { getScopeWarning } from "../domain/shared/getScopeWarning";
import { sleep } from "../domain/shared/sleep";
import { detectSpamProfiles } from "../domain/spam/detectSpamProfiles";
import { blockUserByLogin } from "../services/github/blockUserByLogin";
import { createGitHubClient } from "../services/github/createGitHubClient";
import { fetchAuthenticatedUser } from "../services/github/fetchAuthenticatedUser";
import { fetchBlockedLogins } from "../services/github/fetchBlockedLogins";
import { fetchFollowers } from "../services/github/fetchFollowers";
import { fetchFollowing } from "../services/github/fetchFollowing";
import { fetchProfiles } from "../services/github/fetchProfiles";
import { unblockUserByLogin } from "../services/github/unblockUserByLogin";
import type { LogLevel, LogStage } from "../types/logging";
import type { DetectionSensitivity } from "../types/spam";
import type {
  AnalysisProgress,
  BlockOutcome,
  BlockProgress,
  SpamBlockerState,
} from "../types/workflow";

const DEFAULT_DELAY_MS = 750;

const emptyAnalysisProgress: AnalysisProgress = {
  followersCount: 0,
  followingCount: 0,
  blockedCount: 0,
  candidateCount: 0,
  processedProfiles: 0,
  totalProfiles: 0,
};

const emptyBlockProgress: BlockProgress = {
  total: 0,
  completed: 0,
  succeeded: 0,
  failed: 0,
};

const baseState: SpamBlockerState = {
  token: "",
  connectionStatus: "idle",
  authenticatedUser: null,
  oauthScopes: null,
  scopeWarning: null,
  canReadBlockedUsers: true,
  blockedUserLogins: [],
  selectedBlockedUserLogins: [],
  detectionSensitivity: "balanced",
  customKeywords: [],
  detections: [],
  selectedLogins: [],
  analysisStatus: "idle",
  analysisProgress: emptyAnalysisProgress,
  blockStatus: "idle",
  blockDelayMs: DEFAULT_DELAY_MS,
  blockProgress: emptyBlockProgress,
  blockOutcomes: [],
  unblockStatus: "idle",
  unblockProgress: emptyBlockProgress,
  unblockOutcomes: [],
  rateLimit: null,
  logs: [],
  lastError: null,
};

type SpamBlockerActions = {
  setToken: (token: string) => void;
  setDetectionSensitivity: (sensitivity: DetectionSensitivity) => void;
  setBlockDelayMs: (delayMs: number | null) => void;
  addCustomKeyword: (keyword: string) => void;
  removeCustomKeyword: (keyword: string) => void;
  setSelectedLogins: (logins: string[]) => void;
  setSelectedBlockedUserLogins: (logins: string[]) => void;
  selectAllDetections: () => void;
  selectAllBlockedUsers: () => void;
  resetSession: () => void;
  connectAccount: () => Promise<void>;
  analyzeAccounts: () => Promise<void>;
  blockSelectedAccounts: () => Promise<void>;
  unblockSelectedAccounts: () => Promise<void>;
  unblockSingleAccount: (login: string) => Promise<void>;
};

export type SpamBlockerStore = SpamBlockerState & SpamBlockerActions;

function appendLog(
  set: (
    partial: Partial<SpamBlockerStore> | ((state: SpamBlockerStore) => Partial<SpamBlockerStore>),
  ) => void,
  level: LogLevel,
  stage: LogStage,
  message: string,
  details?: string,
): void {
  const entry = createLogEntry(level, stage, message, details);

  set((state) => ({
    logs: [...state.logs, entry],
  }));
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error.";
}

function createBlockPermissionMessage(login: string): string {
  return `The token could not block @${login}. Blocking users requires a classic PAT with the user scope or a fine-grained token with Block another user: write.`;
}

function createUnblockPermissionMessage(login: string): string {
  return `The token could not unblock @${login}. Unblocking users requires a classic PAT with the user scope or a fine-grained token with Block another user: write.`;
}

function appendOutcome(existingOutcomes: BlockOutcome[], outcome: BlockOutcome): BlockOutcome[] {
  return [...existingOutcomes, outcome];
}

function appendUniqueLogin(existingLogins: string[], login: string): string[] {
  return existingLogins.includes(login) ? existingLogins : [...existingLogins, login];
}

export const useSpamBlockerStore = create<SpamBlockerStore>((set, get) => ({
  ...baseState,
  setToken: (token) => {
    set({ token, lastError: null });
  },
  setDetectionSensitivity: (sensitivity) => {
    set({ detectionSensitivity: sensitivity });
    appendLog(set, "info", "analysis", `Detection profile changed to ${sensitivity}.`);
  },
  setBlockDelayMs: (delayMs) => {
    const safeDelay =
      Number.isFinite(delayMs) && delayMs !== null
        ? Math.max(0, Math.floor(delayMs))
        : DEFAULT_DELAY_MS;

    set({ blockDelayMs: safeDelay });
  },
  addCustomKeyword: (keyword) => {
    const cleanedKeyword = keyword.trim();

    if (!cleanedKeyword) {
      return;
    }

    const existingKeywords = get().customKeywords;

    if (
      existingKeywords.some(
        (existingKeyword) => existingKeyword.toLowerCase() === cleanedKeyword.toLowerCase(),
      )
    ) {
      appendLog(
        set,
        "warning",
        "analysis",
        `Keyword already exists in this session: ${cleanedKeyword}`,
      );
      return;
    }

    set({
      customKeywords: [...existingKeywords, cleanedKeyword],
    });

    appendLog(set, "info", "analysis", `Added session keyword: ${cleanedKeyword}`);
  },
  removeCustomKeyword: (keyword) => {
    set((state) => ({
      customKeywords: state.customKeywords.filter((currentKeyword) => currentKeyword !== keyword),
    }));

    appendLog(set, "info", "analysis", `Removed session keyword: ${keyword}`);
  },
  setSelectedLogins: (logins) => {
    set({ selectedLogins: logins });
    appendLog(set, "info", "selection", `Updated selection to ${logins.length} account(s).`);
  },
  setSelectedBlockedUserLogins: (logins) => {
    set({ selectedBlockedUserLogins: logins });
    appendLog(
      set,
      "info",
      "selection",
      `Updated unblock selection to ${logins.length} account(s).`,
    );
  },
  selectAllDetections: () => {
    const allLogins = get().detections.map((detection) => detection.profile.login);
    set({ selectedLogins: allLogins });
    appendLog(set, "info", "selection", `Selected all detected accounts (${allLogins.length}).`);
  },
  selectAllBlockedUsers: () => {
    const allLogins = get().blockedUserLogins;
    set({ selectedBlockedUserLogins: allLogins });
    appendLog(set, "info", "selection", `Selected all blocked accounts (${allLogins.length}).`);
  },
  resetSession: () => {
    set({
      ...baseState,
      logs: [],
    });

    appendLog(set, "info", "system", "Session state cleared.");
  },
  connectAccount: async () => {
    const token = get().token.trim();

    if (!token) {
      set({
        lastError: "Token is required to connect.",
        connectionStatus: "error",
      });
      appendLog(set, "error", "auth", "Token is missing. Paste a token and retry.");
      return;
    }

    set({
      connectionStatus: "running",
      lastError: null,
    });

    appendLog(set, "info", "auth", "Connecting to GitHub...");

    try {
      const octokit = createGitHubClient(token);
      const authResponse = await fetchAuthenticatedUser(octokit);
      const scopeWarning = getScopeWarning(authResponse.oauthScopes);
      const rateLimitInfo = extractRateLimitInfo(authResponse.headers);

      try {
        await octokit.rest.users.listFollowersForAuthenticatedUser({ per_page: 1 });
      } catch (permError) {
        const permStatus = getErrorStatus(permError);

        if (permStatus === 403) {
          const permissionError =
            "This token does not have the required permissions. Please create a new token with the user scope (classic PAT) or the Followers & Block another user permissions (fine-grained PAT) and try again.";

          set({
            connectionStatus: "error",
            lastError: permissionError,
          });

          appendLog(set, "error", "auth", "Missing required permissions.", permissionError);
          return;
        }
      }

      set({
        connectionStatus: "completed",
        authenticatedUser: authResponse.user,
        oauthScopes: authResponse.oauthScopes,
        scopeWarning,
        rateLimit: rateLimitInfo,
      });

      appendLog(set, "success", "auth", `Connected as @${authResponse.user.login}.`);

      if (scopeWarning) {
        appendLog(set, "warning", "auth", scopeWarning);
      }
    } catch (error) {
      const status = getErrorStatus(error);
      const message = status ? `${toMessage(error)} (status ${status})` : toMessage(error);

      set({
        connectionStatus: "error",
        lastError: message,
      });

      appendLog(set, "error", "auth", "Connection failed.", message);
    }
  },
  analyzeAccounts: async () => {
    const token = get().token.trim();
    const authenticatedUser = get().authenticatedUser;

    if (!token || !authenticatedUser) {
      set({
        lastError: "Connect your account before analyzing.",
        analysisStatus: "error",
      });
      appendLog(set, "error", "analysis", "Not connected. Click Connect first.");
      return;
    }

    set({
      analysisStatus: "running",
      blockStatus: "idle",
      blockOutcomes: [],
      blockProgress: emptyBlockProgress,
      unblockStatus: "idle",
      unblockOutcomes: [],
      unblockProgress: emptyBlockProgress,
      detections: [],
      selectedLogins: [],
      blockedUserLogins: [],
      selectedBlockedUserLogins: [],
      lastError: null,
      analysisProgress: emptyAnalysisProgress,
    });

    appendLog(set, "info", "analysis", "Starting spam analysis.");

    try {
      const octokit = createGitHubClient(token);

      const [followers, following, blockedResult] = await Promise.all([
        fetchFollowers(octokit),
        fetchFollowing(octokit),
        fetchBlockedLogins(octokit),
      ]);

      const followerLogins = followers.map((account) => account.login);
      const followingLogins = following.map((account) => account.login);
      const candidateLogins = buildCandidateLogins([...followerLogins, ...followingLogins], {
        blockedLogins: blockedResult.blockedLogins,
        authenticatedLogin: authenticatedUser.login,
      });

      set({
        canReadBlockedUsers: blockedResult.canReadBlockList,
        blockedUserLogins: blockedResult.blockedUserLogins,
        selectedBlockedUserLogins: [],
        analysisProgress: {
          followersCount: followers.length,
          followingCount: following.length,
          blockedCount: blockedResult.blockedLogins.size,
          candidateCount: candidateLogins.length,
          processedProfiles: 0,
          totalProfiles: candidateLogins.length,
        },
      });

      appendLog(
        set,
        "info",
        "fetch",
        `Fetched ${followers.length} follower(s), ${following.length} following account(s), ${blockedResult.blockedLogins.size} blocked account(s), and ${candidateLogins.length} candidate account(s).`,
      );

      if (!blockedResult.canReadBlockList) {
        appendLog(
          set,
          "warning",
          "fetch",
          "Could not read current blocked users for deduplication. Analysis continues without this optimization.",
        );
      }

      if (candidateLogins.length === 0) {
        set({ analysisStatus: "completed" });
        appendLog(set, "info", "analysis", "No candidate accounts available for spam analysis.");
        return;
      }

      const profiles = await fetchProfiles(octokit, candidateLogins, {
        onProfileProcessed: (processedCount, totalProfiles) => {
          set((state) => ({
            analysisProgress: {
              ...state.analysisProgress,
              processedProfiles: processedCount,
              totalProfiles,
            },
          }));
        },
      });

      appendLog(set, "info", "fetch", `Fetched ${profiles.length} profile(s) successfully.`);

      const detections = detectSpamProfiles(
        profiles,
        get().customKeywords,
        get().detectionSensitivity,
      );
      const selectedLogins = detections.map((detection) => detection.profile.login);

      set((state) => ({
        detections,
        selectedLogins,
        analysisStatus: "completed",
        analysisProgress: {
          ...state.analysisProgress,
          processedProfiles: state.analysisProgress.totalProfiles,
        },
      }));

      appendLog(
        set,
        "success",
        "analysis",
        `Detected ${detections.length} spam account(s) with ${get().detectionSensitivity} sensitivity.`,
      );

      if (detections.length > 0) {
        appendLog(
          set,
          "info",
          "selection",
          `All detected accounts are selected by default (${selectedLogins.length}).`,
        );
      }
    } catch (error) {
      const status = getErrorStatus(error);
      const message = status ? `${toMessage(error)} (status ${status})` : toMessage(error);

      set({
        analysisStatus: "error",
        lastError: message,
      });

      appendLog(set, "error", "analysis", "Analysis failed.", message);
    }
  },
  blockSelectedAccounts: async () => {
    const token = get().token.trim();
    const selectedLogins = get().selectedLogins;

    if (!token) {
      set({
        blockStatus: "error",
        lastError: "Token is required to block accounts.",
      });
      appendLog(set, "error", "block", "Token is missing. Paste a token and retry.");
      return;
    }

    if (selectedLogins.length === 0) {
      set({
        blockStatus: "error",
        lastError: "Select at least one account before blocking.",
      });
      appendLog(set, "warning", "block", "No accounts are selected for blocking.");
      return;
    }

    if (get().unblockStatus === "running") {
      set({
        blockStatus: "error",
        lastError: "Wait until unblocking is finished before starting blocking.",
      });
      appendLog(set, "warning", "block", "Blocking cannot start while unblocking is running.");
      return;
    }

    set({
      blockStatus: "running",
      blockProgress: {
        total: selectedLogins.length,
        completed: 0,
        succeeded: 0,
        failed: 0,
      },
      blockOutcomes: [],
      lastError: null,
    });

    appendLog(
      set,
      "info",
      "block",
      `Starting block queue for ${selectedLogins.length} account(s).`,
    );

    try {
      const octokit = createGitHubClient(token);
      const delayMs = get().blockDelayMs;

      for (const login of selectedLogins) {
        try {
          await blockUserByLogin(octokit, login);

          set((state) => ({
            blockOutcomes: appendOutcome(state.blockOutcomes, {
              login,
              success: true,
              errorMessage: null,
            }),
            blockedUserLogins: appendUniqueLogin(state.blockedUserLogins, login),
            blockProgress: {
              ...state.blockProgress,
              completed: state.blockProgress.completed + 1,
              succeeded: state.blockProgress.succeeded + 1,
            },
          }));

          appendLog(set, "success", "block", `Blocked @${login}.`);
        } catch (error) {
          const status = getErrorStatus(error);
          const errorMessage =
            status === 403 || status === 404
              ? createBlockPermissionMessage(login)
              : toMessage(error);

          set((state) => ({
            blockOutcomes: appendOutcome(state.blockOutcomes, {
              login,
              success: false,
              errorMessage,
            }),
            blockProgress: {
              ...state.blockProgress,
              completed: state.blockProgress.completed + 1,
              failed: state.blockProgress.failed + 1,
            },
          }));

          appendLog(set, "error", "block", `Failed to block @${login}.`, errorMessage);
        }

        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }

      set({ blockStatus: "completed" });

      const { succeeded, failed } = get().blockProgress;
      appendLog(
        set,
        "success",
        "block",
        `Blocking completed: ${succeeded} succeeded, ${failed} failed.`,
      );
    } catch (error) {
      const message = toMessage(error);

      set({
        blockStatus: "error",
        lastError: message,
      });

      appendLog(set, "error", "block", "Blocking flow failed unexpectedly.", message);
    }
  },
  unblockSelectedAccounts: async () => {
    const token = get().token.trim();
    const selectedBlockedUserLogins = [...get().selectedBlockedUserLogins];

    if (!token) {
      set({
        unblockStatus: "error",
        lastError: "Token is required to unblock accounts.",
      });
      appendLog(set, "error", "unblock", "Token is missing. Paste a token and retry.");
      return;
    }

    if (selectedBlockedUserLogins.length === 0) {
      set({
        unblockStatus: "error",
        lastError: "Select at least one blocked account before unblocking.",
      });
      appendLog(set, "warning", "unblock", "No blocked accounts are selected for unblocking.");
      return;
    }

    if (get().blockStatus === "running") {
      set({
        unblockStatus: "error",
        lastError: "Wait until blocking is finished before starting unblocking.",
      });
      appendLog(set, "warning", "unblock", "Unblocking cannot start while blocking is running.");
      return;
    }

    set({
      unblockStatus: "running",
      unblockProgress: {
        total: selectedBlockedUserLogins.length,
        completed: 0,
        succeeded: 0,
        failed: 0,
      },
      unblockOutcomes: [],
      lastError: null,
    });

    appendLog(
      set,
      "info",
      "unblock",
      `Starting unblock queue for ${selectedBlockedUserLogins.length} account(s).`,
    );

    try {
      const octokit = createGitHubClient(token);
      const delayMs = get().blockDelayMs;

      for (const login of selectedBlockedUserLogins) {
        try {
          await unblockUserByLogin(octokit, login);

          set((state) => ({
            unblockOutcomes: appendOutcome(state.unblockOutcomes, {
              login,
              success: true,
              errorMessage: null,
            }),
            blockedUserLogins: state.blockedUserLogins.filter(
              (blockedLogin) => blockedLogin !== login,
            ),
            selectedBlockedUserLogins: state.selectedBlockedUserLogins.filter(
              (blockedLogin) => blockedLogin !== login,
            ),
            unblockProgress: {
              ...state.unblockProgress,
              completed: state.unblockProgress.completed + 1,
              succeeded: state.unblockProgress.succeeded + 1,
            },
          }));

          appendLog(set, "success", "unblock", `Unblocked @${login}.`);
        } catch (error) {
          const status = getErrorStatus(error);
          const errorMessage =
            status === 403 || status === 404
              ? createUnblockPermissionMessage(login)
              : toMessage(error);

          set((state) => ({
            unblockOutcomes: appendOutcome(state.unblockOutcomes, {
              login,
              success: false,
              errorMessage,
            }),
            unblockProgress: {
              ...state.unblockProgress,
              completed: state.unblockProgress.completed + 1,
              failed: state.unblockProgress.failed + 1,
            },
          }));

          appendLog(set, "error", "unblock", `Failed to unblock @${login}.`, errorMessage);
        }

        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }

      set({ unblockStatus: "completed" });

      const { succeeded, failed } = get().unblockProgress;
      appendLog(
        set,
        "success",
        "unblock",
        `Unblocking completed: ${succeeded} succeeded, ${failed} failed.`,
      );
    } catch (error) {
      const message = toMessage(error);

      set({
        unblockStatus: "error",
        lastError: message,
      });

      appendLog(set, "error", "unblock", "Unblocking flow failed unexpectedly.", message);
    }
  },
  unblockSingleAccount: async (login) => {
    set({ selectedBlockedUserLogins: [login] });
    appendLog(set, "info", "selection", `Prepared single-account unblock for @${login}.`);
    await get().unblockSelectedAccounts();
  },
}));
