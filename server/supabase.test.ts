import { describe, it, expect } from "vitest";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BRIDGE_API_KEY = process.env.SUPABASE_BRIDGE_API_KEY!;

describe("Supabase credentials validation", () => {
  it("should have SUPABASE_URL defined", () => {
    expect(SUPABASE_URL).toBeTruthy();
    expect(SUPABASE_URL).toMatch(/^https:\/\/.+\.supabase\.co/);
  });

  it("should have SUPABASE_SERVICE_ROLE_KEY defined", () => {
    expect(SUPABASE_SERVICE_ROLE_KEY).toBeTruthy();
    expect(SUPABASE_SERVICE_ROLE_KEY.length).toBeGreaterThan(20);
  });

  it("should have SUPABASE_BRIDGE_API_KEY defined", () => {
    expect(BRIDGE_API_KEY).toBeTruthy();
    expect(BRIDGE_API_KEY.length).toBeGreaterThan(4);
  });

  it("should connect to Supabase and query conversation_logs", async () => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/conversation_logs?select=id,role,message,created_at&order=created_at.desc&limit=3`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    console.log(`✅ conversation_logs acessível — ${data.length} registros recentes encontrados`);
  });

  it("should reach athos-log edge function", async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/athos-log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-key": BRIDGE_API_KEY,
      },
      body: JSON.stringify({
        role: "mentor",
        message: "[teste de conexão do Manus — pode ignorar]",
      }),
    });
    // Aceita 200 ou 201 como sucesso
    expect([200, 201]).toContain(res.status);
    console.log(`✅ athos-log respondeu com status ${res.status}`);
  });
});
