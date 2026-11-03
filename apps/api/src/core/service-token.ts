
export const SERVICE_TOKEN_HEADER = 'x-helix-service-token';

export function withServiceToken(token: string | undefined, headers: Record<string, string>): Record<string, string> {
  return token ? { ...headers, [SERVICE_TOKEN_HEADER]: token } : headers;
}
