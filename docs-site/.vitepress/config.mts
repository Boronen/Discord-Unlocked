import { fileURLToPath } from "node:url";
const base = process.env.DOCS_BASE ?? "/";
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))
  throw new Error("DOCS_BASE must be a slash-delimited site path.");

export default {
  title: "Profile Studio",
  description: "User and operator documentation for the self-hosted Windows Vencord userplugin.",
  lang: "en-US",
  base,
  srcExclude: ["backup-oauth-site/**"],
  cleanUrls: false,
  lastUpdated: false,
  srcDir: "../docs",
  vite: {
    resolve: {
      alias: [
        {
          find: "vue/server-renderer",
          replacement: fileURLToPath(
            new URL(
              "../node_modules/@vue/server-renderer/dist/server-renderer.esm-bundler.js",
              import.meta.url,
            ),
          ),
        },
        {
          find: /^vue$/,
          replacement: fileURLToPath(
            new URL("../node_modules/vue/dist/vue.runtime.esm-bundler.js", import.meta.url),
          ),
        },
      ],
    },
  },
  themeConfig: {
    search: { provider: "local" },
    nav: [
      { text: "Start", link: "/" },
      { text: "User guide", link: "/USER-GUIDE" },
      { text: "Operate", link: "/OPERATIONS" },
      { text: "API", link: "/API" },
    ],
    sidebar: [
      {
        text: "Use Profile Studio",
        items: [
          { text: "Install on Windows", link: "/INSTALL-WINDOWS" },
          { text: "Get started and troubleshoot", link: "/USER-GUIDE" },
          { text: "All editor features", link: "/STUDIO-WORKSPACE" },
          { text: "Privacy and your data", link: "/PRIVACY" },
        ],
      },
      {
        text: "Run a community",
        items: [
          { text: "Operations", link: "/OPERATIONS" },
          { text: "Configuration", link: "/CONFIGURATION" },
          { text: "Encrypted Drive backups", link: "/DRIVE-BACKUPS" },
          { text: "Discord alerts", link: "/DISCORD-ALERTS" },
          { text: "Acceptance and release", link: "/ACCEPTANCE" },
          { text: "Security policy", link: "/SECURITY" },
          { text: "Privacy review draft", link: "/PRIVACY-REVIEW-DRAFT" },
        ],
      },
      {
        text: "Develop and contribute",
        items: [
          { text: "Developer guide", link: "/DEVELOPMENT" },
          { text: "Architecture and data flow", link: "/ARCHITECTURE" },
          { text: "API overview", link: "/API" },
          { text: "Route contracts", link: "/API-REFERENCE" },
          { text: "Sources and licences", link: "/SOURCES-LICENSES" },
          { text: "Contributing and Supporter", link: "/CONTRIBUTING" },
          { text: "Development record", link: "/DEVELOPMENT-RECORD" },
        ],
      },
    ],
    footer: {
      message:
        "Self-hosted community userplugin. Native Discord acceptance and operator release checks still apply.",
    },
  },
};
