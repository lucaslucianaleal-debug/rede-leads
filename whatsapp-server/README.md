# WhatsApp Server — CRM Integration

## Setup

1. **Instalar dependências:**
   ```bash
   cd whatsapp-server
   npm install
   ```

2. **Adicionar chave do Firebase:**
   - Coloque o arquivo `serviceAccountKey.json` dentro de `whatsapp-server/`
   - Para gerar: Firebase Console → Configurações → Contas de Serviço → Gerar nova chave privada

3. **Copiar .env:**
   ```bash
   cp .env.example .env
   ```

4. **Rodar o servidor:**
   ```bash
   npm start
   ```

5. **Escanear QR Code:**
   - Um QR Code aparecerá no terminal
   - Abra o WhatsApp → Aparelhos conectados → Conectar aparelho → Escanear

## Como funciona

- O servidor fica escutando mensagens recebidas no WhatsApp
- A cada mensagem recebida:
  - Cria o lead no CRM (se for um número novo)
  - Salva a mensagem na coleção `conversations/{telefone}/messages/`
  - Incrementa o badge de não lidas
- O CRM se conecta via Firestore em tempo real
- Para enviar mensagem do CRM, chama `POST http://localhost:3001/send-message`

## Estrutura Firestore

```
conversations/
  {telefone}/
    telefone: string
    leadNome: string
    lastMessage: string
    lastMessageAt: Timestamp
    unreadCount: number
    messages/
      {msgId}/
        id: string
        body: string
        fromMe: boolean
        timestamp: Timestamp
        read: boolean
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/status` | Verifica se WhatsApp está conectado |
| `POST` | `/send-message` | Envia mensagem (`{ telefone, message }`) |
| `POST` | `/mark-read` | Marca conversa como lida (`{ telefone }`) |
