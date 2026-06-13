import { ExclamationCircleOutlined, SearchOutlined } from "@ant-design/icons";
import type { TableColumnsType } from "antd";
import { Button, Card, Empty, Skeleton, Space, Table, Tag, Tooltip, Typography } from "antd";
import { useSpamBlockerStore } from "../../../stores/useSpamBlockerStore";
import type { DetectionSensitivity, SpamDetection } from "../../../types/spam";

function getSensitivityMeta(sensitivity: DetectionSensitivity): { label: string; color: string } {
  if (sensitivity === "aggressive") {
    return { label: "Aggressive", color: "volcano" };
  }

  if (sensitivity === "conservative") {
    return { label: "Conservative", color: "green" };
  }

  return { label: "Balanced", color: "blue" };
}

function SpamScore({ count }: { count: number }) {
  const level = count >= 4 ? "high" : count >= 2 ? "medium" : "low";
  const color = level === "high" ? "#ef4444" : level === "medium" ? "#f59e0b" : "#6b7280";
  return (
    <Tooltip title={`${count} detection reason${count !== 1 ? "s" : ""}`}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          color,
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        <ExclamationCircleOutlined /> {count}
      </span>
    </Tooltip>
  );
}

const columns: TableColumnsType<SpamDetection> = [
  {
    title: "Login",
    key: "login",
    width: 140,
    fixed: "left",
    render: (_, detection) => (
      <Typography.Link
        href={`https://github.com/${detection.profile.login}`}
        target="_blank"
        rel="noreferrer"
      >
        @{detection.profile.login}
      </Typography.Link>
    ),
  },
  {
    title: "Name",
    key: "name",
    width: 130,
    ellipsis: true,
    render: (_, detection) => detection.profile.name ?? "—",
  },
  {
    title: "Bio",
    key: "bio",
    width: 200,
    ellipsis: true,
    render: (_, detection) => {
      const bio = detection.profile.bio ?? "—";
      return (
        <Tooltip title={bio} placement="topLeft">
          <Typography.Text type="secondary" ellipsis>
            {bio}
          </Typography.Text>
        </Tooltip>
      );
    },
  },
  {
    title: "Company",
    key: "company",
    width: 130,
    ellipsis: true,
    render: (_, detection) => detection.profile.company ?? "—",
  },
  {
    title: "Location",
    key: "location",
    width: 130,
    ellipsis: true,
    render: (_, detection) => detection.profile.location ?? "—",
  },
  {
    title: "Website",
    key: "websiteUrl",
    width: 150,
    ellipsis: true,
    render: (_, detection) => {
      const url = detection.profile.websiteUrl;
      if (!url) return "—";
      return (
        <Typography.Link href={url} target="_blank" rel="noreferrer" ellipsis>
          {url}
        </Typography.Link>
      );
    },
  },
  {
    title: "Twitter",
    key: "twitterUsername",
    width: 120,
    render: (_, detection) => {
      const twitter = detection.profile.twitterUsername;
      if (!twitter) return "—";
      return (
        <Typography.Link href={`https://twitter.com/${twitter}`} target="_blank" rel="noreferrer">
          @{twitter}
        </Typography.Link>
      );
    },
  },
  {
    title: "Followers",
    key: "followers",
    width: 100,
    sorter: (a, b) => a.profile.followers - b.profile.followers,
    render: (_, detection) => detection.profile.followers.toLocaleString(),
  },
  {
    title: "Following",
    key: "following",
    width: 100,
    sorter: (a, b) => a.profile.following - b.profile.following,
    render: (_, detection) => detection.profile.following.toLocaleString(),
  },
  {
    title: "Score",
    key: "spamScore",
    width: 80,
    sorter: (a, b) => a.matchedReasons.length - b.matchedReasons.length,
    defaultSortOrder: "descend",
    render: (_, detection) => <SpamScore count={detection.matchedReasons.length} />,
  },
  {
    title: "Detection reasons",
    dataIndex: "matchedReasons",
    key: "matchedReasons",
    render: (matchedReasons: string[]) => (
      <Space wrap size={[6, 6]}>
        {matchedReasons.map((reason) => (
          <Tag key={reason} color="gold">
            {reason}
          </Tag>
        ))}
      </Space>
    ),
  },
];

export function DetectionsCard() {
  const detectionSensitivity = useSpamBlockerStore((state) => state.detectionSensitivity);
  const detections = useSpamBlockerStore((state) => state.detections);
  const selectedLogins = useSpamBlockerStore((state) => state.selectedLogins);
  const setSelectedLogins = useSpamBlockerStore((state) => state.setSelectedLogins);
  const selectAllDetections = useSpamBlockerStore((state) => state.selectAllDetections);
  const analysisStatus = useSpamBlockerStore((state) => state.analysisStatus);
  const sensitivityMeta = getSensitivityMeta(detectionSensitivity);

  const isAnalyzing = analysisStatus === "running" && detections.length === 0;

  return (
    <Card title="Detected Accounts">
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Space>
          <Tag color={sensitivityMeta.color}>{`Detection Profile: ${sensitivityMeta.label}`}</Tag>
          <Typography.Text strong>{`Detected: ${detections.length}`}</Typography.Text>
          <Typography.Text>{`Selected: ${selectedLogins.length}`}</Typography.Text>
          <Button onClick={() => selectAllDetections()} disabled={detections.length === 0}>
            Select All
          </Button>
          <Button onClick={() => setSelectedLogins([])} disabled={selectedLogins.length === 0}>
            Clear Selection
          </Button>
        </Space>
        {isAnalyzing ? (
          <Skeleton active paragraph={{ rows: 5 }} title={false} />
        ) : (
          <Table<SpamDetection>
            className="detection-table"
            rowKey={(detection) => detection.profile.login}
            columns={columns}
            dataSource={detections}
            scroll={{ x: 1550 }}
            locale={{
              emptyText: (
                <Empty
                  image={<SearchOutlined style={{ fontSize: 36, color: "#4b5563" }} />}
                  description="Run an analysis to detect spam accounts"
                />
              ),
            }}
            rowSelection={{
              selectedRowKeys: selectedLogins,
              onChange: (keys) => {
                setSelectedLogins(keys.map((key) => String(key)));
              },
            }}
            pagination={{ pageSize: 8 }}
          />
        )}
      </Space>
    </Card>
  );
}
