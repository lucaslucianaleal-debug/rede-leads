# Rede Leads — WhatsApp Agent v2

Agente local mínimo para usar o computador como ponte do WhatsApp sem transformar o PC em servidor do CRM.

## O que ele faz

- mantém apenas a sessão do WhatsApp via `whatsapp-web.js`;
- busca uma pequena fila de mensagens no Rede Leads;
- envia uma mensagem por vez com intervalo aleatório configurável;
- confirma o envio para o Rede Leads;
- recebe eventos do WhatsApp e envia apenas dados comerciais necessários para o backend;
- não baixa áudio, imagem ou histórico inteiro;
- não acessa o Firebase diretamente;
- não cria lead quando o identificador recebido é um LID interno sem telefone confiável.

## Configuração

1. Tenha Node.js 20+ instalado.
2. Entre na pasta `whatsapp-agent`.
3. Rode `npm install`.
4. Copie `.env.example` para `.env`.
5. Configure no `.env` o mesmo `WHATSAPP_AGENT_SECRET` usado no Vercel e confirme o `CLINIC_ID`.
6. Rode `npm start`.
7. Na primeira execução, leia o QR Code em **WhatsApp > Aparelhos conectados**.

A sessão fica somente no computador em `.agent-state/auth`.

## Ritmo de envio

O padrão é 150–270 segundos entre mensagens. Isso evita rajadas, mas **nenhum intervalo garante ausência de restrição do WhatsApp**. Use somente contatos com relação comercial legítima, personalize as mensagens e respeite pedidos para parar.

## Recuperação

Se o agente cair depois de enviar uma mensagem mas antes de confirmar no servidor, ele mantém um pequeno cache local de IDs enviados e evita reenviar a mesma fila ao reiniciar.
