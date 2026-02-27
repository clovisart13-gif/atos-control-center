export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// Atos Control Center — Constantes compartilhadas

export const ASSETS = {
  logo: "https://d2xsxph8kpxj0f.cloudfront.net/310519663223964056/bhtqDJFFjSGsprAUaorMVq/atos-logo-HR6Thj6bnGKAWQLVonNuBs.webp",
  logoFull: "https://d2xsxph8kpxj0f.cloudfront.net/310519663223964056/bhtqDJFFjSGsprAUaorMVq/atos-logo-HPt6rtrQXKaVutKyQBpiHH.png",
  welcomeBg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663223964056/bhtqDJFFjSGsprAUaorMVq/atos-welcome-bg-buVsbY6tHjvZEVTpdxY7eo.webp",
  emptyState: "https://d2xsxph8kpxj0f.cloudfront.net/310519663223964056/bhtqDJFFjSGsprAUaorMVq/atos-empty-state-hxb3mJX88MDwnXhQXXLoSK.webp",
} as const;

export const APP_CONFIG = {
  name: "Atos Control Center",
  userId: "clovis_admin",
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedImageTypes: ["image/jpeg", "image/png"],
  allowedPdfTypes: ["application/pdf"],
  localStorageKey: "atos-chat-history",
} as const;
