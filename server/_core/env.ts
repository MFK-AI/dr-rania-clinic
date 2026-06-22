export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Google Sheets & Calendar
  // Stored as a single base64-encoded JSON blob to avoid all special-character
  // and line-ending issues with the PEM private key in environment variables.
  // Set GOOGLE_SERVICE_ACCOUNT_B64 in Railway (base64 of the full service account JSON).
  googleServiceAccountB64: process.env.GOOGLE_SERVICE_ACCOUNT_B64 ?? "",
  // Legacy separate fields (kept for backwards compatibility)
  googleClientEmail: process.env.GOOGLE_CLIENT_EMAIL ?? "",
  googlePrivateKey: (() => {
    let key = process.env.GOOGLE_PRIVATE_KEY ?? "";
    key = key.replace(/^["']+|["']+$/g, "");
    key = key.replace(/\\n/g, "\n");
    key = key.replace(/\r\n/g, "\n");
    return key.trim();
  })(),
  googleSheetId: process.env.GOOGLE_SHEET_ID ?? "1V9fsOxQwxNXmUn5PrjQhUGKaO48whZYVTIM2cp4ljOo",
};
