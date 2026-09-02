# Meta Ads -> Rede Leads

Integração de leitura da Marketing API para atualizar automaticamente o histórico diário das campanhas no Rede Leads.

## Variáveis de ambiente no Vercel

Configure somente no Vercel (nunca no GitHub):

- `META_ACCESS_TOKEN`: token com permissão `ads_read` e acesso às contas vinculadas.
- `META_GRAPH_VERSION`: opcional; padrão atual `v26.0`.
- `CRON_SECRET`: segredo usado pelo Vercel Cron.
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`: já utilizadas pelas funções atuais do projeto.

## Regras de segurança de dados

- Dados manuais existentes são preservados.
- Dias criados pela Meta recebem `source: "meta"` e podem ser atualizados nas sincronizações seguintes.
- Se um dia vindo da Meta for editado manualmente pela interface atual, ele deixa de ser sobrescrito automaticamente.
- Campanhas existentes são vinculadas por `metaObjectId` ou por nome normalizado quando a correspondência é única.
- Anúncios ativos sem correspondente no Rede Leads são criados automaticamente.
- Anúncios antigos/pausados sem correspondente não são importados para evitar poluição.

## Rotina

O cron está configurado para `10:00 UTC`, equivalente a `07:00` em São Paulo enquanto o fuso for UTC-3.
A sincronização diária revisita os últimos 7 dias para capturar ajustes tardios de atribuição da Meta.
