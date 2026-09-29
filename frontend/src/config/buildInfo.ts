import { API_BASE_URL } from "./apiConfig";

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
  gitCommit: "342284b",
  backendRevision: "pos-wms-backend-00024-x5f",
  builtAt: "2026-09-28T00:00:00Z",
  apiUrl: API_BASE_URL,
  environment: __DEV__ ? "Development" : "Production"
};
