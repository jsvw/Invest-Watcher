function proxyConfigured(): boolean {
  return !!(
    process.env.WEBSHARE_PROXY_HOST &&
    process.env.WEBSHARE_PROXY_PORT &&
    process.env.WEBSHARE_PROXY_USERNAME &&
    process.env.WEBSHARE_PROXY_PASSWORD
  );
}

export function getProxyArgs(): string[] {
  if (!proxyConfigured()) {
    const missing = ["WEBSHARE_PROXY_HOST", "WEBSHARE_PROXY_PORT", "WEBSHARE_PROXY_USERNAME", "WEBSHARE_PROXY_PASSWORD"]
      .filter(k => !process.env[k]);
    if (missing.length < 4) {
      console.warn(`[Proxy] Proxy partially configured but missing: ${missing.join(", ")}. Proceeding without proxy.`);
    } else {
      console.log("[Proxy] No proxy configured. Proceeding without proxy.");
    }
    return [];
  }
  const host = process.env.WEBSHARE_PROXY_HOST!;
  const port = process.env.WEBSHARE_PROXY_PORT!;
  console.log(`[Proxy] Using proxy: ${host}:${port}`);
  return [`--proxy-server=http://${host}:${port}`];
}

export async function applyProxy(page: any): Promise<void> {
  if (!proxyConfigured()) return;
  await page.authenticate({
    username: process.env.WEBSHARE_PROXY_USERNAME!,
    password: process.env.WEBSHARE_PROXY_PASSWORD!,
  });
}
