import type { Octokit } from "octokit";
import { chunkArray } from "../../domain/shared/chunkArray";
import { getErrorStatus } from "../../domain/shared/getErrorStatus";
import type { GitHubProfile } from "../../types/github";

const PROFILE_CHUNK_SIZE = 20;

export type FetchProfilesOptions = {
  onProfileProcessed?: (processedCount: number, totalProfiles: number) => void;
};

export async function fetchProfiles(
  octokit: Octokit,
  logins: string[],
  options?: FetchProfilesOptions,
): Promise<GitHubProfile[]> {
  const profiles: GitHubProfile[] = [];
  let processedCount = 0;

  for (const loginChunk of chunkArray(logins, PROFILE_CHUNK_SIZE)) {
    const profileResults = await Promise.all(
      loginChunk.map(async (login) => {
        try {
          const { data } = await octokit.rest.users.getByUsername({
            username: login,
          });

          return {
            login: data.login,
            name: data.name,
            bio: data.bio,
            company: "company" in data ? data.company : null,
            location: data.location,
            websiteUrl: data.blog || null,
            twitterUsername: data.twitter_username ?? null,
            followers: data.followers ?? 0,
            following: data.following ?? 0,
            publicRepos: data.public_repos ?? 0,
          } satisfies GitHubProfile;
        } catch (error) {
          const status = getErrorStatus(error);

          if (status === 404) {
            return null;
          }

          throw error;
        } finally {
          processedCount += 1;
          options?.onProfileProcessed?.(processedCount, logins.length);
        }
      }),
    );

    for (const profile of profileResults) {
      if (profile) {
        profiles.push(profile);
      }
    }
  }

  return profiles;
}
