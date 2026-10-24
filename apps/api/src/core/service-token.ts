/**
 * The shared secret the API sends to the fetch and extract services.
 *
 * Set HELIX_SERVICE_TOKEN on all three and the services answer only the API,
 * not any other process or container that can reach their ports.
 */

export const SERVICE_TOKEN_HEADER = 'x-helix-service-token';

export function withServiceToken(token: string | undefined, headers: Record<string, string>): Record<string, string> {
  return token ? { ...headers, [SERVICE_TOKEN_HEADER]: token } : headers;
}
