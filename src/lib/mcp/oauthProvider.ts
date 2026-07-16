import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { readStore, writeStore } from "./tokenStore";

export interface McpOAuthProvider extends OAuthClientProvider {
  lastAuthorizationUrl?: URL;
}

export function createOAuthProvider(provider: string, baseUrl: string): McpOAuthProvider {
  const redirectUrl = `${baseUrl}/api/mcp/${provider}/callback`;

  const clientProvider: McpOAuthProvider = {
    get redirectUrl(): string {
      return redirectUrl;
    },

    state(): string {
      return Math.random().toString(36).substring(2, 15);
    },

    get clientMetadata(): OAuthClientMetadata {
      return {
        client_name: "Pylon Ticket Triage (local)",
        redirect_uris: [redirectUrl],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      };
    },

    clientInformation(): OAuthClientInformationMixed | undefined {
      return readStore(provider).clientInformation as OAuthClientInformationMixed | undefined;
    },

    saveClientInformation(info: OAuthClientInformationMixed): void {
      writeStore(provider, { clientInformation: info });
    },

    tokens(): OAuthTokens | undefined {
      return readStore(provider).tokens as OAuthTokens | undefined;
    },

    saveTokens(tokens: OAuthTokens): void {
      writeStore(provider, { tokens });
    },

    redirectToAuthorization(authorizationUrl: URL): void {
      clientProvider.lastAuthorizationUrl = authorizationUrl;
    },

    saveCodeVerifier(codeVerifier: string): void {
      writeStore(provider, { codeVerifier });
    },

    codeVerifier(): string {
      const verifier = readStore(provider).codeVerifier;
      if (!verifier) {
        throw new Error(`No PKCE code verifier saved for provider "${provider}"`);
      }
      return verifier;
    },

    saveDiscoveryState(state: OAuthDiscoveryState): void {
      writeStore(provider, { discoveryState: state });
    },

    discoveryState(): OAuthDiscoveryState | undefined {
      return readStore(provider).discoveryState as OAuthDiscoveryState | undefined;
    },
  };

  return clientProvider;
}
