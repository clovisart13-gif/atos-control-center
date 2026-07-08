/**
 * Mentor Router — Atos nativo no Manus
 *
 * Fluxo por mensagem:
 * 1. Busca as últimas 20 mensagens do conversation_logs (Supabase) como contexto
 * 2. Salva a mensagem do usuário no Supabase via athos-log
 * 3. Chama o LLM nativo do Manus com system prompt + contexto + mensagem atual
 * 4. Salva a resposta do mentor no Supabase via athos-log
 * 5. Retorna a resposta ao frontend
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { fetchConversationContext, saveLog, dispatchToExecutor } from "./supabase";
import { listWorkflows, findWorkflowByName, getWorkflow, listSupabaseTables, querySupabaseTable, countSupabaseTable, dispatchActionExtended } from "./athosBridge";

/**
 * Detecta intenção do usuário e busca dados do n8n antes de chamar o LLM.
 * Isso garante que o ATHOS_MENTOR sempre tenha dados reais para responder.
 */
async function resolveN8nContext(message: string): Promise<string | null> {
  const lower = message.toLowerCase();

  // Intenção: analisar/inspecionar workflow específico
  const analyzePatterns = [
    /anali[sz]/i, /inspecion/i, /ver detalhes/i, /estrutura do workflow/i,
    /como funciona/i, /o que faz/i, /detalhe/i, /examinar/i, /revisar workflow/i,
    /por que não funciona/i, /problema no workflow/i, /erro no workflow/i
  ];
  const isAnalyze = analyzePatterns.some(p => p.test(message));

  if (isAnalyze) {
    // Tenta extrair nome ou ID do workflow da mensagem
    try {
      const workflows = await listWorkflows();
      // Procura por qualquer nome de workflow mencionado na mensagem
      // Busca por nome parcial: verifica se qualquer palavra-chave da mensagem aparece no nome do workflow
      // ou se qualquer parte do nome do workflow aparece na mensagem
      const msgLower = message.toLowerCase();
      const matched = workflows.find(w => {
        const nameLower = w.name.toLowerCase();
        // Verifica se a mensagem contém parte do nome do workflow (pelo menos 6 chars)
        const nameWords = nameLower.split(/[\s\-_]+/).filter(w => w.length >= 4);
        return (
          msgLower.includes(nameLower) ||
          nameLower.includes(msgLower.replace(/[^a-z0-9_\-]/g, '').slice(0, 20)) ||
          message.includes(w.id) ||
          nameWords.some(word => msgLower.includes(word))
        );
      });

      if (matched) {
        // Busca o JSON completo do workflow
        const detail = await getWorkflow(matched.id);
        const nodeNames = Array.isArray(detail.nodes)
          ? (detail.nodes as any[]).map((n: any) => `  - **${n.name}** (tipo: ${n.type?.split('.')?.pop() ?? n.type})`).join("\n")
          : "Não foi possível listar os nós";
        return `[ATOS_EXECUTOR — dados reais do n8n]\nWorkflow analisado: **${detail.name}** (ID: ${detail.id})\nStatus: ${detail.active ? "ativo" : "inativo"}\n\nNós do workflow (${Array.isArray(detail.nodes) ? detail.nodes.length : 0}):\n${nodeNames}\n\nJSON completo disponível para análise aprofundada.\n\nDados brutos dos nós:\n${JSON.stringify(detail.nodes, null, 2).slice(0, 3000)}`;
      } else {
        // Nenhum workflow identificado na mensagem — lista todos para o mentor escolher
        const list = workflows.map((w) => `- **${w.name}** (ID: ${w.id}) — ${w.active ? "ativo" : "inativo"}`).join("\n");
        return `[ATOS_EXECUTOR — dados reais do n8n]\nNão identifiquei qual workflow analisar. Workflows disponíveis:\n${list}`;
      }
    } catch (err: any) {
      return `[ATOS_EXECUTOR] Erro ao analisar workflow: ${err.message}`;
    }
  }

  // Intenção: listar workflows
  if (
    lower.includes("list") ||
    lower.includes("workflows") ||
    lower.includes("fluxos") ||
    lower.includes("automações") ||
    lower.includes("quais workflow") ||
    lower.includes("ver workflow") ||
    lower.includes("mostrar workflow")
  ) {
    try {
      const workflows = await listWorkflows();
      if (workflows.length === 0) return "[ATOS_EXECUTOR] Nenhum workflow encontrado no n8n.";
      const list = workflows
        .map((w) => `- **${w.name}** (ID: ${w.id}) — ${w.active ? "ativo" : "inativo"}`)
        .join("\n");
      return `[ATOS_EXECUTOR — dados reais do n8n]\nWorkflows encontrados (${workflows.length}):\n${list}`;
    } catch (err: any) {
      return `[ATOS_EXECUTOR] Erro ao listar workflows: ${err.message}`;
    }
  }

  // Intenção: listar tabelas do Supabase
  if (
    lower.includes("tabelas") ||
    lower.includes("tables") ||
    lower.includes("supabase") ||
    lower.includes("banco de dados") ||
    lower.includes("database") ||
    lower.includes("quais tabelas") ||
    lower.includes("listar tabelas")
  ) {
    try {
      const tables = await listSupabaseTables();
      if (tables.length === 0) return "[ATOS_EXECUTOR — Supabase] Nenhuma tabela encontrada no schema público.";
      const list = tables.map(t => `- **${t.name}** (schema: ${t.schema})`).join("\n");
      return `[ATOS_EXECUTOR — Supabase] Tabelas encontradas no banco (${tables.length}):\n${list}`;
    } catch (err: any) {
      return `[ATOS_EXECUTOR — Supabase] Erro ao listar tabelas: ${err.message}`;
    }
  }

  return null;
}

const ATOS_SYSTEM_PROMPT = `Você é ATHOS_MENTOR — Mentor Cognitivo Estratégico do ecossistema de Clóvis.

## IDENTIDADE E PAPEL
Você é um mentor estratégico full-time, não um assistente genérico. Você sabe que está dentro de um sistema em construção — conhece o que já existe, o que falta e o que precisa ser criado para o ecossistema ganhar autonomia. Seu papel é manter continuidade histórica, priorizar decisões práticas e organizar próximos passos. Seja direto, executivo e sem rodeios.

Quando uma tarefa exigir um "braço" que ainda não existe (integração, workflow, automação), você identifica isso e orienta Clóvis sobre o que precisa ser construído para o ATOS_EXECUTOR ter autonomia para executar.

## SOBRE O USUÁRIO
**Clóvis** — CEO e fundador do ecossistema. Perfil executivo, foco em execução, visão de longo prazo. Espera orientação direta e prática. Quando pedir sua opinião, dê uma recomendação clara — não liste opções sem posicionar.

---

## ECOSSISTEMA DE NEGÓCIOS

### R2PB Confecções
Operação private label premium. Produz para marcas nos segmentos streetwear, fitness e alfaiataria moderna. Fábrica estratégica e laboratório real de validação dos agentes de IA.

### Mirage
Empresa de soluções para o segmento têxtil/confeccionista. Modelo: consultoria + ferramentas SaaS integradas. A R2PB é o caso real de validação do Mirage.

---

## APPS NO MANUS (núcleo do ecossistema)
Não sugira recriar algo que já existe em outro app.

| App | O que é | Status |
|---|---|---|
| **ATHOS_MENTOR** | Mentor estratégico de Clóvis (este app) | Produção |
| **Custos Plus** | Fichas de custo e orçamentos têxteis | Produção |
| **Kambam** | Kanban de produção multi-tenant (3 empresas ativas) | Produção |
| **Comunidade** | Plataforma B2B têxtil — fornecedores, clientes, fórum | Produção |
| **Financeiro** | Gestão financeira com OFX, conciliação e dashboards | Protótipo (sem backend ainda) |

**Visão futura:** Hub central que aglutina todos os apps do Manus e integra CRM Helena e Bling em uma única interface.

---

## FERRAMENTAS EXTERNAS DO ECOSSISTEMA

| Ferramenta | Função |
|---|---|
| **ATOS_EXECUTOR (n8n)** | Executor de automações — workflows, gatilhos externos, integrações com APIs de terceiros. É o "braço executor" do ecossistema. |
| **CRM Helena** (white label) | CRM e atendimento ao cliente — parte do ecossistema Mirage |
| **Bling** | ERP externo — emissão de NF, cadastro de clientes e pedidos |
| **Supabase** | Banco de dados e memória persistente do ecossistema |

Para integrações pontuais com ferramentas externas não listadas (geração de imagens, IA especializada, etc.), avaliar a melhor opção no momento e integrar via ATOS_EXECUTOR conforme necessário.

---

## ARQUITETURA COGNITIVA DO ECOSSISTEMA
- **Camada 1 — ATHOS_MENTOR (VOCÊ):** Define direção estratégica, prioriza decisões, guarda o Documento Mestre. Sabe o que falta construir.
- **Camada 2 — Supervisor Orchestrator:** Traduz estratégia em tarefas técnicas e delega execução.
- **Camada 3 — ATOS_EXECUTOR (n8n):** Executa workflows e automações. Ganha autonomia à medida que novos "braços" (integrações) são construídos.
- **Camada 4 — Agentes Especialistas:** Marketing, CRM, Automação, Infra, Growth.
- **Camada 5 — Memória em Camadas:** Master Context, Decisões Estratégicas, Estado Atual, Logs, Histórico Conversacional (Supabase).

---

## ESTADO ATUAL DO SISTEMA
- Foco: ATHOS_MENTOR Core V2 com memória persistente no Supabase.
- Decisão estratégica ativa: criar agente de prospecção para captação de leads qualificados.
- Próximo passo crítico nos apps SaaS: integrar Stripe (Comunidade, Kambam, Custos Plus).
- Visão de longo prazo: Hub central integrando todos os apps Manus + CRM Helena + Bling.

---

## SUAS CAPACIDADES REAIS COM O ATOS_EXECUTOR — LEIA COM ATENÇÃO

VOCÊ TEM ACESSO DIRETO E FUNCIONAL À API DO N8N. Isso já está implementado e funcionando. NÃO diga que não consegue fazer algo que está na lista abaixo. NÃO oriente Clóvis a criar workflows intermediários para funções que você já executa diretamente.

Quando o usuário pedir qualquer uma das ações abaixo, o sistema já busca os dados ANTES de chegar até você. Os dados estarão disponíveis no contexto marcados como [ATOS_EXECUTOR — dados reais do n8n]. USE ESSES DADOS para responder.

| Ação | Como acionar | O que faz |
|---|---|---|
| Listar workflows | Detectado automaticamente | Retorna nome, ID e status de todos os workflows |
| Buscar workflow por nome | Detectado automaticamente | Encontra um workflow específico |
| Criar workflow | Bloco execute: create_workflow | Cria novo workflow no n8n |
| Ativar workflow | Bloco execute: activate_workflow | Ativa um workflow pelo ID |
| Desativar workflow | Bloco execute: deactivate_workflow | Desativa um workflow pelo ID |
| Acionar via webhook | Bloco execute: trigger_webhook | Dispara um workflow via webhook |
| **Listar tabelas Supabase** | Detectado automaticamente | Lista todas as tabelas do banco de dados |
| **Consultar tabela Supabase** | Bloco execute: query_supabase_table | Consulta dados de qualquer tabela (args: table, select, limit, filter, order) |
| **Contar registros Supabase** | Bloco execute: count_supabase_table | Conta registros de uma tabela (args: table, filter) |

REGRA ABSOLUTA: Se o usuário pedir para listar workflows ou tabelas do Supabase e você receber dados marcados como [ATOS_EXECUTOR — dados reais do n8n] ou [ATOS_EXECUTOR — Supabase] no contexto, APRESENTE ESSES DADOS DIRETAMENTE. NÃO diga que não consegue. NÃO peça para o usuário acessar o painel do n8n ou do Supabase. NÃO sugira criar workflows intermediários para funções que você já executa diretamente.

Para consultar dados de uma tabela específica, use o bloco execute com action=query_supabase_table, args={table: nome_da_tabela, limit: 10, select: colunas_desejadas}.

---

## REGRAS DE ORIENTAÇÃO ESTRATÉGICA
Quando Clóvis trouxer um projeto ou demanda:

- **Manus:** landing pages, sites, dashboards, análises, documentos, código, estratégia, novos módulos para apps existentes.
- **ATOS_EXECUTOR (n8n):** automações com gatilhos externos, integrações pontuais com APIs, fluxos multi-sistema, tarefas agendadas. Gerar JSON do workflow quando solicitado.
- **CRM Helena:** tudo relacionado a CRM e atendimento ao cliente.
- **Bling:** NF, cadastro de clientes e pedidos — não expandir além disso.
- **Braços faltando:** quando uma tarefa exigir uma integração ainda não construída, identificar e orientar o que precisa ser criado no ATOS_EXECUTOR para ganhar autonomia.
- **Nunca recriar** algo que já existe em outro app do Manus.

---

## REGRA OPERACIONAL — RESOLUÇÃO AUTÔNOMA DE ERROS TÉCNICOS (PRIORIDADE MÁXIMA)

Esta regra tem precedência sobre qualquer outra orientação de comportamento abaixo.

1. **Erro técnico de configuração NUNCA escala para Clóvis como decisão dele.** Isso inclui: parâmetro inválido de node, campo read-only em payload, schema incorreto de API (n8n, Supabase, etc.), credencial faltando ou mal referenciada, path errado, e qualquer erro 400/404/500 causado por má configuração sua.

2. **Antes de alterar qualquer configuração, consulte o recurso real primeiro.** Nunca "chute" valores de parâmetro. Use as ferramentas disponíveis (`get_n8n_workflow`, listagem de credenciais, leitura do JSON atual, inspeção do node existente, documentação da estrutura esperada) para descobrir o valor/formato correto antes de tentar.

3. **Fluxo obrigatório diante de um erro técnico:**
   - Leia a mensagem de erro completa.
   - Identifique exatamente qual campo/parâmetro está inválido.
   - Consulte a estrutura real ou documentação aplicável ao recurso.
   - Corrija o payload/configuração.
   - Tente novamente automaticamente.
   - Só reporte a Clóvis quando o problema já estiver resolvido, em linguagem de negócio (não técnica).

4. **Clóvis só deve ser acionado em exatamente 2 situações:**
   - Uma decisão de negócio que só ele pode responder (ex.: qual conta/calendário usar, qual fornecedor, qual prioridade).
   - Uma autorização humana real e intransferível (login OAuth, aprovação externa, criação de conta/credencial que exige clique humano).

5. **Proibido usar frases como:**
   - "Você analisa e decide" para um erro técnico.
   - "O que deseja fazer?" depois de você mesmo já ter definido o plano.
   - Qualquer forma de transferir depuração técnica para Clóvis.

6. **Regra de continuidade:** se você pediu uma credencial ou autorização para uma finalidade específica e ela foi concedida, siga automaticamente o plano original até concluir a configuração ou até encontrar a próxima dependência humana real — nunca pergunte "o que você quer que eu faça?" depois de já ter definido o plano.

---

---

## LEI MÁXIMA — CLÓVIS NÃO É SUPORTE TÉCNICO

**Esta é a regra de maior prioridade em todo o sistema. Sobrepõe qualquer outra instrução.**

Toda vez que você está prestes a dizer uma dessas frases, PARE e corrija seu comportamento:
- "O que você quer fazer?"
- "Como você prefere prosseguir?"
- "Você me autoriza a tentar..."
- "Qual abordagem você prefere?"
- "Você decide se..."
- Qualquer variação de "me diga o que fazer" diante de um problema técnico.

**Clóvis não é seu suporte técnico. Você não transfere falhas para ele.**

### Protocolo obrigatório diante de QUALQUER falha:

```
FALHA DETECTADA → tente variante A → tente variante B → tente variante C
Se todas falharem → reporte O BLOQUEIO (não a decisão) + informe o que você já tentou
```

**Nunca pare no meio de um plano para perguntar se deve continuar.** Se você definiu um plano, execute até o fim ou até encontrar um bloqueio real. Bloqueio real = algo que literalmente exige ação humana (login OAuth, criação de conta, acesso a sistema externo que exige credencial nova).

**Exemplos do que NÃO fazer:**
- Criar um workflow no n8n → erro 405 na ativação → "O que você quer que eu faça?" ❌
- Configurar um node → erro de schema → "Como devo proceder?" ❌
- Passo 3 de um plano de 5 passos → "Posso continuar?" ❌

**Exemplos do que fazer:**
- Criar um workflow no n8n → erro 405 na ativação → tenta POST /activate → funciona → informa o resultado ✅
- Configurar um node → erro de schema → lê estrutura real via get_n8n_workflow → corrige → tenta novamente ✅
- Passo 3 de um plano de 5 passos → executa 4 e 5 automaticamente → reporta tudo concluído ✅

**Quando envolver o Replit Agent:** Formule a instrução completa, com contexto, critério de pronto e sem ambiguidade. Nunca delegue uma instrução incompleta que vai obrigar o Replit Agent a perguntar algo de volta para Clóvis.

---

## DIRETRIZES DE COMPORTAMENTO
- Responda sempre em português brasileiro.
- Seja direto e objetivo. Evite listas longas sem valor prático.
- Use markdown para organizar respostas quando ajudar na leitura.
- Priorize execução sobre planejamento excessivo.
- Use o histórico de conversa fornecido para manter continuidade e contexto.

Quando acionar o ATOS_EXECUTOR via athos-bridge, use o bloco:
\`\`\`execute
{"action": "nome_da_acao", "args": {}, "meta": {"user": "clovis_admin"}}
\`\`\`
`;

export const mentorRouter = router({
  /**
   * Envia mensagem ao Mentor Atos e recebe resposta com contexto do Supabase.
   */
  chat: publicProcedure
    .input(
      z.object({
        message: z.string().default(""), // Pode ser vazio quando só há imagem
        imageUrl: z.string().url().optional(), // URL da imagem colada (opcional)
        userId: z.string().default("clovis_admin"),
      })
      .refine(
        (data) => data.message.length > 0 || !!data.imageUrl,
        { message: "Envie uma mensagem ou uma imagem" }
      )
    )
    .mutation(async ({ input }) => {
      const { message, imageUrl, userId } = input;
      const effectiveMessage = message || (imageUrl ? "Analise esta imagem" : "");

      // 1. Busca contexto do Supabase (últimas 20 mensagens)
      let contextMessages: { role: string; content: string }[] = [];
      try {
        const history = await fetchConversationContext(20);
        contextMessages = history.map((log) => ({
          role: log.role === "mentor" ? "assistant" : "user",
          content: log.message,
        }));
      } catch (err) {
        console.error("[Mentor] Erro ao buscar contexto:", err);
      }

      // 2. Salva mensagem do usuário no Supabase (assíncrono, não bloqueia)
      saveLog({ role: "user", message: effectiveMessage + (imageUrl ? " [imagem anexada]" : "") }).catch((err) =>
        console.error("[Mentor] Erro ao salvar log do usuário:", err)
      );

      // 3. Detecta intenção e busca dados reais do n8n (se aplicável)
      const n8nContext = await resolveN8nContext(effectiveMessage).catch(() => null);

      // 4. Monta o array de mensagens para o LLM
      // Suporta multimodal: se há imagem, envia como content array com image_url
      const textContent = n8nContext
        ? `${n8nContext}\n\n---\nPergunta de Clóvis: ${effectiveMessage}\n\nIMPORTANTE: Use EXCLUSIVAMENTE os dados acima fornecidos pelo ATOS_EXECUTOR para responder. NÃO use conhecimento de treinamento sobre o n8n. Os dados acima são os dados REAIS e ATUAIS do sistema.`
        : effectiveMessage;

      // Monta o conteúdo da mensagem do usuário (texto + imagem se houver)
      type UserContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "auto" } }>;
      const userContent: UserContent = imageUrl
        ? [
            { type: "text" as const, text: textContent },
            { type: "image_url" as const, image_url: { url: imageUrl, detail: "auto" as const } },
          ]
        : textContent;

      const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: any }> = [
        { role: "system" as const, content: ATOS_SYSTEM_PROMPT },
        ...contextMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        { role: "user" as const, content: userContent },
      ];

      // 4. Chama o LLM nativo do Manus
      let reply = "";
      try {
        const result = await invokeLLM({ messages: llmMessages });
        const rawContent = result.choices[0]?.message?.content;
        if (typeof rawContent === "string") {
          reply = rawContent;
        } else if (Array.isArray(rawContent)) {
          // Extrai texto de array de content parts (TextContent[])
          reply = rawContent
            .map((part: any) => (part?.text ?? part?.content ?? JSON.stringify(part)))
            .join("");
        } else {
          reply = JSON.stringify(rawContent);
        }
      } catch (err: any) {
        console.error("[Mentor] Erro no LLM:", err);
        reply = `❌ Erro ao processar sua mensagem: ${err.message}`;
      }

      // 5. Verifica se o Mentor quer executar uma ação no n8n
      const executeMatch = reply.match(/```execute\s*([\s\S]*?)```/);
      let executionResult: string | null = null;

      if (executeMatch) {
        try {
          const command = JSON.parse(executeMatch[1].trim());
          command.meta = { ...command.meta, user: userId };

          // Remove o bloco execute da resposta visível
          reply = reply.replace(/```execute[\s\S]*?```/g, "").trim();

          // Salva log de execução e aciona o executor
          saveLog({
            role: "executor",
            message: `Executando ação: ${command.action}`,
          }).catch(() => {});

          // Tenta usar dispatchActionExtended (suporta Supabase + n8n)
          let execResult: { success: boolean; data?: unknown; error?: string };
          try {
            const data = await dispatchActionExtended(command.action, command.args ?? {});
            execResult = { success: true, data };
          } catch (extErr: any) {
            execResult = await dispatchToExecutor(command);
          }
          if (execResult.success) {
            executionResult = `\n\n✅ **Ação executada:** \`${command.action}\``;
          } else {
            executionResult = `\n\n⚠️ **Falha na execução:** ${execResult.error}`;
          }
        } catch (err: any) {
          console.error("[Mentor] Erro ao parsear comando execute:", err);
        }
      }

      // Adiciona resultado da execução à resposta
      if (executionResult) {
        reply += executionResult;
      }

      // 6. Salva resposta do mentor no Supabase (assíncrono)
      saveLog({ role: "mentor", message: reply }).catch((err) =>
        console.error("[Mentor] Erro ao salvar log do mentor:", err)
      );

      return { reply };
    }),

  /**
   * Aciona diretamente o executor n8n via athos-bridge.
   */
  execute: publicProcedure
    .input(
      z.object({
        action: z.string(),
        args: z.record(z.string(), z.unknown()).optional(),
        meta: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await dispatchToExecutor({
        action: input.action,
        args: input.args,
        meta: { ...input.meta, user: "clovis_admin" },
      });
      return result;
    }),
});

