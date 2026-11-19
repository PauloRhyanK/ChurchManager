// O painel do culto ao vivo.
//
// ESTA TELA NAO DECIDE NADA. Ela le o retrato (GET /api/painel), desenha, e
// pede (POST /api/painel/acao). Quem decide a ordem, a letra e a luz e a ponte
// do PC principal. O unico relogio que mora aqui e o de enfeite: entre uma
// leitura e outra, a contagem do proximo slide e a agulha da linha do tempo
// andam sozinhas, a partir do que o servidor disse por ultimo.
//
// A mesma tela serve no PC, no celular e na versao web. Na web ela so mostra
// o louvor (passar slide com 4 segundos de atraso seria pior que nao passar)
// e nao tem a imagem ao vivo.

'use strict';

const $ = id => document.getElementById(id);
const esc = texto => String(texto == null ? '' : texto).replace(/[&<>"']/g,
  c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

let D = null;             // o ultimo retrato
let C = null;             // o conteudo (a letra das musicas do dia)
let buscandoConteudo = false;
let semContato = 0;
let ocupado = false;
let recadosAbertos = false;
let luzAberta = false;
let lidoEm = 0;           // performance.now() da ultima leitura
const jaPintado = {};

const guardado = {
  ler(chave) { try { return localStorage.getItem(chave); } catch (e) { return null; } },
  gravar(chave, valor) { try { localStorage.setItem(chave, valor); } catch (e) { /* modo privado */ } },
};
const NESTE_PC = ['localhost', '127.0.0.1', '[::1]'].indexOf(location.hostname) >= 0;

function pintar(id, html) {
  if (jaPintado[id] === html) return;
  jaPintado[id] = html;
  $(id).innerHTML = html;
}
function mostrar(id, sim) { $(id).hidden = !sim; }

// Todo botao da tela e um <button data-a='{"tipo": ...}'>. Um ouvinte so, la
// embaixo, cuida de todos: a tela e redesenhada o tempo todo, e ouvinte preso
// a botao que some seria vazamento.
function botao(rotulo, acao, o) {
  o = o || {};
  return '<button type="button" class="' + (o.classe || 'bt') + '"' +
    ' data-a="' + esc(JSON.stringify(acao)) + '"' +
    (o.confirmar ? ' data-c="' + esc(JSON.stringify(o.confirmar)) + '"' : '') +
    (o.apertado != null ? ' aria-pressed="' + (o.apertado ? 'true' : 'false') + '"' : '') +
    (o.titulo ? ' title="' + esc(o.titulo) + '"' : '') +
    (o.desligado || ocupado || !podeAgir() ? ' disabled' : '') + '>' + rotulo + '</button>';
}

// Na web so da para pedir se a igreja esta viva e aceitando comandos.
function podeAgir() {
  if (!D) return false;
  if (D.local !== false) return semContato <= 2;
  return !!D.viva && !!(D.remoto && D.remoto.aceita);
}
// As acoes do louvor so existem na rede da igreja.
function podeConduzir() { return !!D && D.local !== false && semContato <= 2; }

function relogio(segundos) {
  if (segundos == null || isNaN(segundos)) return '—';
  const s = Math.max(0, Math.floor(segundos));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function duracao(ms) {
  if (ms == null) return '—';
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':');
}
function emMinutos(segundos) { return Math.max(1, Math.round(Math.abs(segundos) / 60)); }

// ---------------------------------------------------------- quem e voce --
function meuNome() {
  const salvo = guardado.ler('ponte-aparelho');
  if (salvo) return salvo;
  if (NESTE_PC && D && D.maquina) return D.maquina;
  return null;
}
async function garantirNome() {
  if (meuNome()) return meuNome();
  const palpite = matchMedia('(pointer: coarse)').matches ? 'Celular' : 'Computador';
  const nome = await perguntar({titulo: 'Como chamar este aparelho?',
    texto: 'O painel mostra a todos quem está passando a letra.', sim: 'Pronto', campo: palpite});
  guardado.gravar('ponte-aparelho', (nome || palpite).trim().slice(0, 30) || palpite);
  return meuNome();
}

// ------------------------------------------------------------- o retrato --
function sistema(nome) { return ((D.sistemas || []).filter(s => s.nome === nome)[0]) || null; }
function musicaAtual() {
  const l = D.louvor;
  if (!l || !l.musica || !C) return null;
  return (C.musicas || []).filter(m => m.id === l.musica.id)[0] || null;
}
// Onde a musica esta AGORA, andando sozinha desde a ultima leitura.
function posicaoAgora() {
  const r = D && D.louvor && D.louvor.relogio;
  if (!r || r.posicao == null) return null;
  return r.posicao + (r.tocando ? (performance.now() - lidoEm) / 1000 : 0);
}

function desenhar() {
  const d = D;
  mostrar('simulacao', !!d.simulacao);
  $('nome').textContent = (d.ordem && d.ordem.nome) || 'Ponte do Culto';
  const ag = d.agenda || {};
  $('atraso').textContent = ag.texto || '';
  $('atraso').className = 'atraso ' + (ag.estado || '');
  desenharPilulas(d);
  desenharFaixas(d);
  desenharMenu(d);
  desenharOrdem(d);
  desenharEquipamentos(d);
  desenharCentro(d);
  desenharMusicas(d);
  desenharLuz(d);
  desenharTransmissao(d);
  desenharTelao(d);
  desenharHistorico(d);
  andar();
}

function desenharPilulas(d) {
  const p = [];
  const por = (nome, cor, alerta) => p.push('<span class="pilula' + (alerta ? ' ' + alerta : '') + '">' +
    '<span class="ponto ' + cor + '" aria-hidden="true"></span>' + esc(nome) + '</span>');
  const tx = sistema('Transmissão'), t = d.transmissao;
  if (tx && tx.estado === 'erro') por('Transmissão sem contato', 'vermelho', 'grave');
  else if (t) {
    por(t.no_ar ? 'Transmitindo' : 'Fora do ar', t.no_ar ? 'vermelho' : '');
    por(t.gravando ? 'Gravando' : 'Sem gravar', t.gravando ? 'verde' : '');
  }
  const som = (d.equipamentos || []).filter(e => e.nome === 'PC do som' || /som/i.test(e.nome))[0];
  if (som) por(som.cor === 'verde' ? 'Som' : 'Som sem contato', som.cor, som.cor === 'verde' ? '' : 'grave');
  const letra = sistema('Telão');
  if (letra && letra.estado !== 'desligado') por(letra.estado === 'ok' ? 'Letra' : 'Letra sem contato',
    letra.estado === 'ok' ? 'verde' : 'vermelho', letra.estado === 'ok' ? '' : 'grave');
  const luz = sistema('Luz');
  if (luz && luz.estado !== 'desligado') por(luz.estado === 'ok' ? 'Luz' : 'Luz sem contato',
    luz.estado === 'ok' ? 'verde' : 'vermelho', luz.estado === 'ok' ? '' : 'grave');
  if (d.internet) {
    if (d.internet.estado === 'boa') por('Internet', 'verde');
    else if (d.internet.estado === 'lenta') por('Internet lenta', 'ambar', 'alerta');
    else por('Sem internet', 'vermelho', 'grave');
  }
  pintar('pilulas', p.join(''));
}

function desenharFaixas(d) {
  const f = [];
  if (semContato > 2) {
    f.push('<div class="faixa erro"><span><b>Perdi o contato com a ponte.</b> ' +
      (d.local === false ? 'Confira a internet deste aparelho.' : 'A janela preta ainda está aberta no PC?') + '</span></div>');
  }
  if (d.erro) f.push('<div class="faixa erro"><span>' + esc(d.erro) + '</span></div>');
  if (d.local === false && d.viva && d.remoto && !d.remoto.aceita) {
    f.push('<div class="faixa aviso"><span><b>Só para acompanhar.</b> Os comandos pela web estão desligados no PC da igreja.</span></div>');
  }
  (d.sistemas || []).filter(s => s.estado === 'erro').forEach(s =>
    f.push('<div class="faixa aviso"><span><b>' + esc(s.nome) + ':</b> ' + esc(s.detalhe) + '</span></div>'));
  const at = d.atualizacao;
  if (d.local && at) {
    if (at.aplicando) f.push('<div class="faixa nota"><span><b>Atualizando.</b> A ponte vai sumir por alguns segundos e voltar sozinha.</span></div>');
    else if (at.disponivel) f.push('<div class="faixa nota"><span><b>Há uma atualização da Ponte.</b> Leva menos de um minuto; a tela some e volta sozinha.</span>' +
      '<button type="button" class="bt forte pequeno" id="bt-atualizar"' + (ocupado ? ' disabled' : '') + '>Atualizar agora</button></div>');
  }
  pintar('faixas', f.join(''));
}

function desenharMenu(d) {
  const local = d.local !== false;
  let m = '<a href="' + (local ? '/aqui' : '/chegada') + '">Chegada: preparar o culto</a>';
  if (local) {
    m += '<a href="/letras">Letras do dia</a><a href="/louvor">Marcar o tempo das músicas</a>' +
      '<a href="/youtube">Transmissão no YouTube</a>' +
      '<a href="/cenas">Montar uma cena de luz</a><a href="/estudio">Estúdio de luz: testar ideias</a>' +
      '<a href="/baixar">Baixar o projeto para outro PC</a>';
    if ((d.ordens || []).length) {
      m += '<label>Ordem do culto de hoje<select id="troca-ordem">' + d.ordens.map(o =>
        '<option value="' + esc(o.id) + '"' + (d.ordem && o.id === d.ordem.id ? ' selected' : '') + '>' + esc(o.nome) + '</option>').join('') + '</select></label>';
    }
    m += '<div class="bloco"><span class="miudo">Este aparelho aparece como <b>' + esc(meuNome() || 'sem nome') + '</b></span>' +
      '<button type="button" class="bt pequeno" id="bt-nome">Trocar o nome</button></div>';
    if (d.imagem && d.imagem.disponivel) {
      m += '<div class="bloco"><span class="miudo">Imagem da transmissão no painel</span><div class="par">' +
        '<button type="button" data-imagem="1" aria-pressed="' + (d.imagem.ativa ? 'true' : 'false') + '">Mostrar</button>' +
        '<button type="button" data-imagem="0" aria-pressed="' + (d.imagem.ativa ? 'false' : 'true') + '">Não mostrar</button></div></div>';
    }
    if (d.louvor && d.louvor.relogio && d.louvor.relogio.fonte === 'navegador') {
      m += '<div class="bloco"><span class="miudo">Ensaio: tocar o áudio da música neste aparelho</span><div class="par">' +
        '<button type="button" data-ensaio="1" aria-pressed="' + (ensaio.ligado ? 'true' : 'false') + '">Tocar aqui</button>' +
        '<button type="button" data-ensaio="0" aria-pressed="' + (ensaio.ligado ? 'false' : 'true') + '">Não tocar</button></div></div>';
    }
    const at = d.atualizacao || {};
    m += '<div class="bloco"><span class="miudo">Versão deste PC: ' + esc(at.aqui || '?') +
      (at.erro ? ' · não consegui falar com a versão web' : at.disponivel ? ' · há uma mais nova' : at.la ? ' · é a mais nova' : '') + '</span>' +
      '<button type="button" class="bt pequeno" id="bt-conferir">Procurar atualização</button></div>';
    m += '<div class="bloco"><span class="miudo">Painel na web</span><div class="par">' +
      '<button type="button" data-remoto="1" aria-pressed="' + (d.remoto && d.remoto.aceita ? 'true' : 'false') + '">Aceita comandos</button>' +
      '<button type="button" data-remoto="0" aria-pressed="' + (d.remoto && d.remoto.aceita ? 'false' : 'true') + '">Só mostra</button></div></div>';
  } else {
    m += '<a href="/instalar">Instalar a ponte num PC</a><a href="/sair">Sair</a>';
  }
  const pcs = d.maquinas || [];
  if (pcs.length) {
    const la = d.atualizacao && d.atualizacao.la || d.versao_da_web;
    m += '<div class="bloco"><span class="miudo">PCs da igreja</span><div class="pcs">' + pcs.map(p =>
      '<span><b>' + esc(p.nome) + '</b> — ' + (p.viva ? 'ligado' : 'sem resposta') +
      (p.versao ? (la && p.versao !== la ? ', precisa atualizar' : ', atualizado') : '') + '</span>').join('') + '</div></div>';
  }
  m += '<div class="bloco"><a href="/painel-antigo" style="padding:0">Abrir o painel antigo</a></div>';
  const aberto = $('menu').open;
  pintar('folha', m);
  $('menu').open = aberto;
}

function confirmarMomento(m) {
  return m.confirmar ? {titulo: 'Ir para "' + m.nome + '"?', texto: 'Esse momento pede confirmação antes de ir ao ar.', sim: 'Ir'} : null;
}

function desenharOrdem(d) {
  const o = d.ordem || {momentos: []};
  if (!o.momentos.length) {
    pintar('ordem', '<div class="vazio">Nenhuma ordem de culto carregada. Escolha uma no menu Mais.</div>');
    return;
  }
  const horas = {};
  ((d.agenda || {}).momentos || []).forEach(m => { horas[m.id] = m; });
  pintar('ordem', o.momentos.map((m, i) => {
    const h = horas[m.id] || {};
    const agora = o.atual === i, feito = o.atual != null && i < o.atual;
    let resta = '';
    if (agora && h.resta_s != null) {
      resta = h.resta_s >= 0 ? emMinutos(h.resta_s) + ' min' : '+' + emMinutos(h.resta_s) + ' min';
    }
    return '<button type="button" class="momento' + (agora ? ' agora' : feito ? ' feito' : '') + '"' +
      (agora ? ' aria-current="step"' : '') +
      ' data-a="' + esc(JSON.stringify({tipo: 'ir', momento: m.id, versao: o.versao})) + '"' +
      (confirmarMomento(m) ? ' data-c="' + esc(JSON.stringify(confirmarMomento(m))) + '"' : '') +
      (ocupado || !podeAgir() ? ' disabled' : '') + '>' +
      '<span class="hora">' + esc(h.hora || '') + '</span><span class="cresce">' + esc(m.nome) + '</span>' +
      '<span class="resta' + (agora && h.resta_s < 0 ? ' passou' : '') + '">' + resta + '</span></button>';
  }).join(''));
}

function desenharEquipamentos(d) {
  const itens = d.equipamentos || [];
  mostrar('equipamentos', itens.length > 0);
  if (!itens.length) return;
  pintar('equipamentos', '<h2 class="rotulo">Equipamentos</h2>' + itens.map(e =>
    '<div class="equip"><span class="ponto ' + esc(e.cor) + '" aria-hidden="true"></span>' +
    '<span class="cresce">' + esc(e.nome) + '</span><span class="estado ' + esc(e.cor) + '">' + esc(e.estado) + '</span></div>').join(''));
}

// ---------------------------------------------------------------- centro --
function desenharCentro(d) {
  const l = d.louvor;
  const noLouvor = l && l.ativo && (l.no_momento || l.musica);
  const p = d.palavra;
  // A palavra ocupa o centro no momento dela, ou enquanto um slide dela esta
  // no telao (para ninguem perder o "Tirar do telao" ao trocar de momento).
  if (p && p.ativa && p.total && !(l && l.musica) && (p.no_momento || p.visivel)) { pintar('centro', htmlPalavra(d)); return; }
  if (!noLouvor) { pintar('centro', htmlMomento(d)); return; }
  if (!l.musica) { pintar('centro', htmlEscolherMusica(d)); return; }
  pintar('centro', l.letra === 'na_mao' ? htmlManual(d) : htmlSozinho(d));
}

function letraDe(slide, musica, indice) {
  if (!slide) return '';
  if (slide.linhas && slide.linhas.length) return esc(slide.linhas.join('\n'));
  return '';
}
function semLetra(l, indice) {
  return '<span class="letra fraca">slide ' + (indice + 1) + ' de ' + l.total_slides + '</span>';
}

function htmlEscolherMusica(d) {
  const l = d.louvor, primeira = l.lista[0];
  return '<div class="empilha"><span class="rotulo">Louvor · ' + l.total + (l.total === 1 ? ' música' : ' músicas') + '</span>' +
    '<span class="grande">Nenhuma música no telão ainda</span></div>' +
    '<p class="resumo">Toque na primeira música para pôr a letra no telão.' +
    (primeira && !primeira.pronta ? ' Ela não tem tempo marcado: a letra passa à mão.' : '') + '</p>' +
    (podeConduzir() ? '<div class="botoes">' + botao('Começar por ' + esc(primeira.titulo),
      {tipo: 'louvor_musica', para: primeira.id}, {classe: 'bt forte'}) + '</div>' : '');
}

function cabecaLouvor(l) {
  return '<div class="empilha"><span class="rotulo">Louvor · música ' + (l.indice + 1) + ' de ' + l.total + '</span>' +
    '<span class="grande">' + esc(l.musica.titulo) + '</span></div>';
}

function linhaDoRelogio(d) {
  // O que faz o tempo andar, enquanto o Reaper nao informa: o "Comecou" do
  // operador, ou o audio tocando neste aparelho (so em ensaio).
  const l = d.louvor, r = l.relogio;
  if (!podeConduzir() || !l.musica.pronta) return '';
  if (r.fonte === 'cronometro') {
    if (!r.sinal) return '<div class="botoes">' + botao('Começou', {tipo: 'louvor_comecou'}, {classe: 'bt forte'}) + '</div>';
    return '<div class="linha"><span class="miudo cresce">A ponte está contando o tempo. Se a letra estiver fora, acerte:</span>' +
      botao('Atrasar 0,5 s', {tipo: 'louvor_acertar', segundos: -0.5}, {classe: 'bt pequeno'}) +
      botao('Adiantar 0,5 s', {tipo: 'louvor_acertar', segundos: 0.5}, {classe: 'bt pequeno'}) +
      botao('Recomeçar', {tipo: 'louvor_comecou'}, {classe: 'bt pequeno fantasma',
        confirmar: {titulo: 'Recomeçar a contagem?', texto: 'O tempo da música volta ao zero.', sim: 'Recomeçar'}}) + '</div>';
  }
  if (r.fonte === 'navegador' && ensaio.ligado) {
    if (!l.musica.audio) return '<span class="miudo">Ensaio: esta música não tem áudio neste PC.</span>';
    return '<div class="linha"><button type="button" class="bt pequeno" id="bt-ensaio">' + (ensaio.tocando() ? 'Pausar o áudio' : 'Tocar o áudio') + '</button>' +
      '<span class="miudo cresce">Ensaio: o áudio toca neste aparelho e a letra segue.</span></div>';
  }
  return '';
}

function htmlSozinho(d) {
  const l = d.louvor, m = musicaAtual();
  const slides = m ? m.slides : [], partes = m ? m.partes : [];
  const atual = slides[l.slide], seguinte = slides[l.slide + 1];
  let selo;
  if (l.motivo === 'sem_tempo') selo = '<span class="selo ambar">Sem o tempo da música</span>';
  else if (l.motivo === 'esperando') selo = '<span class="selo">Esperando a música começar</span>';
  else if (l.segurando) selo = '<span class="selo ambar">Letra segura</span>';
  else selo = '<span class="selo verde">Sozinho</span>';

  let h = '<div class="cabeca">' + cabecaLouvor(l) + '<div class="linha">' + selo +
    (podeConduzir() ? botao('Assumir', {tipo: 'louvor_assumir'}, {classe: 'bt claro'}) : '') + '</div></div>';

  const texto = letraDe(atual);
  h += '<div class="slides-agora"><div class="no-telao"><span class="rotulo">No telão</span>' +
    (texto ? '<span class="letra">' + texto + '</span>' : semLetra(l, l.slide || 0)) +
    (l.erro_letra ? '<span class="falha">A letra não chegou ao telão</span>' : '') + '</div>' +
    '<div class="ao-lado"><div class="a-seguir"><span class="rotulo">A seguir<span id="contagem"></span></span>' +
    '<span class="letra">' + (seguinte ? (letraDe(seguinte) || 'slide ' + (l.slide + 2)) : 'fim da música') + '</span></div>';
  const recados = (atual && atual.instrucoes) || [];
  if (recados.length) h += '<div class="instrucao">' + recados.map(i => esc(i.para) + ' · ' + esc(i.texto)).join('<br>') + '</div>';
  h += '</div></div>';

  if (partes.length && l.relogio.duracao) {
    const fim = l.relogio.duracao;
    h += '<div class="tempo-linha"><div class="partes-barra">' + partes.map((p, i) => {
      const ate = i + 1 < partes.length ? partes[i + 1].tempo : fim;
      return '<div class="parte clima-' + esc(p.clima || 'nenhum') + '" style="flex:' + Math.max(1, ate - p.tempo) + ' 1 0">' + esc(p.nome) + '</div>';
    }).join('') + '<div class="agulha" id="agulha" aria-hidden="true"></div></div>' +
      '<div class="tempo-legenda"><span id="pos"></span><span>' + esc(partes[l.parte] ? partes[l.parte].nome : '') +
      (partes[l.parte] && partes[l.parte].clima ? ' · ' + esc(nomeDoClima(d, partes[l.parte].clima)) : '') +
      '</span><span>' + relogio(fim) + '</span></div></div>';
  }
  h += linhaDoRelogio(d);
  if (podeConduzir()) {
    h += '<div class="botoes">' +
      botao(l.segurando ? 'Soltar a letra' : 'Segurar a letra', {tipo: 'louvor_segurar', segurar: !l.segurando}, {classe: 'bt' + (l.segurando ? ' ativo' : '')}) +
      botao('Repetir o refrão', {tipo: 'louvor_repetir_refrao'}, {desligado: !l.tem_refrao, titulo: l.tem_refrao ? '' : 'Esta música não tem refrão marcado'}) +
      botaoProxima(l) + '</div>';
  }
  return h;
}

function botaoProxima(l) {
  const ultima = l.indice + 1 >= l.total;
  const tocando = l.relogio && l.relogio.tocando && !l.acabou;
  return botao('Próxima música', {tipo: 'louvor_musica', para: 'proxima'}, {
    desligado: ultima, titulo: ultima ? 'Esta é a última música' : '',
    confirmar: tocando ? {titulo: 'Passar para a próxima música?', texto: '"' + l.musica.titulo + '" ainda está tocando.', sim: 'Passar'} : null});
}

function nomeDoClima(d, id) {
  const c = ((d.luz && d.luz.climas) || []).filter(x => x.id === id)[0];
  return c ? c.nome : id;
}

function htmlManual(d) {
  const l = d.louvor, m = musicaAtual();
  const slides = m ? m.slides : [], partes = m ? m.partes : [];
  const eu = meuNome(), pode = podeConduzir();
  let h = '<div class="comando">';
  if (l.motivo === 'a_mao') {
    h += '<span class="quem">Esta música é à mão</span><span class="porque">Ela não tem tempo marcado: a letra só passa quando alguém toca.' +
      (l.quem ? ' Quem tocou por último: ' + esc(l.quem) + '.' : '') + '</span>';
  } else {
    const meu = eu && l.quem === eu;
    h += '<span class="quem">' + (meu ? 'Você está no comando' : l.quem ? esc(l.quem) + ' está no comando' : 'A letra está na mão') + '</span>';
    if (pode) {
      if (!meu) h += botao('Assumir', {tipo: 'louvor_assumir'}, {classe: 'bt'});
      h += botao('Devolver', {tipo: 'louvor_devolver'}, {classe: 'bt claro', desligado: !l.pode_devolver, titulo: l.motivo_devolver || ''});
      if (!l.pode_devolver && l.motivo_devolver) h += '<span class="porque">Não dá para devolver agora: ' + esc(l.motivo_devolver) + '.</span>';
    }
  }
  h += '</div>';
  h += '<div class="cabeca"><span class="grande">' + esc(l.musica.titulo) + '</span>' +
    '<span class="resumo">slide ' + ((l.slide || 0) + 1) + ' de ' + l.total_slides +
    (l.erro_letra ? ' · <b style="color:var(--vermelho-texto)">a letra não chegou ao telão</b>' : '') + '</span></div>';
  if (partes.length > 1) {
    h += '<div class="atalhos">' + partes.map((p, i) => pode
      ? botao(esc(p.nome), {tipo: 'louvor_parte', parte: i}, {classe: 'bt' + (i === l.parte ? ' ativo' : ''), apertado: i === l.parte})
      : '<span class="bt' + (i === l.parte ? ' ativo' : '') + '">' + esc(p.nome) + '</span>').join('') + '</div>';
  }
  h += '<div class="grade-slides" id="grade-slides">' + slides.map((s, i) => {
    const corpo = '<span class="n">' + (i + 1) + '</span>' + (letraDe(s) || (s.instrucoes[0] ? '(' + esc(s.instrucoes[0].texto) + ')' : ''));
    const classe = 'slide' + (i === l.slide ? ' atual' : i < l.slide ? ' passado' : '');
    return pode
      ? '<button type="button" class="' + classe + '" aria-pressed="' + (i === l.slide ? 'true' : 'false') + '"' +
        ' data-a="' + esc(JSON.stringify({tipo: 'louvor_slide', para: i})) + '">' + corpo + '</button>'
      : '<div class="' + classe + '">' + corpo + '</div>';
  }).join('') + '</div>';
  h += linhaDoRelogio(d);
  if (pode) {
    h += '<div class="passar">' +
      botao('← Anterior', {tipo: 'louvor_slide', para: 'anterior', visto: l.slide}, {desligado: !l.slide}) +
      botao('Próximo slide <span class="tecla">Espaço</span>', {tipo: 'louvor_slide', para: 'proximo', visto: l.slide},
        {classe: 'bt forte', desligado: l.slide + 1 >= l.total_slides}) + '</div>';
  }
  return h;
}

function htmlPalavra(d) {
  const p = d.palavra, slides = (C && C.palavra) || [], pode = podeConduzir();
  const atual = p.slide != null ? slides[p.slide] : null;
  const seguinte = slides[p.slide == null ? 0 : p.slide + 1];
  const visto = p.slide == null ? -1 : p.slide;
  const eu = meuNome();
  let tempo = '';
  if (p.passou_s != null && p.de_minutos) tempo = ' · ' + Math.max(0, Math.floor(p.passou_s / 60)) + ' de ' + p.de_minutos + ' min';
  let selo;
  if (!p.quem) selo = '<span class="selo">Ninguém passou ainda</span>';
  else if (p.quem_e_o_pregador) selo = '<span class="selo verde">O pregador está passando</span>';
  else selo = '<span class="selo ambar">' + (eu && p.quem === eu ? 'Você está passando' : esc(p.quem) + ' está passando') + '</span>';
  let h = '<div class="cabeca"><div class="empilha"><span class="rotulo">Palavra' + tempo + (p.pregador ? ' · ' + esc(p.pregador) : '') + '</span>' +
    '<span class="grande">' + esc(p.titulo) + '</span></div><div class="linha">' + selo +
    (pode && !(eu && p.quem === eu) ? botao('Assumir', {tipo: 'palavra_assumir'}, {classe: 'bt claro'}) : '') + '</div></div>';
  if (p.passou_s != null && p.de_minutos) {
    const pct = Math.max(0, Math.min(100, 100 * p.passou_s / (p.de_minutos * 60)));
    h += '<div class="barra-tempo' + (pct >= 100 ? ' passou' : '') + '"><div style="width:' + pct.toFixed(1) + '%"></div></div>';
  }
  const noTelao = atual && p.visivel;
  h += '<div class="slides-agora"><div class="no-telao"><span class="rotulo">' + (noTelao ? 'No telão · ' + (p.slide + 1) + ' de ' + p.total : 'Fora do telão') + '</span>' +
    (noTelao ? '<span class="letra' + (atual.tipo === 'VERSE' ? ' versiculo' : '') + '">' + esc(atual.texto || atual.referencia) + '</span>' +
      (atual.referencia && atual.texto ? '<span class="referencia">' + esc(atual.referencia) + '</span>' : '')
      : '<span class="letra fraca">' + (atual ? 'O slide ' + (p.slide + 1) + ' está guardado. "Próximo" traz de volta.' : 'Nenhum slide da palavra foi ao telão ainda.') + '</span>') +
    (p.erro ? '<span class="falha">Abra no Holyrics: ' + esc((atual && (atual.referencia || atual.texto)) || '') + '</span>' : '') + '</div>' +
    '<div class="ao-lado"><div class="a-seguir"><span class="rotulo">A seguir</span><span class="letra">' +
    (seguinte ? esc(seguinte.referencia && seguinte.tipo === 'VERSE' ? seguinte.referencia : seguinte.texto) : 'fim dos slides') + '</span></div>';
  const mic = ((d.transmissao && d.transmissao.audios) || []).filter(a => a.palavra);
  if (mic.length) h += '<div class="caixa"><span class="rotulo">Microfone</span>' + mic.map(htmlAudio).join('') + '</div>';
  h += '</div></div>';
  h += '<div class="lista-palavra" id="lista-palavra">' + slides.map((s, i) => {
    const classe = 'item-palavra' + (i === p.slide ? ' atual' : p.slide != null && i < p.slide ? ' passado' : '');
    const corpo = '<span class="n">' + (i + 1) + '</span><span class="tipo">' + esc(s.rotulo) + '</span>' +
      '<span class="cresce texto">' + esc(s.tipo === 'VERSE' && s.referencia ? s.referencia : s.texto) + '</span>';
    return pode ? '<button type="button" class="' + classe + '" aria-pressed="' + (i === p.slide ? 'true' : 'false') + '"' +
      ' data-a="' + esc(JSON.stringify({tipo: 'palavra_slide', para: i})) + '">' + corpo + '</button>'
      : '<div class="' + classe + '">' + corpo + '</div>';
  }).join('') + '</div>';
  if (pode) {
    h += '<div class="passar">' +
      botao('← Anterior', {tipo: 'palavra_slide', para: 'anterior', visto: visto}, {desligado: p.slide == null || (p.slide === 0 && p.visivel)}) +
      botao('Tirar do telão', {tipo: 'palavra_tirar'}, {desligado: !noTelao}) +
      botao('Próximo <span class="tecla">Espaço</span>', {tipo: 'palavra_slide', para: 'proximo', visto: visto},
        {classe: 'bt forte', desligado: p.visivel && p.slide + 1 >= p.total}) + '</div>';
    h += '<div class="linha"><span class="miudo cresce">' + (p.link ? 'O celular do pregador está liberado para este culto.' : 'O pregador pode passar os slides pelo celular.') + '</span>' +
      '<button type="button" class="bt pequeno" id="bt-pregador">Celular do pregador</button>' +
      (p.link ? botao('Encerrar o acesso', {tipo: 'pregador_link', acao: 'encerrar'}, {classe: 'bt pequeno fantasma'}) : '') + '</div>';
  }
  return h;
}

function htmlMomento(d) {
  const o = d.ordem || {momentos: []};
  const atual = o.atual != null ? o.momentos[o.atual] : null;
  const proximo = (o.momentos || []).filter(m => m.id === o.proximo_id)[0];
  const ag = ((d.agenda || {}).momentos || []).filter(m => atual && m.id === atual.id)[0] || {};
  let h = '';
  if (!atual) {
    h += '<div class="empilha"><span class="rotulo">Agora</span><span class="grande">O culto ainda não começou</span></div>' +
      '<p class="resumo">' + esc((d.agenda || {}).texto || 'Toque no primeiro momento quando for a hora.') + '</p>';
  } else {
    let tempo = '';
    if (ag.resta_s != null && ag.minutos) {
      const passou = ag.minutos * 60 - ag.resta_s;
      tempo = ' · ' + Math.max(0, Math.floor(passou / 60)) + ' de ' + ag.minutos + ' min';
      const pct = Math.max(0, Math.min(100, 100 * passou / (ag.minutos * 60)));
      h += '<div class="empilha"><span class="rotulo">Agora' + tempo + '</span><span class="grande">' + esc(atual.nome) + '</span></div>' +
        '<div class="barra-tempo' + (ag.resta_s < 0 ? ' passou' : '') + '"><div style="width:' + pct.toFixed(1) + '%"></div></div>';
    } else {
      h += '<div class="empilha"><span class="rotulo">Agora</span><span class="grande">' + esc(atual.nome) + '</span></div>';
    }
    if (atual.resumo) h += '<p class="resumo">' + esc(atual.resumo) + '</p>';
  }
  const t = d.telao;
  if (t) {
    h += '<div class="caixa"><span class="rotulo">No telão</span><span>' + (t.preta ? 'Tela preta'
      : t.vazio ? 'Nada no telão' : esc(t.nome || 'Apresentação') + (t.slide && t.total ? ' · ' + t.slide + ' de ' + t.total : '')) + '</span></div>';
  }
  const audios = (d.transmissao && d.transmissao.audios) || [];
  const mic = audios.filter(a => a.palavra);
  if (mic.length) h += '<div class="caixa"><span class="rotulo">Microfone</span>' + mic.map(htmlAudio).join('') + '</div>';
  if (proximo) {
    h += '<div class="botoes">' + botao((atual ? 'Próximo: ' : 'Começar: ') + esc(proximo.nome),
      {tipo: 'ir', momento: proximo.id, versao: o.versao}, {classe: 'bt forte', confirmar: confirmarMomento(proximo)}) + '</div>';
  }
  return h;
}

function desenharMusicas(d) {
  const l = d.louvor;
  const tem = !!(l && l.ativo && l.lista.length);
  mostrar('musicas', tem);
  if (!tem) return;
  const rotulos = {tocou: 'Tocou', tocando: 'Tocando', a_seguir: 'A seguir', depois: 'Depois'};
  const tocando = l.musica && l.relogio && l.relogio.tocando && !l.acabou;
  pintar('musicas', l.lista.map(m => {
    const corpo = '<span class="rotulo' + (m.pronta ? '' : ' a-mao') + '">' + rotulos[m.estado] + (m.pronta ? '' : ' · à mão') + '</span>' +
      '<span class="titulo">' + esc(m.titulo) + '</span>';
    if (!podeConduzir() || m.estado === 'tocando') return '<button type="button" class="musica ' + m.estado + '" disabled>' + corpo + '</button>';
    const c = tocando ? {titulo: 'Trocar para "' + m.titulo + '"?', texto: '"' + l.musica.titulo + '" ainda está tocando.', sim: 'Trocar'} : null;
    return '<button type="button" class="musica ' + m.estado + '" data-a="' + esc(JSON.stringify({tipo: 'louvor_musica', para: m.id})) + '"' +
      (c ? ' data-c="' + esc(JSON.stringify(c)) + '"' : '') + (ocupado ? ' disabled' : '') + '>' + corpo + '</button>';
  }).join(''));
}

function desenharLuz(d) {
  const luz = d.luz;
  mostrar('luz', !!luz);
  if (!luz) return;
  const l = d.louvor, comMusica = l && l.musica && l.musica.pronta;
  let lado = '';
  if (comMusica && luz.seguindo) lado = '<span class="seguindo">Seguindo a música</span>';
  else if (comMusica) lado = '<span class="linha"><span class="na-mao">Luz na mão</span>' +
    (podeConduzir() ? botao('Seguir a música', {tipo: 'luz_seguir'}, {classe: 'bt pequeno'}) : '') + '</span>';
  let h = '<div class="cabeca"><h2 class="rotulo">Luz</h2>' + lado + '</div>';
  h += '<div class="climas" role="group" aria-label="Clima da luz">' + (luz.climas || []).map(c =>
    botao('<span class="ponto ' + esc(c.id) + '" aria-hidden="true"></span>' + esc(c.nome), {tipo: 'clima', clima: c.id},
      {classe: 'clima', apertado: c.ativo, desligado: !c.disponivel, titulo: c.disponivel ? '' : 'Falta configurar a luz deste clima neste PC'})).join('') +
    botao('Apagar', {tipo: 'apagar_luz'}, {classe: 'clima apagar', apertado: luz.cena === 'apagar'}) + '</div>';
  const modos = luz.modos || [];
  h += '<details class="dobra" id="dobra-luz"' + (luzAberta ? ' open' : '') + '><summary>Cenas e movimento, um a um</summary><div class="dentro">' +
    '<div class="chips">' + (luz.cenas || []).map(c => botao(esc(c.nome), {tipo: 'cena_luz', cena: c.id},
      {classe: 'bt' + (luz.cena === c.id ? ' ativo' : ''), apertado: luz.cena === c.id})).join('') + '</div>';
  if (modos.length) {
    h += '<div class="chips">' + botao('Parado', {tipo: 'modo_luz', modo: 'parado'}, {classe: 'bt' + (luz.modo === 'parado' ? ' ativo' : ''), apertado: luz.modo === 'parado'}) +
      modos.map(m => botao(esc(m.nome), {tipo: 'modo_luz', modo: m.id},
        {classe: 'bt' + (luz.modo === m.id ? ' ativo' : ''), apertado: luz.modo === m.id, titulo: m.descricao || ''})).join('') + '</div>';
  }
  h += '</div></details>';
  pintar('luz', h);
}

// ----------------------------------------------------------- transmissao --
function htmlAudio(a) {
  return '<div class="audio"><span class="nome">' + esc(a.nome) + '</span>' +
    '<div class="medidor" role="img" aria-label="' + esc(a.nome + ': ' + a.estado) + '"><div class="' + esc(a.cor) + '" style="width:' + (a.nivel || 0) + '%"></div></div>' +
    '<span class="estado ' + esc(a.cor) + '">' + esc(a.estado) + '</span></div>';
}

function desenharTransmissao(d) {
  const t = d.transmissao, tx = sistema('Transmissão');
  const ligado = !!t || (tx && tx.estado === 'erro');
  mostrar('transmissao', ligado);
  if (!ligado) return;
  const local = d.local !== false;
  if (!t) {
    pintar('tx-cabeca', '<div class="cabeca"><h2 class="rotulo">Transmissão</h2><span class="no-ar">sem contato</span></div>');
    $('tx-imagem').className = 'imagem-obs';
    $('tx-etiqueta').textContent = '';
    $('tx-foto').hidden = true;
    $('tx-sem').textContent = 'Sem contato com o OBS. O notebook da transmissão está ligado, com o OBS aberto?';
    pintar('tx-resto', '');
    return;
  }
  pintar('tx-cabeca', '<div class="cabeca"><h2 class="rotulo">Transmissão</h2>' + (t.no_ar
    ? '<span class="no-ar sim"><span class="ponto vermelho" aria-hidden="true"></span>No ar · ' + duracao(t.tempo_ms) + '</span>'
    : '<span class="no-ar"><span class="ponto" aria-hidden="true"></span>Fora do ar</span>') + '</div>');
  $('tx-imagem').className = 'imagem-obs' + (t.no_ar ? ' no-ar-sim' : '');
  $('tx-etiqueta').textContent = t.imagem ? (t.no_ar ? 'NO AR · ' : 'IMAGEM · ') + String(t.imagem).toUpperCase() : '';
  const comFoto = local && d.imagem && d.imagem.ativa;
  if (!comFoto) $('tx-foto').hidden = true;
  $('tx-sem').textContent = !local ? 'A imagem ao vivo aparece só na igreja.'
    : !(d.imagem && d.imagem.ativa) ? 'A imagem está desligada no menu Mais.' : ($('tx-foto').hidden ? 'Sem imagem do OBS.' : '');

  let h = '';
  const c = d.controles || {};
  if ((t.cenas || []).length) {
    h += '<div class="cenas" role="group" aria-label="Câmera na transmissão">' + t.cenas.map(k =>
      botao(esc(k.nome), {tipo: 'cena_transmissao', cena: k.id}, {classe: 'cena', apertado: k.no_ar})).join('') + '</div>';
  }
  if (t.preparada && c.cortar) {
    h += botao('Pôr no ar: ' + esc(t.preparada), {tipo: 'cortar'}, {classe: 'bt forte'});
  }
  if ((t.audios || []).length) h += '<div class="empilha" style="gap:8px">' + t.audios.map(htmlAudio).join('') + '</div>';
  const n = t.numeros || {}, q = n.qualidade || {};
  const corQ = {Boa: 'verde', Oscilando: 'ambar', Ruim: 'vermelho', Reconectando: 'vermelho'}[q.palavra] || '';
  const yt = {good: 'O YouTube está recebendo bem', ok: 'O YouTube está recebendo', bad: 'O YouTube está recebendo mal',
    noData: 'O YouTube não está recebendo nada'}[q.youtube];
  let detalheQ = q.kbps != null ? q.kbps + ' kbps' : '';
  if (yt) detalheQ += (detalheQ ? ' · ' : '') + yt + (q.youtube_lido_em ? ' (' + q.youtube_lido_em + ')' : '');
  const numero = (nome, valor, cor, detalhe) => '<div class="numero"><span class="rotulo">' + nome + '</span>' +
    '<span class="valor ' + (cor || '') + '">' + valor + '</span>' + (detalhe ? '<span class="detalhe">' + esc(detalhe) + '</span>' : '') + '</div>';
  h += '<div class="grade2">' +
    numero('Assistindo', n.assistindo != null ? n.assistindo : '—', '', n.assistindo != null && n.assistindo_lido_em ? 'às ' + n.assistindo_lido_em : '') +
    numero('Qualidade', esc(q.palavra || '—'), corQ, detalheQ) +
    numero('Gravação', t.gravando ? duracao(n.gravacao_ms) : 'parada', '', '') +
    numero('Espaço no disco', n.disco_gb != null ? n.disco_gb + ' GB' : '—', n.disco_cor === 'normal' ? '' : n.disco_cor, '') + '</div>';
  if (c.transmitir || c.gravar) {
    h += '<div class="grade2">';
    if (c.transmitir) h += t.no_ar
      ? botao('Parar a transmissão', {tipo: 'transmitir', ligar: false}, {confirmar: {titulo: 'Parar a transmissão?',
          texto: 'Quem está assistindo pela internet deixa de ver o culto.', sim: 'Parar', perigo: true}})
      : botao('Começar a transmitir', {tipo: 'transmitir', ligar: true}, {confirmar: {titulo: 'Começar a transmitir?',
          texto: 'O culto vai ao ar na internet agora.', sim: 'Começar'}});
    if (c.gravar) h += t.gravando
      ? botao('Parar a gravação', {tipo: 'gravar', ligar: false}, {confirmar: {titulo: 'Parar a gravação?', texto: 'O arquivo é fechado onde está.', sim: 'Parar', perigo: true}})
      : botao('Gravar', {tipo: 'gravar', ligar: true});
    h += '</div>';
  }
  const y = t.youtube;
  if (y) {
    h += '<div class="empilha" style="gap:8px"><span class="miudo">' + (y.link ? '<a href="' + esc(y.link) + '" target="_blank" rel="noopener">' + esc(y.titulo || 'Abrir no YouTube') + '</a>'
      : esc(y.titulo || '')) + '</span><div class="par">' +
      '<button type="button" data-a="' + esc(JSON.stringify({tipo: 'visibilidade', valor: 'public'})) + '" aria-pressed="' + (y.publica ? 'true' : 'false') + '"' +
      (ocupado || !podeAgir() ? ' disabled' : '') + '>Aberta ao público</button>' +
      '<button type="button" data-a="' + esc(JSON.stringify({tipo: 'visibilidade', valor: 'unlisted'})) + '" aria-pressed="' + (y.publica ? 'false' : 'true') + '"' +
      (ocupado || !podeAgir() ? ' disabled' : '') + '>Só com o link</button></div></div>';
  }
  pintar('tx-resto', '<div class="empilha" style="gap:14px">' + h + '</div>');
}

function desenharTelao(d) {
  const t = d.telao, c = d.controles || {}, recados = d.recados || [], rt = d.retorno_tv;
  const tem = (t && c.tela_preta) || recados.length > 0 || !!rt;
  mostrar('telao', !!tem);
  if (!tem) return;
  let h = '<h2 class="rotulo">Telão e palco</h2><div class="linha">';
  if (t && c.tela_preta) {
    h += t.preta ? botao('Voltar a mostrar', {tipo: 'tela_preta', ligar: false}, {classe: 'bt forte cresce'})
      : botao('Tela preta', {tipo: 'tela_preta', ligar: true}, {classe: 'bt cresce'});
  }
  if (recados.length) h += '<button type="button" class="bt cresce' + (recadosAbertos ? ' ativo' : '') + '" id="bt-recados" aria-expanded="' + recadosAbertos + '">Recado</button>';
  h += '</div>';
  if (recados.length && recadosAbertos) {
    h += '<div class="empilha" style="gap:6px"><span class="miudo">Recado para quem está no palco</span><div class="grade2">' +
      recados.map(r => botao(esc(r.nome), {tipo: 'recado', id: r.id}, {classe: 'bt pequeno'})).join('') +
      (d.tem_recado_limpar ? botao('Tirar o recado', {tipo: 'recado', id: 'recado_limpar'}, {classe: 'bt pequeno fantasma'}) : '') + '</div></div>';
  }
  if (rt) {
    const ruim = ['caiu', 'reconectando', 'desistiu', 'fora_da_janela'].indexOf(rt.estado) >= 0;
    h += '<div class="empilha" style="gap:6px"><span class="miudo">TV do altar: <b style="color:' + (ruim ? 'var(--ambar-texto)' : 'var(--texto)') + '">' + esc(rt.texto) + '</b></span>' +
      '<div class="grade2">' +
      botao(rt.estado === 'no_ar' ? 'Reabrir o retorno' : 'Abrir o retorno', {tipo: 'retorno', acao: 'reabrir'}, {classe: 'bt pequeno',
        confirmar: rt.estado === 'no_ar' ? {titulo: 'Reabrir o retorno na TV?', texto: 'A TV já está recebendo a letra. Reabrir faz a imagem sumir por uns 20 segundos.', sim: 'Reabrir'} : null}) +
      (rt.pausado ? botao('Voltar a vigiar', {tipo: 'retorno', acao: 'retomar'}, {classe: 'bt pequeno forte'})
        : botao('Pausar o vigia', {tipo: 'retorno', acao: 'pausar'}, {classe: 'bt pequeno',
            confirmar: {titulo: 'Pausar o vigia do retorno?', texto: 'Até o fim do dia, a ponte não reabre o retorno sozinha se a TV soltar.', sim: 'Pausar'}})) +
      '</div></div>';
  }
  pintar('telao', h);
}

function desenharHistorico(d) {
  const fatos = (d.historico || []).slice(0, 6);
  mostrar('historico', fatos.length > 0);
  if (!fatos.length) return;
  pintar('historico', '<h2 class="rotulo">Aconteceu agora</h2>' + fatos.map(f =>
    '<div class="fato' + (f.ok ? '' : ' ruim') + '"><span class="hora">' + esc(f.hora) + '</span><span class="texto cresce">' + esc(f.titulo) +
    (f.origem === 'web' ? ' <span class="miudo">(pela web)</span>' : '') +
    (!f.ok && f.detalhe ? '<small>' + esc(f.detalhe) + '</small>' : '') + '</span></div>').join(''));
}

// ------------------------------------- o que anda sozinho entre leituras --
function andar() {
  if (!D) return;
  if (D.agora) {
    const agora = new Date((D.agora + (performance.now() - lidoEm) / 1000) * 1000);
    $('relogio').textContent = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
  } else {
    $('relogio').textContent = D.hora || '';
  }
  const l = D.louvor;
  if (!l || !l.musica) return;
  const pos = posicaoAgora();
  const agulha = $('agulha'), rotuloPos = $('pos'), contagem = $('contagem');
  if (agulha && l.relogio.duracao) {
    agulha.style.left = (pos == null ? 0 : Math.max(0, Math.min(100, 100 * pos / l.relogio.duracao))) + '%';
    agulha.hidden = pos == null;
  }
  if (rotuloPos) rotuloPos.textContent = pos == null ? '—' : relogio(pos);
  if (contagem) {
    const m = musicaAtual(), seguinte = m && m.slides[l.slide + 1];
    contagem.textContent = (pos != null && seguinte && seguinte.tempo != null && l.motivo == null && !l.segurando)
      ? ' · ' + relogio(Math.max(0, seguinte.tempo - pos)) : '';
  }
}
setInterval(andar, 200);

// A imagem ao vivo do OBS. So na rede da igreja, e so com a tela a vista:
// uma aba esquecida em segundo plano nao pode custar nada ao notebook.
let fotoAtual = null;
async function buscarImagem() {
  if (!D || D.local === false || !D.transmissao || !(D.imagem && D.imagem.ativa) || document.hidden) return;
  try {
    const r = await fetch('/api/painel/imagem', {cache: 'no-store'});
    const foto = $('tx-foto');
    if (r.status !== 200) { foto.hidden = true; return; }
    const url = URL.createObjectURL(await r.blob());
    foto.src = url;
    foto.hidden = false;
    $('tx-sem').textContent = '';
    if (fotoAtual) URL.revokeObjectURL(fotoAtual);
    fotoAtual = url;
  } catch (e) { $('tx-foto').hidden = true; }
}
setInterval(buscarImagem, 1000);

// ---------------------------------------------------------------- ensaio --
// O audio da musica tocando NESTE aparelho, avisando a ponte de onde esta.
// E uma das fontes do relogio (ver ponte/relogio.py), e so serve para ensaio:
// no culto quem toca o audio e o PC do som.
const som = $('som');
const ensaio = {
  ligado: guardado.ler('ponte-ensaio') === '1',
  musica: null,
  tocando() { return !som.paused && !som.ended; },
  preparar() {
    const l = D && D.louvor;
    const serve = this.ligado && l && l.musica && l.musica.audio && l.relogio.fonte === 'navegador' && D.local !== false;
    if (!serve) { if (this.musica) { som.pause(); som.removeAttribute('src'); this.musica = null; } return; }
    if (this.musica !== l.musica.id) {
      this.musica = l.musica.id;
      som.src = '/api/louvor/audio/' + encodeURIComponent(l.musica.audio);
    }
  },
  avisar() {
    if (!this.musica) return;
    fetch('/api/relogio', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({fonte: 'navegador', musica: this.musica, posicao: som.currentTime, tocando: this.tocando()})}).catch(() => {});
  },
};
setInterval(() => { if (ensaio.musica && ensaio.tocando()) ensaio.avisar(); }, 250);
['pause', 'seeked', 'ended', 'play'].forEach(e => som.addEventListener(e, () => { ensaio.avisar(); redesenhar(); }));

// ------------------------------------------------------------------- agir --
let avisoRelogio = null;
function avisar(texto, ruim) {
  const a = $('aviso');
  a.textContent = texto;
  a.className = 'aviso-flutuante' + (ruim ? ' ruim' : '');
  a.hidden = false;
  clearTimeout(avisoRelogio);
  avisoRelogio = setTimeout(() => { a.hidden = true; }, ruim ? 7000 : 3000);
}

function perguntar(c) {
  return new Promise(resolver => {
    const dlg = $('dialogo'), campo = $('dialogo-campo');
    $('dialogo-titulo').textContent = c.titulo;
    $('dialogo-texto').textContent = c.texto || '';
    $('dialogo-sim').textContent = c.sim || 'Confirmar';
    $('dialogo-sim').className = 'bt ' + (c.perigo ? 'perigo' : 'forte');
    campo.hidden = c.campo == null;
    campo.value = c.campo || '';
    const fechar = resposta => {
      dlg.close();
      $('dialogo-sim').onclick = $('dialogo-nao').onclick = dlg.oncancel = campo.onkeydown = null;
      resolver(c.campo != null ? (resposta ? campo.value : null) : resposta);
    };
    $('dialogo-sim').onclick = () => fechar(true);
    $('dialogo-nao').onclick = () => fechar(false);
    campo.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); fechar(true); } };
    dlg.oncancel = e => { e.preventDefault(); fechar(false); };
    dlg.showModal();
    (c.campo != null ? campo : $('dialogo-nao')).focus();
    if (c.campo != null) campo.select();
  });
}

async function pedir(caminho, corpo) {
  const r = await fetch(caminho, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(corpo || {})});
  let j = {};
  try { j = await r.json(); } catch (e) { /* resposta sem corpo */ }
  if (r.status === 401) { location.href = '/entrar'; throw new Error('entre com a senha'); }
  if (!r.ok) { const erro = new Error(j.erro || ('erro ' + r.status)); erro.conflito = !!j.conflito; throw erro; }
  return j;
}

async function agir(acao) {
  if (ocupado) return;
  // As acoes do louvor levam o nome do aparelho: e o que deixa a tela dizer
  // a todos quem esta no comando.
  const doLouvor = /^(louvor_(assumir|devolver|segurar|slide|parte|repetir_refrao)|palavra_(slide|assumir|tirar))$/.test(acao.tipo);
  if (doLouvor) acao = Object.assign({quem: await garantirNome()}, acao);
  const rapida = acao.tipo === 'louvor_slide' || acao.tipo === 'louvor_parte' || acao.tipo === 'palavra_slide';
  if (!rapida) { ocupado = true; redesenhar(); }
  try {
    const j = await pedir('/api/painel/acao', acao);
    if (j.enviado) avisar('Pedido enviado para a igreja. Acompanhe na tela.');
    else if (j.ok === false) avisar(j.titulo + ': ' + j.detalhe, true);
    else if (!rapida) avisar(j.titulo || 'Feito');
  } catch (erro) {
    // Outro aparelho passou o slide no mesmo instante: nao e erro de ninguem.
    avisar(erro.conflito ? 'Outra pessoa acabou de passar o slide.' : erro.message, !erro.conflito);
  }
  ocupado = false;
  await consultar();
}

function redesenhar() {
  Object.keys(jaPintado).forEach(k => delete jaPintado[k]);
  if (D) desenhar();
}

document.addEventListener('click', async evento => {
  const alvo = evento.target.closest('button');
  const menu = $('menu');
  if (menu.open && !menu.contains(evento.target)) menu.open = false;
  if (!alvo || alvo.disabled) return;
  if (alvo.id === 'bt-recados') { recadosAbertos = !recadosAbertos; redesenhar(); return; }
  if (alvo.id === 'bt-ensaio') { ensaio.tocando() ? som.pause() : som.play().catch(e => avisar('Não consegui tocar o áudio: ' + e.message, true)); return; }
  if (alvo.id === 'bt-pregador') {
    // O endereco do link vem de uma rota que so existe na igreja: o codigo
    // nunca passa pelo retrato, que viaja para a web.
    try {
      if (!(D.palavra && D.palavra.link)) await pedir('/api/painel/acao', {tipo: 'pregador_link', acao: 'gerar'});
      const link = await (await fetch('/api/painel/pregador', {cache: 'no-store'})).json();
      if (!link.ativo) throw new Error('não consegui criar o link');
      await perguntar({titulo: 'Celular do pregador', sim: 'Pronto', campo: link.local,
        texto: 'Com o celular no Wi-Fi da igreja, abra o endereço abaixo. Vale só neste culto.' +
          (link.web ? ' Fora do Wi-Fi, pela internet: ' + link.web : '')});
    } catch (e) { avisar(e.message, true); }
    consultar();
    return;
  }
  if (alvo.id === 'bt-nome') {
    const nome = await perguntar({titulo: 'Como chamar este aparelho?', texto: 'O painel mostra a todos quem está passando a letra.',
      sim: 'Pronto', campo: meuNome() || ''});
    if (nome && nome.trim()) { guardado.gravar('ponte-aparelho', nome.trim().slice(0, 30)); redesenhar(); }
    return;
  }
  if (alvo.id === 'bt-atualizar') {
    if (!await perguntar({titulo: 'Atualizar a Ponte agora?', texto: 'A tela some por alguns segundos e volta sozinha. Não faça isso no meio do culto.', sim: 'Atualizar'})) return;
    try { await pedir('/api/painel/atualizar'); avisar('Atualizando…'); } catch (e) { avisar(e.message, true); }
    return;
  }
  if (alvo.id === 'bt-conferir') {
    try { await pedir('/api/atualizacao/conferir'); avisar('Conferido.'); } catch (e) { avisar(e.message, true); }
    consultar();
    return;
  }
  if (alvo.dataset.remoto != null) {
    try { await pedir('/api/painel/remoto', {aceita: alvo.dataset.remoto === '1'}); } catch (e) { avisar(e.message, true); }
    consultar();
    return;
  }
  if (alvo.dataset.imagem != null) { agir({tipo: 'imagem', mostrar: alvo.dataset.imagem === '1'}); return; }
  if (alvo.dataset.ensaio != null) {
    ensaio.ligado = alvo.dataset.ensaio === '1';
    guardado.gravar('ponte-ensaio', ensaio.ligado ? '1' : '0');
    ensaio.preparar();
    redesenhar();
    return;
  }
  if (!alvo.dataset.a) return;
  const acao = JSON.parse(alvo.dataset.a);
  if (alvo.dataset.c && !await perguntar(JSON.parse(alvo.dataset.c))) return;
  agir(acao);
});

document.addEventListener('toggle', evento => {
  if (evento.target.id === 'dobra-luz') luzAberta = evento.target.open;
}, true);

document.addEventListener('change', async evento => {
  if (evento.target.id !== 'troca-ordem') return;
  const sel = evento.target, nome = sel.options[sel.selectedIndex].text;
  if (await perguntar({titulo: 'Trocar para "' + nome + '"?', texto: 'A ordem do culto recomeça do primeiro momento.', sim: 'Trocar'})) agir({tipo: 'ordem', id: sel.value});
  else redesenhar();
});

// Barra de espaco = proximo slide, quando a letra esta na mao. Em campo de
// texto ou num botao em foco, o espaco continua sendo o que sempre foi.
document.addEventListener('keydown', evento => {
  if (evento.code !== 'Space' || evento.repeat || $('dialogo').open) return;
  const l = D && D.louvor, p = D && D.palavra;
  const naPalavra = !!$('lista-palavra') && p && p.ativa;
  const noLouvor = !!$('grade-slides') && l && l.musica && l.letra === 'na_mao';
  if (!podeConduzir() || !(naPalavra || noLouvor)) return;
  const foco = document.activeElement;
  if (foco && /^(INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(foco.tagName)) return;
  evento.preventDefault();
  if (foco && foco.tagName === 'BUTTON') foco.blur();
  if (naPalavra) {
    if (!(p.visivel && p.slide + 1 >= p.total)) agir({tipo: 'palavra_slide', para: 'proximo', visto: p.slide == null ? -1 : p.slide});
  } else if (l.slide + 1 < l.total_slides) agir({tipo: 'louvor_slide', para: 'proximo', visto: l.slide});
});

// -------------------------------------------------------------- consultar --
async function buscarConteudo(versao) {
  if (buscandoConteudo) return;
  buscandoConteudo = true;
  try {
    const r = await fetch('/api/painel/conteudo', {cache: 'no-store'});
    if (r.ok) { C = await r.json(); if (C.versao === versao) redesenhar(); }
  } catch (e) { /* tenta de novo na proxima leitura */ }
  buscandoConteudo = false;
}

async function consultar() {
  try {
    const r = await fetch('/api/painel', {cache: 'no-store'});
    if (r.status === 401) { location.href = '/entrar'; return; }
    if (!r.ok) throw new Error('erro ' + r.status);
    D = await r.json();
    lidoEm = performance.now();
    semContato = 0;
  } catch (erro) {
    semContato++;
    if (!D) D = {ordem: {momentos: []}, sistemas: []};
  }
  if (D.conteudo_versao && (!C || C.versao !== D.conteudo_versao)) buscarConteudo(D.conteudo_versao);
  ensaio.preparar();
  // Com um dialogo aberto ou alguem escolhendo no menu, a tela nao muda
  // embaixo do dedo da pessoa.
  if ($('dialogo').open || (document.activeElement && document.activeElement.id === 'troca-ordem')) return;
  desenhar();
}

// Na igreja a tela le a cada segundo; na web, a cada dois (a igreja so manda
// o retrato de dois em dois, ler mais depressa nao traria nada novo).
(async function laco() {
  await consultar();
  setTimeout(laco, D && D.local === false ? 2000 : 1000);
})();
