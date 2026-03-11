# Infraestrutura Google Compute Engine

## Recomendação de máquina

- **Tipo:** e2-standard-4
- **CPU:** 4 vCPUs
- **RAM:** 16 GB

> Justificativa: O WhatsApp via Puppeteer/Chrome consome bastante RAM e CPU. Para operação 24h, 16 GB de RAM e 4 vCPUs garantem estabilidade, evitando travamentos do navegador e do Node.js.

## Deploy

1. Crie a VM no Google Compute Engine (e2-standard-4, Ubuntu/Debian).
2. Instale Docker e PM2:
   ```bash
   sudo apt update && sudo apt install -y docker.io
   sudo npm install -g pm2
   ```
3. Copie os arquivos do projeto para a VM.
4. Construa e rode o container:
   ```bash
   docker build -t whatsapp-server .
   docker run -d --restart=always -p 3001:3001 --name whatsapp-server whatsapp-server
   ```
5. Para auto-start com PM2 (dentro do container):
   ```bash
   pm2 start pm2-whatsapp-server.config.js
   pm2 save
   pm2 startup
   ```

> Alternativamente, use systemd para auto-start do Docker container:

```
[Unit]
Description=WhatsApp Server Docker
After=network.target

[Service]
Restart=always
ExecStart=/usr/bin/docker run --rm -p 3001:3001 --name whatsapp-server whatsapp-server
ExecStop=/usr/bin/docker stop whatsapp-server

[Install]
WantedBy=multi-user.target
```
Salve como `/etc/systemd/system/whatsapp-server.service` e rode:
```
sudo systemctl enable whatsapp-server
sudo systemctl start whatsapp-server
```
