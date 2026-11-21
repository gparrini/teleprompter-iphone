// Teleprompter + gravação de vídeo para iPhone (Safari).
// Visão geral do funcionamento no README.md.

const el = id => document.getElementById(id);

const TEXTO_EXEMPLO =
  "Olá, meu nome é [seu nome] e gostaria de me apresentar para essa oportunidade.\n\n" +
  "Conte aqui um pouco da sua experiência e das habilidades que você desenvolveu.\n\n" +
  "Fale sobre o que te diferencia e por que você quer fazer parte da empresa.\n\n" +
  "Agradeço pela oportunidade!";

// Altura (de 0 a 1) da faixa de leitura dentro da janela do texto.
const POSICAO_LEITURA = 0.32;

// Chaves usadas para guardar o texto e os ajustes no navegador.
const CHAVES = { texto: 'tpi_text', velocidade: 'tpi_wpm', fonte: 'tpi_fs', fundo: 'tpi_bg' };

// ---------- Estado do teleprompter ----------
let palavras = [];          // { texto, fimDoParagrafo }
let elementosPalavra = [];  // <span> de cada palavra
let inicioPalavra = [];     // segundo em que cada palavra começa a ser lida
let marcosLinha = [];       // { tempo, y } do início de cada linha do texto
let duracaoTotal = 0;
let tempoAtual = 0;
let palavraAtual = -1;
let rolando = false;
let contando = false;
let ultimoQuadro = 0;
let travaDeTela = null;

// ---------- Estado da câmera e da gravação ----------
let fluxoCamera = null;
let gravador = null;
let pedacosVideo = [];
let gravando = false;
let cameraAtual = 'user';   // 'user' = frontal, 'environment' = traseira
let inicioGravacao = 0;
let relogioGravacao = null;
let arquivoFinal = null;
let urlFinal = null;


// ================= Utilidades =================

function lerSalvo(chave, padrao) {
  try {
    const valor = localStorage.getItem(chave);
    return valor === null ? padrao : valor;
  } catch (e) {
    return padrao;
  }
}

function salvar(chave, valor) {
  try { localStorage.setItem(chave, valor); } catch (e) {}
}

// 75 -> "1:15"
function formatarTempo(segundos) {
  const s = Math.max(0, Math.round(segundos));
  const minutos = Math.floor(s / 60);
  const resto = String(s % 60).padStart(2, '0');
  return minutos + ':' + resto;
}

function mostrar(id, modo = 'block') { el(id).style.display = modo; }
function esconder(id) { el(id).style.display = 'none'; }
function estaVisivel(id) { return el(id).style.display !== 'none' && el(id).style.display !== ''; }


// ================= Montagem do texto =================

// Quebra o roteiro em parágrafos e palavras, criando um <span> para cada palavra.
function montarTexto() {
  const roteiro = el('roteiro').value.replace(/\r/g, '').trim();
  const caixa = el('texto');
  caixa.innerHTML = '';
  palavras = [];
  elementosPalavra = [];

  const paragrafos = roteiro.split(/\n+/).map(p => p.trim()).filter(p => p !== '');

  for (const paragrafo of paragrafos) {
    const div = document.createElement('div');
    div.className = 'paragrafo';
    const lista = paragrafo.split(/\s+/);

    lista.forEach((palavra, i) => {
      const span = document.createElement('span');
      span.textContent = palavra;
      div.appendChild(span);
      div.appendChild(document.createTextNode(' '));

      elementosPalavra.push(span);
      palavras.push({ texto: palavra, fimDoParagrafo: i === lista.length - 1 });
    });

    caixa.appendChild(div);
  }

  calcularTempos();
  calcularLinhas();
}


// ================= Tempo de leitura =================

// Palavras mais longas ficam um pouco mais de tempo na tela.
function pesoDaPalavra(palavra) {
  const letras = palavra.replace(/[^\p{L}\p{N}]/gu, '').length;
  return 0.75 + 0.05 * Math.min(letras, 14);
}

const terminaFrase = palavra => /[.!?…]["'”’)»]*$/.test(palavra);
const terminaComVirgula = palavra => /[,;:—–]["'”’)»]*$/.test(palavra);

// Define em que segundo cada palavra começa, de acordo com a velocidade
// escolhida (palavras por minuto) e com as pausas de pontuação.
function calcularTempos() {
  inicioPalavra = [];
  duracaoTotal = 0;
  if (palavras.length === 0) return;

  const palavrasPorMinuto = Number(el('velocidade').value);
  const segundosPorPalavra = 60 / palavrasPorMinuto;
  const escalaPausa = 140 / palavrasPorMinuto; // pausas acompanham a velocidade

  const pesos = palavras.map(p => pesoDaPalavra(p.texto));
  const pesoMedio = pesos.reduce((soma, peso) => soma + peso, 0) / pesos.length;

  let tempo = 0;
  palavras.forEach((palavra, i) => {
    inicioPalavra.push(tempo);

    let duracao = segundosPorPalavra * pesos[i] / pesoMedio;
    if (terminaFrase(palavra.texto)) duracao += 0.55 * escalaPausa;
    else if (terminaComVirgula(palavra.texto)) duracao += 0.28 * escalaPausa;
    if (palavra.fimDoParagrafo) duracao += 0.6 * escalaPausa;

    tempo += duracao;
  });

  duracaoTotal = tempo;
}

// Marca o tempo e a altura de cada linha visual do texto.
// A rolagem anda suavemente de uma linha para a próxima.
function calcularLinhas() {
  marcosLinha = [];
  let alturaAnterior = null;

  elementosPalavra.forEach((span, i) => {
    const altura = span.offsetTop;
    if (altura !== alturaAnterior) {
      marcosLinha.push({ tempo: inicioPalavra[i], y: altura });
      alturaAnterior = altura;
    }
  });

  if (marcosLinha.length > 0) {
    const ultima = marcosLinha[marcosLinha.length - 1];
    marcosLinha.push({ tempo: duracaoTotal, y: ultima.y });
  }

  palavraAtual = -1;
  desenhar();
}

// Quanto o texto deve estar rolado em um determinado segundo.
function rolagemNoTempo(tempo) {
  if (marcosLinha.length === 0) return 0;

  let i = 0;
  while (i < marcosLinha.length - 2 && marcosLinha[i + 1].tempo <= tempo) i++;

  const linha = marcosLinha[i];
  const proxima = marcosLinha[i + 1] || linha;
  if (proxima.tempo <= linha.tempo) return linha.y;

  const progresso = Math.min(1, Math.max(0, (tempo - linha.tempo) / (proxima.tempo - linha.tempo)));
  return linha.y + (proxima.y - linha.y) * progresso;
}

// Qual palavra está sendo lida em um determinado segundo.
function palavraNoTempo(tempo) {
  if (inicioPalavra.length === 0) return -1;

  let i = 0;
  while (i < inicioPalavra.length - 1 && inicioPalavra[i + 1] <= tempo) i++;
  return i;
}


// ================= Desenho na tela =================

// Palavras já lidas ficam apagadas e a atual fica em destaque.
function destacarPalavra(indice) {
  if (indice === palavraAtual) return;

  elementosPalavra.forEach((span, i) => {
    if (i < indice) span.className = 'lida';
    else if (i === indice) span.className = 'atual';
    else span.className = '';
  });

  palavraAtual = indice;
}

function desenhar() {
  const alturaJanela = el('janelaTexto').clientHeight;
  const deslocamento = alturaJanela * POSICAO_LEITURA - rolagemNoTempo(tempoAtual);
  el('texto').style.transform = `translate3d(0, ${deslocamento}px, 0)`;

  const porcentagem = duracaoTotal ? (tempoAtual / duracaoTotal) * 100 : 0;
  el('barraProgresso').style.width = porcentagem + '%';

  destacarPalavra(palavraNoTempo(tempoAtual));
  el('tempo').textContent = formatarTempo(tempoAtual) + ' / ' + formatarTempo(duracaoTotal);
}


// ================= Rolagem =================

function proximoQuadro(agora) {
  if (!rolando) return;

  const passou = Math.min(0.1, (agora - ultimoQuadro) / 1000);
  ultimoQuadro = agora;
  tempoAtual += passou;

  if (tempoAtual >= duracaoTotal) {
    tempoAtual = duracaoTotal;
    desenhar();
    pausarRolagem();
    // Espera 1,5s depois da última palavra antes de encerrar a gravação.
    if (gravando) setTimeout(() => { if (gravando) pararGravacao(); }, 1500);
    return;
  }

  desenhar();
  requestAnimationFrame(proximoQuadro);
}

function iniciarRolagem() {
  if (rolando) return;
  if (tempoAtual >= duracaoTotal) tempoAtual = 0;

  rolando = true;
  el('btnEnsaiar').textContent = '⏸';
  ultimoQuadro = performance.now();
  manterTelaLigada();
  requestAnimationFrame(proximoQuadro);
}

function pausarRolagem() {
  rolando = false;
  el('btnEnsaiar').textContent = '▶';
  if (!gravando) liberarTela();
}

function alternarRolagem() {
  if (rolando) pausarRolagem();
  else iniciarRolagem();
}

function voltarAoInicio() {
  tempoAtual = 0;
  palavraAtual = -1;
  desenhar();
}

function pular(segundos) {
  tempoAtual = Math.min(duracaoTotal, Math.max(0, tempoAtual + segundos));
  palavraAtual = -1;
  desenhar();
}

// Impede que o iPhone apague a tela no meio da leitura.
async function manterTelaLigada() {
  try {
    if ('wakeLock' in navigator) travaDeTela = await navigator.wakeLock.request('screen');
  } catch (e) {}
}

function liberarTela() {
  try {
    if (travaDeTela) {
      travaDeTela.release();
      travaDeTela = null;
    }
  } catch (e) {}
}


// ================= Contagem regressiva =================

// Retorna true se a contagem chegou ao fim, false se foi cancelada.
async function contagemRegressiva() {
  contando = true;
  mostrar('contagem', 'flex');

  for (let n = 3; n >= 1 && contando; n--) {
    el('contagem').textContent = n;
    await new Promise(resolve => setTimeout(resolve, 900));
  }

  esconder('contagem');
  const terminou = contando;
  contando = false;
  return terminou;
}

function cancelarContagem() {
  contando = false;
  esconder('contagem');
}


// ================= Câmera =================

function mostrarErro(mensagem) {
  el('erroMensagem').textContent = mensagem;
  mostrar('erro', 'flex');
}

function desligarCamera() {
  if (fluxoCamera) {
    fluxoCamera.getTracks().forEach(trilha => trilha.stop());
    fluxoCamera = null;
  }
}

async function abrirCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    mostrarErro('Este navegador não liberou a câmera. Abra esta página pelo Safari, em um endereço https (não como arquivo salvo no iPhone).');
    return false;
  }
  if (!window.MediaRecorder) {
    mostrarErro('Este iOS não suporta gravação pelo navegador. Atualize o iPhone para o iOS 14.5 ou superior.');
    return false;
  }

  desligarCamera();

  try {
    fluxoCamera = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: cameraAtual }, width: { ideal: 1080 }, height: { ideal: 1920 }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true }
    });

    const video = el('camera');
    video.srcObject = fluxoCamera;
    // Só a pré-visualização da câmera frontal é espelhada; o vídeo gravado sai normal.
    video.classList.toggle('espelhada', cameraAtual === 'user');
    try { await video.play(); } catch (e) {}
    return true;
  } catch (e) {
    const tipo = e && e.name;
    if (tipo === 'NotAllowedError') {
      mostrarErro('Permissão negada. Vá em Ajustes > Safari > Câmera e Microfone, escolha “Perguntar” ou “Permitir” e abra a página de novo.');
    } else if (tipo === 'NotFoundError') {
      mostrarErro('Nenhuma câmera ou microfone encontrado.');
    } else {
      mostrarErro('Erro ao acessar câmera/microfone: ' + (tipo || e));
    }
    return false;
  }
}

async function trocarCamera() {
  cameraAtual = cameraAtual === 'user' ? 'environment' : 'user';
  await abrirCamera();
}


// ================= Gravação =================

// O iPhone grava em MP4; outros navegadores podem preferir WebM.
function escolherFormato() {
  const formatos = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  for (const formato of formatos) {
    try {
      if (MediaRecorder.isTypeSupported(formato)) return formato;
    } catch (e) {}
  }
  return '';
}

// Durante a gravação, os outros botões ficam bloqueados.
function bloquearControles(bloquear) {
  ['btnEditar', 'btnEnsaiar', 'btnTrocarCamera', 'btnAjustes'].forEach(id => {
    el(id).disabled = bloquear;
  });
  el('btnGravar').classList.toggle('gravando', bloquear);

  if (bloquear) {
    mostrar('indicadorGravacao', 'flex');
    mostrar('aviso');
    esconder('ajustes');
  } else {
    esconder('indicadorGravacao');
    esconder('aviso');
  }
}

function criarGravador() {
  const formato = escolherFormato();
  try {
    if (formato) return new MediaRecorder(fluxoCamera, { mimeType: formato, videoBitsPerSecond: 8000000 });
    return new MediaRecorder(fluxoCamera);
  } catch (e) {
    return new MediaRecorder(fluxoCamera);
  }
}

async function iniciarGravacao() {
  if (gravando || contando) return;
  if (!fluxoCamera && !(await abrirCamera())) return;

  pausarRolagem();
  voltarAoInicio();
  if (!(await contagemRegressiva())) return;

  try {
    gravador = criarGravador();
  } catch (e) {
    mostrarErro('Não consegui iniciar a gravação: ' + (e.name || e));
    return;
  }

  pedacosVideo = [];
  gravador.ondataavailable = evento => {
    if (evento.data && evento.data.size) pedacosVideo.push(evento.data);
  };
  gravador.onstop = finalizarGravacao;
  gravador.start(1000);

  gravando = true;
  bloquearControles(true);

  inicioGravacao = performance.now();
  relogioGravacao = setInterval(() => {
    el('tempoGravacao').textContent = formatarTempo((performance.now() - inicioGravacao) / 1000);
  }, 500);

  manterTelaLigada();
  iniciarRolagem();
}

function pararGravacao() {
  if (!gravando) return;

  gravando = false;
  clearInterval(relogioGravacao);
  pausarRolagem();
  try { gravador.stop(); } catch (e) {}
  bloquearControles(false);
}

// Junta os pedaços gravados em um arquivo e mostra a tela de resultado.
function finalizarGravacao() {
  const tipo = (gravador && gravador.mimeType) || (pedacosVideo[0] && pedacosVideo[0].type) || 'video/mp4';
  const video = new Blob(pedacosVideo, { type: tipo });

  if (urlFinal) URL.revokeObjectURL(urlFinal);
  urlFinal = URL.createObjectURL(video);

  const extensao = tipo.includes('mp4') ? 'mp4' : 'webm';
  arquivoFinal = new File([video], 'apresentacao.' + extensao, { type: tipo });

  const player = el('videoFinal');
  player.src = urlFinal;
  player.load();
  mostrar('resultado', 'flex');
  liberarTela();
}

function baixarVideo() {
  if (!arquivoFinal) return;
  const link = document.createElement('a');
  link.href = urlFinal;
  link.download = arquivoFinal.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// No iPhone abre a folha de compartilhamento, onde dá para "Salvar vídeo".
async function compartilharVideo() {
  if (!arquivoFinal) return;
  try {
    if (navigator.canShare && navigator.canShare({ files: [arquivoFinal] })) {
      await navigator.share({ files: [arquivoFinal], title: 'Apresentação' });
    } else {
      baixarVideo();
    }
  } catch (e) {
    // Cancelado pelo usuário.
  }
}


// ================= Ajustes =================

function aplicarVelocidade(valor) {
  const palavraLida = Math.max(0, palavraNoTempo(tempoAtual));
  el('velocidade').value = valor;
  el('velocidadeValor').textContent = valor;
  calcularTempos();
  // Continua da mesma palavra, agora no novo ritmo.
  tempoAtual = inicioPalavra.length ? inicioPalavra[palavraLida] : 0;
  calcularLinhas();
}

function aplicarFonte(valor) {
  el('fonte').value = valor;
  el('fonteValor').textContent = valor;
  document.documentElement.style.setProperty('--tamanho-fonte', valor + 'px');
}

function aplicarFundo(valor) {
  el('fundo').value = valor;
  el('fundoValor').textContent = valor + '%';
  document.documentElement.style.setProperty('--opacidade-fundo', valor / 100);
}


// ================= Botões e eventos =================

el('btnAbrirCamera').onclick = async () => {
  if (!el('roteiro').value.trim()) return;
  esconder('editor');
  mostrar('palco');
  tempoAtual = 0;
  montarTexto();
  await abrirCamera();
};

el('btnLimpar').onclick = () => {
  el('roteiro').value = '';
  salvar(CHAVES.texto, '');
  el('roteiro').focus();
};

el('roteiro').addEventListener('input', () => salvar(CHAVES.texto, el('roteiro').value));

el('btnEditar').onclick = () => {
  pausarRolagem();
  desligarCamera();
  esconder('palco');
  mostrar('editor', 'flex');
};

el('btnGravar').onclick = () => {
  if (gravando) pararGravacao();
  else iniciarGravacao();
};

el('btnEnsaiar').onclick = () => {
  if (contando) cancelarContagem();
  else alternarRolagem();
};

el('btnTrocarCamera').onclick = trocarCamera;

el('btnAjustes').onclick = () => {
  if (estaVisivel('ajustes')) esconder('ajustes');
  else mostrar('ajustes', 'flex');
};

el('btnInicio').onclick = () => { pausarRolagem(); voltarAoInicio(); };
el('btnVoltar').onclick = () => pular(-5);
el('btnAvancar').onclick = () => pular(5);

el('velocidade').oninput = e => {
  aplicarVelocidade(e.target.value);
  salvar(CHAVES.velocidade, e.target.value);
};

el('fonte').oninput = e => {
  aplicarFonte(e.target.value);
  calcularLinhas();
  salvar(CHAVES.fonte, e.target.value);
};

el('fundo').oninput = e => {
  aplicarFundo(e.target.value);
  salvar(CHAVES.fundo, e.target.value);
};

// Tocar no texto pausa ou retoma a rolagem (a gravação continua).
el('janelaTexto').addEventListener('click', () => {
  esconder('ajustes');
  if (contando) cancelarContagem();
  else alternarRolagem();
});

el('btnCompartilhar').onclick = compartilharVideo;
el('btnBaixar').onclick = baixarVideo;

el('btnGravarDeNovo').onclick = async () => {
  esconder('resultado');
  el('videoFinal').pause();
  voltarAoInicio();
  if (!fluxoCamera) await abrirCamera();
};

el('btnFecharErro').onclick = () => esconder('erro');

// Ao sair do Safari, pausa o ensaio; ao voltar, religa a pré-visualização.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && rolando && !gravando) pausarRolagem();
  if (!document.hidden && fluxoCamera && estaVisivel('palco')) {
    try { el('camera').play(); } catch (e) {}
  }
});

// Ao girar o celular, as linhas mudam de lugar e precisam ser recalculadas.
window.addEventListener('resize', () => {
  if (estaVisivel('palco')) calcularLinhas();
});
window.addEventListener('orientationchange', () => {
  setTimeout(() => { if (estaVisivel('palco')) calcularLinhas(); }, 300);
});


// ================= Início =================

el('roteiro').value = lerSalvo(CHAVES.texto, TEXTO_EXEMPLO) || '';
aplicarVelocidade(lerSalvo(CHAVES.velocidade, '140'));
aplicarFonte(lerSalvo(CHAVES.fonte, '34'));
aplicarFundo(lerSalvo(CHAVES.fundo, '55'));
