export interface AppBuildInfo {
  version: string;
  schemaVersion: number;
  gitCommit: string;
  backendRevision: string;
  builtAt: string;
  apiUrl: string;
  environment: string;
}

export const BUILD_INFO: AppBuildInfo = {
  version: "1.0.0",
  schemaVersion: 8,
  gitCommit: "bdab337",
  backendRevision: "pos-wms-backend-00023-jq8",
  builtAt: "2026-09-26T00:30:00Z",
  apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://pos-wms-backend-931047234757.asia-southeast1.run.app/api",
  environment: "Production"
};
