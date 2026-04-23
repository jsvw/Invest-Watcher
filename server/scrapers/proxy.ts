export function getProxyArgs(): string[] {
  const host = process.env.WEBSHARE_PROXY_HOST;
  const port = process.env.WEBSHARE_PROXY_PORT;
  if (!host || !port) {
    console.log("[Proxy] No proxy configured (WEBSHARE_PROXY_HOST/PORT not set). Proceeding without proxy.");
    return [];
  }
  console.log(`[Proxy] Using proxy: ${host}:${port}`);
  return [`--proxy-server=http://${host}:${port}`];
}

export async function applyProxy(page: any): Promise<void> {
  const host = process.env.WEBSHARE_PROXY_HOST;
  const username = process.env.WEBSHARE_PROXY_USERNAME;
  const password = process.env.WEBSHARE_PROXY_PASSWORD;
  if (!host || !username || !password) return;
  await page.authenticate({ username, password });
}
