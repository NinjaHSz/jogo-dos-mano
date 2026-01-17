# Sombras entre Amigos - Vercel Ready

Este projeto foi adaptado para rodar no **Vercel** usando **Supabase Realtime**.

## 🚀 Como fazer o Deploy

1.  **Crie um Projeto no Supabase** (Grátis):
    - Vá para [supabase.com](https://supabase.com).
    - Crie um novo projeto.
    - Vá em **Project Settings** > **API**.
    - Tu vais precisar da **Project URL** e da **anon key**.

2.  **Deploy no Vercel**:
    - Conecta o teu repositório GitHub ao Vercel.
    - O Vercel vai detetar os ficheiros estáticos na pasta `public/`.
    - Faz o deploy!

3.  **Configuração Inicial**:
    - Ao abrir o site pela primeira vez, aparecerá um painel pedindo a **URL** e a **Key** do Supabase.
    - Cola os dados do passo 1. Isso será salvo apenas no teu navegador (localStorage).

## 🎮 Mecânicas

- **Sem Servidor**: O jogo agora é 100% "serverless".
- **Realtime**: As mensagens e votos são trocados via Supabase Broadcast.
- **Anfitrião Automático**: O primeiro jogador a entrar na sala é automaticamente o anfitrião. Se ele sair, o próximo jogador assume.

## 📁 Estrutura

- `public/index.html`: Interface WhatsApp Style.
- `public/script.js`: Lógica Supabase Realtime.
- `public/vercel.json`: Configuração de rotas.
