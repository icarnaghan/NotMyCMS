import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  CognitoUserPool,
  CognitoUser,
  CognitoUserSession,
  CognitoRefreshToken,
} from "amazon-cognito-identity-js";
import { AuthContext, type AuthContextValue, type AuthUser } from "./auth-context";
import { readUserFromIdToken } from "./user-display";
import { adminRedirectUri, cognitoDomain } from "../lib/site-config";

// Cognito pool and client ids are deployment outputs, so they stay in the build
// environment. The domain and redirect URI are derivable from site config, which is why
// they get config-derived fallbacks rather than hardcoded ones.
const COGNITO_USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID ?? "";
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID ?? "";
const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN ?? cognitoDomain();
const REDIRECT_URI = import.meta.env.VITE_COGNITO_REDIRECT_URI ?? adminRedirectUri();

if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) {
  throw new Error(
    "Missing Cognito configuration. Ensure VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID are set at build time."
  );
}

const userPool = new CognitoUserPool({
  UserPoolId: COGNITO_USER_POOL_ID,
  ClientId: COGNITO_CLIENT_ID,
});

/**
 * Generate a random string for PKCE code verifier
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generate code challenge from verifier using SHA-256
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Base64 URL encode a Uint8Array
 */
function base64UrlEncode(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// JWT decoding lives in ./user-display (decodeJwtPayload / readUserFromIdToken),
// which handles the base64url alphabet and missing padding that plain atob
// rejects, and additionally resolves a human-readable display name.

/**
 * Exchange authorization code for tokens using PKCE
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<{
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const tokenEndpoint = `${COGNITO_DOMAIN}/oauth2/token`;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: COGNITO_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code,
    code_verifier: codeVerifier,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = user !== null;

  /**
   * Redirect to Cognito hosted UI for login with PKCE
   */
  const login = useCallback(async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    // CSRF protection: a random state we validate on callback, so an attacker
    // can't force the browser to complete the flow with a code they control.
    const state = generateCodeVerifier();

    // Store code verifier + state for token exchange after redirect
    sessionStorage.setItem("pkce_code_verifier", codeVerifier);
    sessionStorage.setItem("oauth_state", state);

    const authUrl = new URL(`${COGNITO_DOMAIN}/oauth2/authorize`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", COGNITO_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("state", state);

    window.location.href = authUrl.toString();
  }, []);

  /**
   * Logout: revoke session and redirect to Cognito logout
   */
  const logout = useCallback(() => {
    // Clear local session
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.signOut();
    }

    // Clear stored tokens
    localStorage.removeItem("auth_access_token");
    localStorage.removeItem("auth_id_token");
    localStorage.removeItem("auth_refresh_token");
    localStorage.removeItem("auth_token_expiry");
    localStorage.removeItem("auth_username");
    sessionStorage.removeItem("pkce_code_verifier");
    sessionStorage.removeItem("oauth_state");

    setUser(null);

    // Redirect to Cognito logout endpoint
    const logoutUrl = new URL(`${COGNITO_DOMAIN}/logout`);
    logoutUrl.searchParams.set("client_id", COGNITO_CLIENT_ID);
    logoutUrl.searchParams.set("logout_uri", REDIRECT_URI);

    window.location.href = logoutUrl.toString();
  }, []);

  /**
   * Get a valid access token, refreshing if expired
   */
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const accessToken = localStorage.getItem("auth_access_token");
    const tokenExpiry = localStorage.getItem("auth_token_expiry");
    const refreshToken = localStorage.getItem("auth_refresh_token");

    if (!accessToken) return null;

    // Check if token is still valid (with 60s buffer)
    if (tokenExpiry) {
      const expiryTime = parseInt(tokenExpiry, 10);
      const now = Math.floor(Date.now() / 1000);
      if (now < expiryTime - 60) {
        return accessToken;
      }
    }

    // Token expired, try to refresh
    if (refreshToken) {
      try {
        const username = localStorage.getItem("auth_username");
        if (!username) return null;

        const cognitoUser = new CognitoUser({
          Username: username,
          Pool: userPool,
        });

        const cognitoRefreshToken = new CognitoRefreshToken({
          RefreshToken: refreshToken,
        });

        const session = await new Promise<CognitoUserSession>((resolve, reject) => {
          cognitoUser.refreshSession(cognitoRefreshToken, (err, session) => {
            if (err) reject(err);
            else resolve(session);
          });
        });

        const newAccessToken = session.getAccessToken().getJwtToken();
        const newExpiry = session.getAccessToken().getExpiration();

        localStorage.setItem("auth_access_token", newAccessToken);
        localStorage.setItem("auth_id_token", session.getIdToken().getJwtToken());
        localStorage.setItem("auth_token_expiry", newExpiry.toString());

        return newAccessToken;
      } catch {
        // Refresh failed, user needs to re-authenticate
        localStorage.removeItem("auth_access_token");
        localStorage.removeItem("auth_id_token");
        localStorage.removeItem("auth_refresh_token");
        localStorage.removeItem("auth_token_expiry");
        localStorage.removeItem("auth_username");
        setUser(null);
        return null;
      }
    }

    return null;
  }, []);

  /**
   * Handle the OAuth callback - exchange authorization code for tokens
   */
  const handleCallback = useCallback(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const returnedState = urlParams.get("state");
    const codeVerifier = sessionStorage.getItem("pkce_code_verifier");
    const expectedState = sessionStorage.getItem("oauth_state");

    // Always strip the callback params from the URL and clear one-time
    // session values, whether the exchange succeeds or fails, so a stale
    // "?code=" can't trigger a re-exchange or a login loop.
    const cleanup = () => {
      sessionStorage.removeItem("pkce_code_verifier");
      sessionStorage.removeItem("oauth_state");
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    if (!code || !codeVerifier) return false;

    // CSRF: reject a callback whose state doesn't match what we issued.
    if (!expectedState || returnedState !== expectedState) {
      console.error("OAuth state mismatch; rejecting callback.");
      cleanup();
      return false;
    }

    try {
      const tokens = await exchangeCodeForTokens(code, codeVerifier);

      // Store tokens
      localStorage.setItem("auth_access_token", tokens.access_token);
      localStorage.setItem("auth_id_token", tokens.id_token);
      localStorage.setItem("auth_refresh_token", tokens.refresh_token);

      const expiry = Math.floor(Date.now() / 1000) + tokens.expires_in;
      localStorage.setItem("auth_token_expiry", expiry.toString());

      // Decode the ID token for user info. A decode failure must not discard an
      // otherwise-successful token exchange, so fall back to a placeholder
      // rather than throwing the user back to sign-in.
      const decoded = readUserFromIdToken(tokens.id_token) ?? {
        username: "admin",
        displayName: "Admin",
      };

      localStorage.setItem("auth_username", decoded.username);
      setUser(decoded);

      cleanup();
      return true;
    } catch (error) {
      console.error("Token exchange failed:", error);
      cleanup();
      return false;
    }
  }, []);

  /**
   * Check for existing session on mount
   */
  useEffect(() => {
    const initAuth = async () => {
      // First, check if we're handling an OAuth callback
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has("code")) {
        const success = await handleCallback();
        if (success) {
          setIsLoading(false);
          return;
        }
        // handleCallback already scrubbed the stale "?code=" from the URL, so
        // ProtectedRoute can safely start a fresh login without looping.
      }

      // Check for existing tokens in localStorage
      const accessToken = localStorage.getItem("auth_access_token");
      const tokenExpiry = localStorage.getItem("auth_token_expiry");
      const username = localStorage.getItem("auth_username");

      if (accessToken && tokenExpiry && username) {
        const expiryTime = parseInt(tokenExpiry, 10);
        const now = Math.floor(Date.now() / 1000);

        if (now < expiryTime) {
          // Token still valid — rebuild the user from the stored ID token. This
          // also recovers the email and display name, not just the username.
          const decoded = readUserFromIdToken(localStorage.getItem("auth_id_token"));
          setUser(decoded ?? { username });
        } else {
          // Token expired, try refresh. getAccessToken() replaces the stored ID
          // token on success, so re-read it rather than dropping the email.
          const refreshed = await getAccessToken();
          if (refreshed) {
            const decoded = readUserFromIdToken(localStorage.getItem("auth_id_token"));
            setUser(decoded ?? { username });
          }
        }
      }

      setIsLoading(false);
    };

    initAuth();
  }, [handleCallback, getAccessToken]);

  const value: AuthContextValue = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
