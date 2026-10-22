# 🧩 Puzzle Studio

Um quebra-cabeça de encaixar peças, feito para jogar **direto no navegador**, no computador ou no celular. Não precisa de login, banco de dados, conta ou API externa.

## Recursos

- **Quatro padrões de encaixes curvos**, com tamanho, profundidade e posição levemente aleatórios; as laterais das peças vizinhas se complementam.
- **Nove níveis de dificuldade:** 12, 24, 48, 96, 150, 300, 500, 750 e 1.000 peças.
- **Quatro ilustrações** incluídas: montanhas, praia, cidade e espaço.
- **Suas próprias fotos** (JPG, PNG e WEBP, até 12 MB), por seleção ou arrastar e soltar; imagens ajustadas automaticamente. Fotos diferentes mantêm progresso separado.
- **Arrastar e soltar** no PC e no celular; também é possível selecionar uma peça e tocar no tabuleiro.
- Giro de 90° pelo botão direito ou tecla R (botão para celular); só encaixa quando a peça estiver corretamente orientada. Encaixe magnético próximo da posição correta; peças encaixadas ficam fixas e as demais podem ser reorganizadas.
- Filtros de peças de borda, centro e todas as peças; bandeja com páginas de 60 peças e zoom de 100 a 400% para puzzles grandes.
- Imagem original, dicas, guia visual opcional e modo tela cheia.
- Cronômetro, contagem de movimentos, progresso e celebração de vitória.
- Salvamento automático via `localStorage`, separado por imagem e dificuldade.
- Interface responsiva, em português.

## Executar localmente

Como o projeto usa módulos ES (`type="module"`), execute com um servidor local em vez de abrir `index.html` diretamente por `file://`:

```bash
# Se você tem Python instalado
python -m http.server 4173
```

Acesse **http://localhost:4173**. Também é possível usar a extensão Live Server no VS Code.

Nenhuma instalação de dependências é necessária para o jogo.

## Testes

Node.js 18+:

```bash
npm test
npm run check
```

Os testes validam a geração até 1.000 peças, quatro padrões, encaixes complementares, rotação, salvamentos, determinismo, embaralhamento, progresso e alinhamento das peças.

## Publicar na Vercel

Importe `GabrielChavesAlencar/quebra-cabeca-studio` em https://vercel.com/new usando o preset **Other** e diretório raiz `./`. O projeto é estático e não requer comando de build. Após conectar o GitHub, novos commits em `main` podem gerar publicações automáticas.

## Publicar no GitHub Pages

1. Crie um repositório com o nome `quebra-cabeca-studio` no GitHub.
2. Faça upload de **todo o conteúdo desta pasta**, mantendo `index.html` na raiz. Alternativamente, use Git:

   ```bash
   git init
   git add .
   git commit -m "feat: criar Puzzle Studio"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/quebra-cabeca-studio.git
   git push -u origin main
   ```

3. Acesse **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Para publicar pelo GitHub Pages, configure um workflow específico de Pages. O workflow atual executa apenas os testes, pois a publicação principal é feita pela Vercel.
5. O endereço será semelhante a `https://SEU_USUARIO.github.io/quebra-cabeca-studio/`.

> **Observação:** o deploy exige Pages habilitado no repositório e permissão para o GitHub Actions. Em repositórios privados, a disponibilidade do GitHub Pages depende do plano.

## Arquivos

```text
index.html              Interface
style.css               Estilos responsivos
app.js                  Controles e renderização em Canvas
logic.js                Lógica pura e testável das peças
assets/*.svg            Ilustrações de exemplo
favicon.svg             Ícone da aba
.github/workflows/      Testes e publicação GitHub Pages
tests/logic.test.js     Testes automatizados
```

## Privacidade e progresso

O progresso e a foto enviada ficam **no armazenamento local do navegador**. Não há envio de imagens ou dados para servidores. Armazenamentos restritos, limpeza de dados do navegador e modo anônimo podem impedir a recuperação da partida. Para usar uma foto diferente, envie-a novamente.

## Licença

Código sob licença MIT. Ilustrações SVG autorais incluídas no projeto.