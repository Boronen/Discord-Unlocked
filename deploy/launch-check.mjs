import { readFile } from "node:fs/promises";
const file = process.argv[2] ?? "/run/secrets/readiness.json";
const value = JSON.parse(await readFile(file, "utf8"));
const checks = [
  "tokenRotated",
  "legacyPlaintextRemoved",
  "accountsMfa",
  "operatorMonitoringConfigured",
  "operatorContactPublished",
  "offsiteBackupVerified",
  "currentJournalReplicated",
  "restoreDrillPassed",
  "diskQuotasVerified",
  "workerIsolationVerified",
  "twoAccountWindowsTestPassed",
  "loadTestPassed",
  "freeTierOnly",
  "githubProtectionsVerified",
];
const missing = checks.filter((key) => value[key] !== true);
if (!value.operatorContact || !/^(mailto:|https:\/\/)/.test(value.operatorContact))
  missing.push("operatorContact");
if (![5, 20, 50].includes(value.betaStage)) missing.push("betaStage");
if (
  !value.verifiedAt ||
  !Number.isFinite(Date.parse(value.verifiedAt)) ||
  Date.now() - Date.parse(value.verifiedAt) > 7 * 86400000 ||
  Date.parse(value.verifiedAt) > Date.now() + 300_000
)
  missing.push("recent verification (7 days)");
if (missing.length) {
  console.error("Public launch blocked. Missing verified gates: " + missing.join(", "));
  process.exit(1);
}
console.log(`Verified launch gates for a ${value.betaStage}-person stage. No paid resources are authorized.`);
