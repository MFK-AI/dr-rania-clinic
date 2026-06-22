export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Google Sheets & Calendar (replaces gws CLI that isn't available on Railway)
  googleClientEmail: process.env.GOOGLE_CLIENT_EMAIL ?? "",
  googlePrivateKey: (() => {
    let key = process.env.GOOGLE_PRIVATE_KEY ?? "";
    // Strip surrounding quotes accidentally included when copying from JSON
    key = key.replace(/^["']+|["']+$/g, "");
    // Convert literal \n (backslash+n) to actual newlines (standard JSON format)
    key = key.replace(/\\n/g, "\n");
    // Normalize Windows line endings
    key = key.replace(/\r\n/g, "\n");
    return key.trim();
  })(),
  googleSheetId: process.env.GOOGLE_SHEET_ID ?? "1V9fsOxQwxNXmUn5PrjQhUGKaO48whZYVTIM2cp4ljOo",
};
