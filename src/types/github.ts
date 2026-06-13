export type GitHubAccount = {
  login: string;
};

export type GitHubProfile = {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  websiteUrl: string | null;
  twitterUsername: string | null;
  followers: number;
  following: number;
  publicRepos: number;
};

export type AuthenticatedGitHubUser = {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
};

export type RateLimitInfo = {
  limit: number;
  remaining: number;
  resetAtIso: string;
};

export type GitHubTokenDiagnostics = {
  oauthScopes: string | null;
  scopeWarning: string | null;
};
