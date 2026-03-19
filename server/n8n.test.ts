/**
 * Teste de validação das credenciais do n8n (ATOS_EXECUTOR)
 */
import { describe, it, expect } from "vitest";
import "dotenv/config";

const N8N_BASE_URL = process.env.N8N_BASE_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;

describe("n8n ATOS_EXECUTOR credentials validation", () => {
  it("should have N8N_BASE_URL configured", () => {
    expect(N8N_BASE_URL).toBeTruthy();
    expect(N8N_BASE_URL).toMatch(/^https?:\/\//);
  });

  it("should have N8N_API_KEY configured", () => {
    expect(N8N_API_KEY).toBeTruthy();
    expect(N8N_API_KEY!.length).toBeGreaterThan(10);
  });

  it("should connect to n8n API and list workflows", async () => {
    const response = await fetch(`${N8N_BASE_URL}/api/v1/workflows?limit=5`, {
      headers: {
        "X-N8N-API-KEY": N8N_API_KEY!,
        "Content-Type": "application/json",
      },
    });

    console.log(`✅ n8n API status: ${response.status}`);
    expect(response.status).toBe(200);

    const data = await response.json() as { data: unknown[] };
    console.log(`✅ Workflows encontrados: ${data.data?.length ?? 0}`);
    expect(Array.isArray(data.data)).toBe(true);
  }, 15000);
});
