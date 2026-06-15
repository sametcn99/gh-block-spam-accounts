# GitHub Spam Account Blocker

A browser-only React application that helps you detect suspicious GitHub accounts in your followers/following graph, review detection reasons, and block or unblock accounts in a controlled queue.

The app runs completely on the client side. Your token is used at runtime in the current tab and is never persisted to local storage, session storage, cookies, or URL parameters.

## Table of Contents

- [Overview](#overview)
- [GitHub Action](#github-action)
- [Core Features](#core-features)
- [How the Workflow Works](#how-the-workflow-works)
- [Detection Engine](#detection-engine)
- [Security Model](#security-model)
- [Getting Started](#getting-started)
- [Available Scripts](#available-scripts)
- [Token and Permission Notes](#token-and-permission-notes)
- [Operational Notes and Limitations](#operational-notes-and-limitations)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Overview

This application is designed for users who want a safer and more transparent way to moderate their GitHub social graph.

The repository now also includes a reusable GitHub Action entrypoint for teams that want scheduled or manually triggered spam detection and optional blocking without using the web UI.

Instead of blindly auto-blocking, the app provides a review-first flow:

1. Analyze followers and following accounts.
2. Detect suspicious profiles with explainable reasons.
3. Manually review and select accounts.
4. Execute block/unblock operations with progress tracking and logs.

The interface is built with Ant Design and Zustand state management, and it includes a detection sensitivity system (Aggressive, Balanced, Conservative) to tune strictness.

## GitHub Action

The root of this repository exposes a JavaScript GitHub Action so other repositories can call the blocking workflow directly.

Consumers do not need to clone this repository. They can reference it directly from any workflow with `uses: sametcn99/gh-block-spam-accounts@ref`.

### Action Inputs

- `github-token` - required personal access token used for analysis and optional blocking
- `detection-sensitivity` - `aggressive`, `balanced`, or `conservative` (default: `balanced`)
- `custom-keywords` - comma or newline separated extra keywords
- `target-type` - `followers`, `following`, or `both` (default: `both`)
- `exclude-users` - comma or newline separated logins to skip
- `apply-blocks` - `true` to execute blocks, `false` for dry-run (default: `false`)
- `delay-ms` - delay between block requests in milliseconds (default: `750`)

### Action Outputs

- `authenticated-login`
- `candidate-count`
- `detected-count`
- `detected-logins`
- `blocked-count`
- `blocked-logins`
- `failed-count`
- `failed-logins`
- `can-read-blocked-users`
- `rate-limit-remaining`
- `rate-limit-reset-at`

### Example Workflow

```yaml
name: Detect GitHub spam accounts

on:
  workflow_dispatch:
    inputs:
      apply-blocks:
        description: "Execute real block operations"
        required: false
        type: boolean
        default: false
      detection-sensitivity:
        description: "Detection sensitivity"
        required: false
        type: choice
        default: balanced
        options:
          - aggressive
          - balanced
          - conservative
      target-type:
        description: "Which social graph to scan"
        required: false
        type: choice
        default: both
        options:
          - followers
          - following
          - both
  schedule:
    - cron: "0 6 * * *"

permissions:
  contents: read

jobs:
  spam-blocker:
    runs-on: ubuntu-latest
    steps:
      - name: Run spam blocker
        uses: sametcn99/gh-block-spam-accounts@main
        with:
          github-token: ${{ secrets.SPAM_BLOCKER_TOKEN }}
          detection-sensitivity: ${{ github.event_name == 'workflow_dispatch' && inputs['detection-sensitivity'] || 'balanced' }}
          target-type: ${{ github.event_name == 'workflow_dispatch' && inputs['target-type'] || 'both' }}
          apply-blocks: ${{ github.event_name == 'workflow_dispatch' && inputs['apply-blocks'] || false }}
```

A ready-to-copy remote usage example also exists in `examples/spam-blocker-remote.yml`.

The repository also includes `.github/workflows/spam-blocker-example.yml` as a local self-test workflow for this repo. For real blocking, replace `${{ github.token }}` with a PAT secret such as `${{ secrets.SPAM_BLOCKER_TOKEN }}`.

For external consumption, prefer a release tag such as `@v1` instead of `@main`.

### Token Notes

The repository `GITHUB_TOKEN` is usually not enough to block users. Use either:

- a classic PAT with `user` scope
- a fine-grained PAT with `Block another user: write`

## Core Features

- Browser-only execution
- GitHub Action dry-run mode for scheduled analysis
- Optional GitHub Action blocking mode for reviewed automation
- Runtime-only token handling (no persistence)
- Follower + following analysis
- Blocked-user list fetch (when token permissions allow)
- Spam detection with:
  - weighted rule scoring
  - strong-signal overrides
  - heuristic signals
  - basic obfuscation handling
  - sensitivity profiles
- Review table with per-account detection reasons
- Bulk select/clear for detections
- Controlled block queue with configurable delay
- Block outcomes (success/failure) per account
- Blocked users management:
  - list current blocked accounts
  - single-account unblock
  - bulk unblock with selection
- Runtime logs with stage and level tags
- Contribution shortcuts for issue and PR flow

## How the Workflow Works

### 1) Authenticate and Analyze

- Paste your GitHub token.
- Run analysis.
- The app fetches:
  - authenticated user info
  - followers
  - following
  - blocked users (if readable)
- Candidate accounts are generated by merging followers/following and removing:
  - your own login
  - duplicates
  - accounts already blocked (if block list can be read)

### 2) Profile Fetch and Detection

- Candidate logins are fetched in batches.
- Profile text fields are normalized.
- Detection rules and heuristics are evaluated.
- Matched signals are aggregated into a reason list for each profile.

### 3) Review and Selection

- Detected accounts are listed in a review table.
- Each row includes explainable reasons.
- You can select all, clear selection, or customize selection.

### 4) Blocking Queue

- Blocking runs account-by-account.
- Delay between requests is configurable.
- Progress and outcome counters are updated live.
- Errors are captured per account and shown in outcomes/logs.

### 5) Blocked Users and Unblocking

- If readable, blocked users are listed in a dedicated table.
- You can unblock one account or multiple selected accounts.
- Unblock operations use the same queued execution style with progress and outcomes.

## Detection Engine

The detection engine combines static rules and heuristic signals.

### Inputs

- login
- name
- bio
- company
- location
- website URL
- twitter username

### Rule Model

Each rule has:

- reason
- regular expression
- optional weight
- optional strong-signal flag

### Signal Aggregation

- Matched rules become signals.
- Duplicate reasons are merged (highest weight kept).
- Signals contribute to total score.

### Additional Heuristics

The engine includes checks such as:

- dense call-to-action token chains
- obfuscated call-to-action terms
- multiple handle references suggesting alternate/main account patterns
- bios that redirect to another handle, especially on sparse profiles
- high call-to-action density
- short-link profiles combined with call-to-action behavior
- noisy login/text patterns

### Sensitivity Profiles

- Aggressive: lower threshold, catches more profiles
- Balanced: default tradeoff
- Conservative: higher threshold, fewer false positives

## Security Model

This app intentionally keeps all sensitive behavior client-side and ephemeral.

- Token is stored only in in-memory state
- Token is not persisted to:
  - localStorage
  - sessionStorage
  - cookies
  - URL/query params
- No backend server is used for token processing
- API calls are made directly from the browser to GitHub

Important: because this is a browser-only app, you should run it in an environment you trust.

## Getting Started

### Prerequisites

- Bun (recommended) or Node.js + a compatible package manager
- A GitHub Personal Access Token

### Install

```bash
bun install
```

### Run in Development

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Preview Production Build

```bash
bun run preview
```

## Available Scripts

- `bun run dev` - Start Vite dev server
- `bun run build` - Type-check and build production bundle
- `bun run preview` - Preview production build
- `bun run format` - Format code using Biome
- `bun run lint` - Lint code using Biome
- `bun run check` - Run Biome check (lint + formatting diagnostics)
- `bun run lint:eslint` - Run legacy ESLint config

## Token and Permission Notes

For best results with block/unblock functionality:

- Classic PAT: include `user` scope
- Fine-grained PAT: include permission equivalent to blocking another user (write)

Behavior when permissions are limited:

- Analysis may still work
- Block/unblock may fail for specific operations
- Reading blocked-user list can be unavailable

The app surfaces these states through warnings and runtime logs.

## Operational Notes and Limitations

- Detection is heuristic and rule-based, not ML-backed
- False positives and false negatives are possible
- You should review detections before blocking
- GitHub API limits and permissions can affect throughput
- Blocking/unblocking is executed sequentially by design for safer control and clearer outcomes

## Troubleshooting

### No detections found

- Try `Aggressive` sensitivity
- Add temporary session keywords
- Verify analysis completed and profile fetch was successful

### Cannot read blocked users

- Token might not have required read capability
- The app will continue analysis without blocked-list dedup optimization

### Block/Unblock failed

- Verify token scope/permissions
- Check runtime logs for per-account error details
- Increase delay to reduce burst pressure

### Unexpected API errors

- Check GitHub rate limits in the UI
- Retry after reset time if remaining limit is low

## Contributing

Contributions are welcome, especially for improving detection quality.

Suggested contribution areas:

- new keyword/pattern rules
- better heuristics for edge cases
- UX improvements in review and moderation flow
- reliability and diagnostics

You can use the in-app contribution shortcuts or open issues/PRs directly in the repository.

Repository: <https://github.com/sametcn99/gh-block-spam-accounts>
