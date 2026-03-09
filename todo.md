# Atos Control Center — TODO

- [x] Interface de chat estilo ChatGPT com tema Obsidian Forge
- [x] Upload de imagem, PDF e câmera
- [x] Gravação de áudio com MediaRecorder
- [x] Proxy backend para contornar CORS do n8n
- [x] Histórico local com localStorage
- [x] PWA manifest e service worker
- [x] Botão de câmera separado (capture=environment)
- [x] Substituir Web Speech API pela API Whisper no backend para transcrição de áudios longos
- [x] Atualizar Service Worker para v3 — força limpeza de cache no celular após migração para Whisper
- [x] Corrigir bug: URL do webhook sendo cacheada — Atos usa URL antiga mesmo após salvar nova URL nas configurações
- [x] Corrigir exibição da resposta do webhook — exibir apenas data.reply em vez do objeto JSON completo
- [x] Debug: exibir resposta bruta do n8n no chat para diagnosticar formato exato retornado
- [x] Histórico de mensagens sincronizado entre dispositivos via banco de dados
- [x] Botão de copiar em cada mensagem (visível sempre no mobile, hover no desktop)
- [x] Corrigir persistência: histórico não sobrescreve mensagens novas ao recarregar
- [x] Aumentar limite do histórico de 100 para 500 mensagens
