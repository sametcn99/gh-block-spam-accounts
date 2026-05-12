import { Layout, Space } from "antd";
import type { CSSProperties } from "react";
import { AnalysisProgressCard } from "./components/AnalysisProgressCard";
import { AuthStatusCard } from "./components/AuthStatusCard";
import { BlockedUsersCard } from "./components/BlockedUsersCard";
import { BlockingCard } from "./components/BlockingCard";
import { ContributionCard } from "./components/ContributionCard";
import { CustomKeywordsCard } from "./components/CustomKeywordsCard";
import { DetectionsCard } from "./components/DetectionsCard";
import { GitHubActionGuideCard } from "./components/GitHubActionGuideCard";
import { InsightCards } from "./components/InsightCards";
import { PageHeaderCard } from "./components/PageHeaderCard";
import { RateLimitCard } from "./components/RateLimitCard";
import { RuntimeLogsCard } from "./components/RuntimeLogsCard";
import { StickyStatusBar } from "./components/StickyStatusBar";
import { TokenCard } from "./components/TokenCard";

const contentStyle: CSSProperties = {
  maxWidth: 960,
  width: "100%",
  margin: "0 auto",
  padding: "24px 20px 40px",
};

export function SpamBlockerPage() {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      <Layout.Content
        id="main-content"
        role="main"
        aria-label="Spam blocker workspace"
        style={contentStyle}
      >
        <PageHeaderCard />
        <GitHubActionGuideCard />
        <StickyStatusBar />

        <Space direction="vertical" size="large" style={{ width: "100%", marginTop: 20 }}>
          <div className="card-enter" style={{ "--card-index": 0 } as CSSProperties}>
            <TokenCard />
          </div>

          <div className="card-enter" style={{ "--card-index": 1 } as CSSProperties}>
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <AuthStatusCard />
              <CustomKeywordsCard />
            </Space>
          </div>

          <div className="card-enter" style={{ "--card-index": 2 } as CSSProperties}>
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <AnalysisProgressCard />
              <RateLimitCard />
            </Space>
          </div>

          <div className="card-enter" style={{ "--card-index": 3 } as CSSProperties}>
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <InsightCards />
              <DetectionsCard />
              <BlockingCard />
            </Space>
          </div>

          <div className="card-enter" style={{ "--card-index": 4 } as CSSProperties}>
            <BlockedUsersCard />
          </div>

          <ContributionCard />
          <RuntimeLogsCard />
        </Space>
      </Layout.Content>
    </Layout>
  );
}
