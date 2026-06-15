import { HappyProvider } from "@ant-design/happy-work-theme";
import { App as AntdApp, ConfigProvider } from "antd";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/dm-sans";
import "./index.css";
import { softAuroraTheme } from "./theme/softAuroraTheme";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <ConfigProvider theme={softAuroraTheme}>
      <HappyProvider>
        <AntdApp>
          <App />
          <Analytics />
          <SpeedInsights />
        </AntdApp>
      </HappyProvider>
    </ConfigProvider>
  </StrictMode>,
);
