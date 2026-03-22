export const ACCOUNT_LITE_SESSION_COOKIE = "starmap_account_session";
export const ACCOUNT_LITE_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const ACCOUNT_LITE_MAGIC_LINK_TTL_SECONDS = 15 * 60;

export type AccountLiteAuthSession = {
  email: string;
  emailHash: string;
  createdAt: number;
};

export const accountLiteSessionKey = (token: string) => `account:session:${token}`;
export const accountLiteMagicKey = (token: string) => `account:magic:${token}`;
