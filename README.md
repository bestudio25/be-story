# BE STORY · Memórias

Plataforma da **BE Studio Audiovisual** para entregar as coberturas de storymaker aos clientes: abertura Polaroid, linha do tempo em capítulos, galeria completa, downloads (original, versão leve e ZIP), clipe 9:16 pronto para postar, bilhete de volta e indicação.

- Site do cliente: `memorias.bestudiomkt.com.br/<evento>` (ex.: `/aline-e-helio`)
- Painel: `memorias.bestudiomkt.com.br/admin`
- Demonstração comercial: `memorias.bestudiomkt.com.br/demo`

## Como funciona

```
Google Drive (acervo da BE)          Netlify (site + painel + APIs)          Cloudflare R2 (mídia)
  Casamento X/                 ──▶   "Gerar site" lê a pasta          ──▶   miniaturas, posters, MP4 1080p/720p,
    01. Making of/ → capítulo        e coloca os arquivos na fila           cópia dos originais e ZIPs
    02. Cerimônia/ → capítulo                │                                      ▲
    Reels_Casal.mov → clipe + filme          ▼                                      │
                                    Neon (Postgres): eventos, capítulos,     GitHub Actions (worker com ffmpeg)
                                    arquivos, fila, métricas, bilhetes  ◀──  processa a fila e grava no R2
```

- **Pastas viram capítulos**, subpastas viram subcapítulos ("01. Making of" aparece como "Making of").
- O arquivo **`Reels_…` na raiz** da pasta é sempre o **clipe pronto (9:16)** e o **filme** do botão "Assistir ao filme". Ele não entra na galeria.
- As pastas do Drive **não ficam públicas**: uma conta de serviço só com leitura acessa a pasta-mãe dos eventos.
- O cliente nunca acessa o Drive: assiste às versões web e baixa os originais por links assinados que expiram.
- Ao **expirar ou arquivar** um evento, as versões web e as cópias saem do R2. Os originais continuam no Drive, e dá para reativar.

## Fluxo no painel

1. **Novo evento**: nomes, tipo, data, endereço e link da pasta do Drive → "Gerar site".
2. **Carta**: texto da abertura e legenda sugerida.
3. **Arquivos**: sincronizar com o Drive, enviar arquivos direto (arrastar pastas, com retomada), organizar capítulos (renomear, ordenar, esconder), mover, renomear em lote, destaques, tags e capa dos vídeos.
4. **Capas**: foto da Polaroid, capa, Polaroid final, fotos do fundo do hero, Reels e filme.
5. **Publicar**: status, endereço, palavra-chave, validade, tema e cor, link, QR Code e mensagem pronta para WhatsApp.
6. **Métricas**: aberturas, revelações, visualizações, tempo assistido, downloads, ZIPs, compartilhamentos, indicações e bilhetes.

## Publicação (passo a passo)

### 1. Banco de dados (Neon)
1. Em neon.tech, crie o projeto **be-story** (região São Paulo, se houver).
2. Copie a **Connection string** (com `?sslmode=require`). Ela é o `DATABASE_URL`.

### 2. Armazenamento (Cloudflare R2)
1. Em Cloudflare → R2, crie o bucket **be-story-media**.
2. Em R2 → *Manage API tokens*, crie um token com permissão **Object Read & Write** só para esse bucket. Guarde o **Access Key ID**, a **Secret Access Key** e o **Account ID**.
3. No bucket → *Settings* → **CORS policy**, cole:
```json
[
  {
    "AllowedOrigins": ["https://memorias.bestudiomkt.com.br"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
Sem o CORS, o envio direto pelo painel e o "Gerar minha Polaroid" não funcionam.

### 3. Leitura do Drive (Google Cloud)
1. Em console.cloud.google.com, crie o projeto **be-story** e ative a **Google Drive API**.
2. Em *IAM e administrador → Contas de serviço*, crie **be-story-drive**, abra a conta → *Chaves* → *Adicionar chave* → **JSON**.
3. Do JSON baixado: `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`; `private_key` → `GOOGLE_SERVICE_ACCOUNT_KEY` (inteira, com `-----BEGIN…`).
4. No Drive, compartilhe a pasta-mãe **"Audiovisual - Eventos"** com o `client_email` como **Leitor**.

### 4. Código e worker (GitHub)
1. Repositório privado **be-story** com este código.
2. Em *Settings → Secrets and variables → Actions*, cadastre: `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY` e, se usar e-mail, `RESEND_API_KEY` e `EMAIL_FROM`.
3. Crie um **token** (*Settings → Developer settings → Fine-grained tokens*) só para o repositório be-story, com permissão **Contents: Read and write**. Ele vai para a Netlify como `GITHUB_TOKEN`, para o painel acordar o worker na hora.

### 5. Site (Netlify)
1. *Add new site → Import from GitHub* → be-story. O `netlify.toml` já configura tudo.
2. Em *Site configuration → Environment variables*, cadastre as variáveis do `.env.example` (`SESSION_SECRET`, `SETUP_TOKEN`, `DATABASE_URL`, `R2_*`, `GOOGLE_*`, `GITHUB_REPO`, `GITHUB_TOKEN`, `NEXT_PUBLIC_*`, `BE_NOTIFY_EMAIL`).
3. Faça o deploy. O build aplica o esquema do banco automaticamente.
4. *Domain management → Add domain* → `memorias.bestudiomkt.com.br`.

### 6. Endereço (Registro.br)
Em registro.br → bestudiomkt.com.br → **DNS → Editar zona**, adicione:

| Tipo  | Nome     | Valor                              |
|-------|----------|------------------------------------|
| CNAME | memorias | `<nome-do-site>.netlify.app`       |

Depois de propagar (minutos a algumas horas), a Netlify emite o HTTPS sozinha.

### 7. Primeiro acesso
Abra `https://memorias.bestudiomkt.com.br/admin/login?setup=<SETUP_TOKEN>` e crie sua conta. Depois disso o link de configuração para de funcionar.

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local      # preencha DATABASE_URL; use STORAGE_DRIVER=local para não precisar do R2
npm run db:migrate
npm run dev                      # site + painel em http://localhost:3000
npm run worker                   # processa a fila (precisa de ffmpeg; exiftool e heif-convert são opcionais)
```
Com `STORAGE_DRIVER=local` e `LOCAL_SOURCE_DIR`, dá para criar eventos com a pasta `local:<subpasta>` no lugar do link do Drive.

## Custos (referência, out/2026)
Netlify, Neon e GitHub Actions cabem nos planos gratuitos no volume atual. O R2 cobra US$ 0,015 por GB/mês acima de 10 GB, e a saída de arquivos é grátis. A tela **Armazenamento** do painel mostra o uso e a estimativa.
