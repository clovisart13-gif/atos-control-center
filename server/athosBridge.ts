/**
 * ATHOS Bridge — Comunicação entre ATHOS_MENTOR e ATOS_EXECUTOR (n8n)
 *
 * Capacidades:
 * - Listar workflows disponíveis no n8n
 * - Acionar um workflow por ID ou nome via webhook
 * - Criar um novo workflow a partir de um JSON
 * - Ativar/desativar workflows
 */

const N8N_BASE_URL = process.env.N8N_BASE_URL?.replace(/\/$/, "");
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_BASE_URL || !N8N_API_KEY) {
  console.warn("[athos-bridge] N8N_BASE_URL ou N8N_API_KEY não configurados");
}

const n8nHeaders = {
  "X-N8N-API-KEY": N8N_API_KEY ?? "",
  "Content-Type": "application/json",
};

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  tags?: { id: string; name: string }[];
}

export interface N8nWorkflowDetail extends N8nWorkflow {
  nodes: unknown[];
  connections: unknown;
  settings?: unknown;
}

/**
 * Lista todos os workflows do n8n
 */
export async function listWorkflows(): Promise<N8nWorkflow[]> {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows?limit=100`, {
    headers: n8nHeaders,
  });
  if (!res.ok) throw new Error(`n8n listWorkflows error: ${res.status} ${await res.text()}`);
  const data = await res.json() as { data: N8nWorkflow[] };
  return data.data ?? [];
}

/**
 * Busca um workflow pelo nome (case-insensitive)
 */
export async function findWorkflowByName(name: string): Promise<N8nWorkflow | null> {
  const workflows = await listWorkflows();
  return workflows.find(w => w.name.toLowerCase().includes(name.toLowerCase())) ?? null;
}

/**
 * Busca detalhes completos de um workflow pelo ID
 */
export async function getWorkflow(workflowId: string): Promise<N8nWorkflowDetail> {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${workflowId}`, {
    headers: n8nHeaders,
  });
  if (!res.ok) throw new Error(`n8n getWorkflow error: ${res.status} ${await res.text()}`);
  return res.json() as Promise<N8nWorkflowDetail>;
}

/**
 * Ativa um workflow pelo ID
 */
export async function activateWorkflow(workflowId: string): Promise<void> {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${workflowId}/activate`, {
    method: "POST",
    headers: n8nHeaders,
  });
  if (!res.ok) throw new Error(`n8n activateWorkflow error: ${res.status} ${await res.text()}`);
}

/**
 * Desativa um workflow pelo ID
 */
export async function deactivateWorkflow(workflowId: string): Promise<void> {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows/${workflowId}/deactivate`, {
    method: "POST",
    headers: n8nHeaders,
  });
  if (!res.ok) throw new Error(`n8n deactivateWorkflow error: ${res.status} ${await res.text()}`);
}

/**
 * Cria um novo workflow a partir de um JSON
 */
export async function createWorkflow(workflowJson: Record<string, unknown>): Promise<N8nWorkflow> {
  const res = await fetch(`${N8N_BASE_URL}/api/v1/workflows`, {
    method: "POST",
    headers: n8nHeaders,
    body: JSON.stringify(workflowJson),
  });
  if (!res.ok) throw new Error(`n8n createWorkflow error: ${res.status} ${await res.text()}`);
  return res.json() as Promise<N8nWorkflow>;
}

/**
 * Aciona um workflow via webhook (para workflows com trigger Webhook)
 * webhookPath: o path configurado no nó Webhook do workflow (ex: "atos-executor")
 */
export async function triggerWebhook(
  webhookPath: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  const url = `${N8N_BASE_URL}/webhook/${webhookPath}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`n8n triggerWebhook error: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Executa uma ação no ATOS_EXECUTOR baseada no bloco ```execute``` do ATHOS_MENTOR
 * Suporta: list_workflows, get_workflow, create_workflow, activate_workflow, trigger_webhook
 */
export async function dispatchAction(action: string, args: Record<string, unknown>): Promise<unknown> {
  switch (action) {
    case "list_workflows":
      return listWorkflows();

    case "get_workflow":
      return getWorkflow(args.workflow_id as string);

    case "find_workflow":
      return findWorkflowByName(args.name as string);

    case "create_workflow":
      return createWorkflow(args.workflow as Record<string, unknown>);

    case "activate_workflow":
      await activateWorkflow(args.workflow_id as string);
      return { success: true, message: `Workflow ${args.workflow_id} ativado` };

    case "deactivate_workflow":
      await deactivateWorkflow(args.workflow_id as string);
      return { success: true, message: `Workflow ${args.workflow_id} desativado` };

    case "trigger_webhook":
      return triggerWebhook(args.webhook_path as string, (args.payload as Record<string, unknown>) ?? {});

    default:
      throw new Error(`Ação desconhecida: ${action}. Ações disponíveis: list_workflows, get_workflow, find_workflow, create_workflow, activate_workflow, deactivate_workflow, trigger_webhook`);
  }
}
