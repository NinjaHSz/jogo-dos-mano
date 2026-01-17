---
description: Como rodar o Jogo Sombras entre Amigos Online
---

Este projeto utiliza Node.js e Socket.io. Siga os passos abaixo para iniciar:

1. **Instalar Dependências**:
   Abra o terminal na pasta do projeto e execute:

   ```bash
   npm install
   ```

2. **Iniciar o Servidor**:
   Execute o comando:

   ```bash
   npm start
   ```

3. **Acessar o Jogo**:
   Abra o navegador em `http://localhost:3000`.
   - Para testar com amigos, você pode usar ferramentas como o **ngrok** para expor sua porta local ou fazer o deploy em plataformas como **Render**, **Railway** ou **Heroku**.

4. **Multiplayer**:
   - O primeiro jogador cria uma sala e recebe um código de 4 dígitos.
   - Os outros jogadores escolhem seus nomes e inserem o código para entrar.
   - O anfitrião (quem criou) clica em "Começar o Caos".
