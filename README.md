# 📜 Teleprompter + Gravação para iPhone

Fiz essa ferramenta para ajudar minha esposa a gravar um vídeo de apresentação para uma vaga de emprego. Ela precisava falar olhando para a câmera, sem decorar o texto e sem ficar desviando o olhar para um papel. Então montei um teleprompter que roda direto no Safari do iPhone e já grava o vídeo junto.

O texto rola por cima da imagem da câmera, a palavra que está sendo lida fica em destaque e, no final, o vídeo pode ser salvo direto na galeria.

🔗 **Acesse:** https://teleprompter-iphone.vercel.app

## Funcionalidades

- Editor para colar ou ditar o roteiro (o texto fica salvo no próprio celular)
- Texto rolando sobre a câmera, com faixa de leitura e destaque da palavra atual
- Rolagem que respeita a pontuação: pausa maior em pontos finais, menor em vírgulas e maior ainda entre parágrafos
- Modo ensaio (rola o texto sem gravar)
- Gravação com contagem regressiva de 3 segundos, que para sozinha ao terminar o texto
- Ajustes de velocidade (palavras por minuto), tamanho da fonte e transparência do fundo
- Botões para voltar ao início e pular 5 segundos para frente ou para trás
- Troca entre câmera frontal e traseira
- Tela fica ligada durante a leitura
- Vídeo final salvo em MP4, sem espelhamento, pronto para enviar

## Como usar

1. Abra o link no **Safari** do iPhone.
2. Cole ou dite o texto e toque em **🎥 Abrir câmera**.
3. Permita o acesso à câmera e ao microfone.
4. Use **▶** para ensaiar e o botão vermelho para gravar.
5. Toque no texto para pausar ou retomar a rolagem a qualquer momento.
6. No final, toque em **💾 Salvar / Compartilhar** e escolha **Salvar vídeo**.

> Durante a gravação, não saia do Safari nem bloqueie a tela.

## Estrutura

```
index.html   telas do app (editor, câmera, resultado e erro)
estilos.css  visual
app.js       toda a lógica
```

Não tem dependências nem etapa de build: são só arquivos estáticos.

## Como funciona

### 1. Montagem do texto
`montarTexto()` divide o roteiro em parágrafos (quebras de linha) e em palavras. Cada palavra vira um `<span>`, para que possa ser destacada individualmente.

### 2. Tempo de cada palavra
`calcularTempos()` define em que segundo cada palavra começa a ser lida:

- a base é a velocidade escolhida, em palavras por minuto;
- palavras mais longas ganham um pouco mais de tempo (`pesoDaPalavra()`);
- fim de frase (`. ! ?`) adiciona uma pausa, vírgula adiciona uma pausa menor e fim de parágrafo adiciona mais uma;
- as pausas acompanham a velocidade: quanto mais rápido, mais curtas.

### 3. Rolagem suave
`calcularLinhas()` anota a altura de cada linha do texto na tela e o momento em que ela começa. Em cada quadro, `rolagemNoTempo()` calcula a posição entre a linha atual e a próxima, e o texto desliza de forma contínua até a faixa de leitura.

`palavraNoTempo()` descobre qual palavra está sendo lida, e `destacarPalavra()` apaga as anteriores e pinta a atual de amarelo.

### 4. Animação
`proximoQuadro()` roda via `requestAnimationFrame`, soma o tempo que passou desde o último quadro e redesenha a tela. Quando o texto termina durante uma gravação, ela é encerrada 1,5 s depois.

### 5. Câmera e gravação
- `abrirCamera()` usa `getUserMedia` pedindo vídeo vertical em 1080×1920 e áudio com redução de ruído.
- A pré-visualização da câmera frontal é espelhada (como um espelho), mas o arquivo gravado não.
- `escolherFormato()` testa os formatos suportados; no iPhone o resultado é MP4.
- `iniciarGravacao()` faz a contagem regressiva, cria o `MediaRecorder` e começa a rolagem junto.
- `finalizarGravacao()` junta os pedaços gravados em um arquivo e mostra a tela de resultado.
- `compartilharVideo()` usa a folha de compartilhamento do iOS, de onde dá para salvar na galeria.

### 6. Ajustes salvos
Texto, velocidade, fonte e fundo ficam guardados no `localStorage`, então tudo continua igual ao reabrir a página.

## Requisitos

- iPhone com iOS 14.5 ou superior
- Safari
- Acesso por **https** (a câmera não funciona abrindo o arquivo localmente)

## Rodando localmente

Qualquer servidor estático serve:

```bash
npx serve .
```

Para testar no iPhone, a página precisa estar em https. A forma mais simples é publicar na Vercel:

```bash
vercel deploy --prod
```
