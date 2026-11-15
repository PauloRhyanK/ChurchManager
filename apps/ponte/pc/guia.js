// O GUIA — a parte comum a /aqui (a pagina de cada PC) e /chegada (o celular).
//
// As duas paginas falam com /api/aqui, que existe em TODA maquina: na
// principal ela responde na hora; nas outras, busca na principal. Por isso
// este arquivo nao sabe, nem precisa saber, em que maquina esta rodando.

const $ = id => document.getElementById(id);
const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const G = {
  d: null,              // a ultima resposta de /api/aqui
  semContato: false,
  torto: 0,             // relogio da ponte menos o relogio deste aparelho
  pulados: new Set(),   // "pular por enquanto" — vale so neste aparelho
  res: {},              // o que cada clique respondeu
  ocup: new Set(),
  como: false,          // o "Como faço isso?" esta aberto
  fixo: null,           // passo que a pessoa voltou para ver
  sig: '',
  render() {},          // cada pagina poe a sua
  extra() { return null; },   // estado da pagina que tambem pede redesenho
  aoVoltar() {},        // "Voltar" no primeiro passo
};

const ch = () => G.d && G.d.chegada;
const ilhaDe = id => ch().ilhas.find(i => i.id === id);
const medida = nome => { const p = ch().passos.find(p => p.confere === nome); return p ? p.medida : null; };

function passosDas(ids) {
  const saida = [];
  for (const id of ids) for (const p of ch().passos) if (p.ilha === id) saida.push(p);
  return saida;
}

// O passo DA VEZ: o primeiro que falta. Os pulados voltam no fim, quando
// todo o resto ja foi — pular e "depois", nao "nunca".
function passoDaVez(lista) {
  if (G.fixo) {
    const p = lista.find(p => p.id === G.fixo);
    if (p) return p;
    G.fixo = null;
  }
  return lista.find(p => !p.feito && !G.pulados.has(p.id)) || lista.find(p => !p.feito) || null;
}

function haQuanto(em) {
  const s = Math.max(0, Math.round(Date.now() / 1000 + G.torto - em));
  if (s < 3) return 'agora';
  if (s < 90) return 'há ' + s + ' s';
  return 'há ' + Math.round(s / 60) + ' min';
}

function faltam() {
  const c = ch() && ch().culto;
  if (!c || !c.hora) return '';
  const [h, m] = c.hora.split(':').map(Number);
  const alvo = new Date(); alvo.setHours(h, m, 0, 0);
  const min = Math.round((alvo - new Date()) / 60000);
  if (min > 90) return 'faltam ' + Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0');
  if (min > 0) return 'faltam ' + min + ' min';
  if (min > -240) return 'o culto já começou';
  return '';
}

function relogios() {
  document.querySelectorAll('[data-em]').forEach(el => { el.textContent = haQuanto(parseFloat(el.dataset.em)); });
  document.querySelectorAll('[data-faltam]').forEach(el => { const t = faltam(); el.textContent = t ? ' · ' + t : ''; });
}
setInterval(relogios, 1000);

// -------------------------------------------------------------------------
// A PERGUNTA DA VEZ
// -------------------------------------------------------------------------
const DESENHOS = {
  notebook: `<svg class="desenho" viewBox="0 0 340 130" role="img" aria-label="Notebook visto de cima: USB entra pela esquerda, cabo de rede pela direita">
    <rect x="100" y="18" width="140" height="94" rx="10" fill="#18212c" stroke="#5b6b80" stroke-width="2"></rect>
    <rect x="116" y="32" width="108" height="58" rx="4" fill="#0f1720"></rect>
    <path d="M100 52 H42" stroke="#3b82f6" stroke-width="6" stroke-linecap="round"></path>
    <path d="M100 78 H42" stroke="#3b82f6" stroke-width="6" stroke-linecap="round"></path>
    <text x="6" y="70" fill="#a9c9ff" font-size="16" font-weight="700" font-family="Segoe UI, sans-serif">USB</text>
    <path d="M240 65 H298" stroke="#22c55e" stroke-width="7" stroke-linecap="round"></path>
    <text x="300" y="46" fill="#6ee7a0" font-size="16" font-weight="700" font-family="Segoe UI, sans-serif" text-anchor="end">Rede</text></svg>`,
};

function htmlPasso(p, lista) {
  const n = lista.indexOf(p), m = p.medida;
  const falha = !p.feito && m && m.ok === false;
  const forcado = p.feito && p.como_feito === 'forcado';
  const ocupado = G.ocup.has(p.id) || (p.acao && p.acao.ocupado);
  const il = ilhaDe(p.ilha);

  let h = `<div class="w-topo">
      <button class="leve cinza" data-voltar="1">‹ Voltar</button>
      <div class="seg">${lista.map(x => `<i class="${x.feito ? 'f' : (x.id === p.id ? 'a' : (x.medida && x.medida.ok === false ? 'r' : ''))}"></i>`).join('')}</div>
      <span><b>${n + 1}</b> de ${lista.length}<span data-faltam></span></span>
    </div>
    <div class="w-meio">
      <div class="rotulo">${e(il ? il.nome : '')}</div>`;

  if (p.tipo === 'confere') {
    const cls = !m || m.ok == null ? '' : (m.ok ? 'sim' : 'nao');
    h += `<div class="pilula ${cls}"><i></i><span>${e(m ? m.detalhe : 'medindo…')}${m && m.desde ? ` · <span data-em="${m.desde}"></span>` : ''}</span></div>`;
  }
  h += `<h1 class="frase">${e(p.frase)}</h1>`;
  if (p.apoio) h += `<p class="apoio">${e(p.apoio)}</p>`;
  if (p.desenho && DESENHOS[p.desenho]) h += DESENHOS[p.desenho];
  if (p.imagem === 'obs') h += `<div class="foto" data-foto="1"><img alt="O que o OBS está pondo no ar agora" src="/api/aqui/imagem?t=${Date.now()}"
      onerror="this.parentNode.textContent='Não consegui a foto do OBS. Ele está aberto?'"></div>`;

  const r = G.res[p.id];
  if (r) h += `<div class="caixa ${r.ok ? 'res-ok' : 'res-nao'}">${e(r.texto)}</div>`;
  if (falha && p.se_falhar) h += `<div class="caixa falhar"><b class="t">O que fazer</b>${e(p.se_falhar)}</div>`;

  const temComo = p.como.length || p.porque || (p.tipo === 'confere' && !p.feito);
  if (temComo && !G.como) h += `<button class="leve" data-como="1">Como faço isso?</button>`;
  if (temComo && G.como) {
    h += '<div class="caixa como">';
    if (p.como.length) h += '<ol>' + p.como.map(x => `<li>${e(x)}</li>`).join('') + '</ol>';
    if (p.porque) h += `<p><b class="t">Por quê</b>${e(p.porque)}</p>`;
    if (p.tipo === 'confere' && !p.feito) h += `<button class="leve cinza" data-forcar="${e(p.id)}">A medida está errada — marcar como feito mesmo assim</button>`;
    h += `<div><button class="leve cinza" data-como="0">Fechar</button></div></div>`;
  }
  h += '</div><div class="w-pe">';

  if (p.feito) {
    h += `<button class="bt forte" data-continuar="1">Continuar</button>`;
    if (p.tipo !== 'confere' || forcado) h += `<button class="leve cinza" data-desfazer="${e(p.id)}">Desmarcar${p.feito_em ? ' (feito às ' + e(p.feito_em) + ')' : ''}</button>`;
  } else {
    if (p.acao) h += `<button class="bt forte" data-acao="${e(p.id)}" ${p.acao.confirmar ? 'data-confirmar="1"' : ''} ${ocupado ? 'disabled' : ''}>${ocupado ? 'Fazendo…' : e(p.acao.rotulo)}</button>`;
    if (p.link) h += `<a class="bt" href="${e(p.link.url)}" target="_blank" rel="noopener">${e(p.link.rotulo)}</a>`;
    if (p.imagem === 'obs') h += `<button class="bt" data-foto-de="1">Atualizar a foto</button>`;
    if (p.tipo !== 'confere') h += `<button class="bt feito" data-feito="${e(p.id)}">Feito</button>`;
    h += `<button class="leve cinza" data-pular="${e(p.id)}">Pular por enquanto</button>`;
  }
  return h + '</div>';
}

// -------------------------------------------------------------------------
// AGORA NA IGREJA — uma peca por coisa que importa
// -------------------------------------------------------------------------
function pecas() {
  const c = ch(), lista = [];
  const por = (nome, m, sim, nao) => {
    if (!m || m.ok == null) lista.push({nome, cls: '', estado: 'sem medida', det: m ? m.detalhe : ''});
    else lista.push({nome, cls: m.ok ? 'sim' : 'nao', estado: m.ok ? sim : nao, det: m.ok ? '' : m.detalhe, desde: m.ok ? null : m.desde});
  };
  if (medida('holyrics') !== null) por('Holyrics', medida('holyrics'), 'aberto', 'não responde');
  if (medida('obs') !== null) {
    const t = medida('transmitindo');
    por('OBS', medida('obs'), t && t.ok ? 'ao vivo' : 'aberto', 'não responde');
  }
  if (medida('tv') !== null) por('TV de retorno', medida('tv'), 'ligada', 'desligada');
  if (medida('luz') !== null) por('Luz', medida('luz'), 'respondendo', 'parada');
  // Funcoes que a ponte NAO mede (mesa de som, cameras): o que da para dizer
  // e quantos passos alguem ja marcou.
  for (const il of c.ilhas) {
    if (c.passos.some(p => p.ilha === il.id && p.tipo === 'confere')) continue;
    const veio = !c.culto || (c.culto.presentes || []).includes(il.id);
    if (il.feitos >= il.total) lista.push({nome: il.nome, cls: 'sim', estado: 'pronto', det: ''});
    else if (il.feitos === 0 && !veio) lista.push({nome: il.nome, cls: '', estado: 'ninguém ainda', det: ''});
    else lista.push({nome: il.nome, cls: 'meio', estado: il.feitos ? 'faltam ' + (il.total - il.feitos) : 'chegando', det: ''});
  }
  lista.push({nome: 'Letras', cls: '', estado: c.letras_modo === 'automatico' ? 'automático' : 'manual',
              det: c.letras_modo === 'automatico' ? 'seguindo o timecode' : 'automático desativado'});
  return lista;
}

function htmlPecas(lista, emFila) {
  // O que esta vermelho vai para o topo: e a unica coisa urgente da tela.
  const ordenada = [...lista].sort((a, b) => (b.cls === 'nao') - (a.cls === 'nao'));
  return `<div class="pecas ${emFila ? 'fila' : ''}">` + ordenada.map(x => `<div class="peca ${x.cls}">
      <div class="e"><i></i>${e(x.estado)}${x.desde ? ` · <span data-em="${x.desde}"></span>` : ''}</div>
      <div class="n">${e(x.nome)}</div>${x.det ? `<div class="d">${e(x.det)}</div>` : ''}</div>`).join('') + '</div>';
}

function htmlEndereco(pequeno) {
  const c = ch(), local = (G.d.painel_local || '').replace(/^https?:\/\//, '');
  const web = c && c.endereco;
  return `<div class="endereco ${pequeno ? 'pequeno' : ''}"><div class="l">Controle tudo pelo celular</div>
    <div class="u">${e(web || local)}</div>
    <div class="s">${web ? 'Sem internet: ' + e(local) : 'no Wi-Fi da igreja'}</div></div>`;
}

// -------------------------------------------------------------------------
// FALAR COM A PONTE E REDESENHAR
//
// A tela so e refeita quando algo MUDA de verdade. As horas das medidas mudam
// sempre; redesenhar por causa delas faria a foto piscar e o botao se refazer
// debaixo do dedo. Por isso a assinatura ignora as horas.
// -------------------------------------------------------------------------
function assinar() {
  const c = ch();
  return JSON.stringify([
    G.d && [G.d.papel, G.d.principal_ok, G.d.local, G.d.painel_local, G.d.erro],
    c && [c.passos.map(p => [p.id, p.feito, p.como_feito, p.frase, p.apoio, p.acao, p.medida && [p.medida.ok, p.medida.detalhe, p.medida.desde]]),
          c.ilhas, c.culto, c.ordem && c.ordem.id, c.endereco, c.letras_modo, c.erro_do_roteiro],
    G.semContato, [...G.pulados], G.res, [...G.ocup], G.como, G.fixo, G.extra()]);
}

function redesenhar(forcar) {
  if (!G.d) return;
  const nova = assinar();
  if (!forcar && nova === G.sig) { relogios(); return; }
  G.sig = nova;
  G.render();
  relogios();
}

async function buscar() {
  try {
    const r = await fetch('/api/aqui', {cache: 'no-store'});
    // Na versao web a sessao vence depois de algumas horas: volta para a
    // tela de senha em vez de ficar mostrando "sem contato" para sempre.
    if (r.status === 401) { location.href = '/entrar'; return; }
    if (!r.ok) throw new Error(r.status);
    G.d = await r.json();
    if (ch()) G.torto = ch().agora - Date.now() / 1000;
    G.semContato = false;
  } catch (x) { G.semContato = true; }
  redesenhar(false);
}

async function mandar(caminho, corpo) {
  const r = await fetch(caminho, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(corpo || {})});
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !('ok' in j)) throw new Error(j.erro || ('erro ' + r.status));
  return j;
}

function receberChegada(nova) {
  if (nova && nova.passos && G.d) { G.d.chegada = nova; G.torto = nova.agora - Date.now() / 1000; }
  redesenhar(true);
}

document.addEventListener('click', async ev => {
  const alvo = ev.target.closest('button');
  if (!alvo || !G.d) return;
  const d = alvo.dataset;

  if (d.como !== undefined)  { G.como = d.como === '1'; redesenhar(true); return; }
  if (d.voltar)              { G.como = false; G.aoVoltar(); return; }
  if (d.continuar)           { G.fixo = null; G.como = false; redesenhar(true); return; }
  if (d.pular)               { G.pulados.add(d.pular); G.fixo = null; G.como = false; redesenhar(true); return; }
  if (d.fotoDe) {
    const caixa = document.querySelector('[data-foto]');
    if (caixa) caixa.innerHTML = `<img alt="O que o OBS está pondo no ar agora" src="/api/aqui/imagem?t=${Date.now()}"
      onerror="this.parentNode.textContent='Não consegui a foto do OBS. Ele está aberto?'">`;
    return;
  }
  const id = d.feito || d.desfazer || d.forcar || d.acao;
  if (!id) return;
  try {
    if (d.feito) {
      delete G.res[id]; G.fixo = null; G.como = false; G.pulados.delete(id);
      receberChegada(await mandar('/api/aqui/feito/' + encodeURIComponent(id), {feito: true}));
    } else if (d.desfazer) {
      delete G.res[id];
      receberChegada(await mandar('/api/aqui/feito/' + encodeURIComponent(id), {feito: false}));
    } else if (d.forcar) {
      if (!confirm('Marcar como feito sem a medida confirmar?\n\nUse só se você conferiu com os olhos e a medida está errada.')) return;
      G.como = false;
      receberChegada(await mandar('/api/aqui/feito/' + encodeURIComponent(id), {feito: true, forcado: true}));
    } else if (d.acao) {
      if (d.confirmar && !confirm(alvo.textContent.trim() + '?')) return;
      G.ocup.add(id); delete G.res[id]; redesenhar(true);
      let j;
      try { j = await mandar('/api/aqui/acao/' + encodeURIComponent(id), {}); }
      finally { G.ocup.delete(id); }
      G.res[id] = {ok: !!j.ok, texto: j.texto || (j.ok ? 'feito' : 'não deu certo')};
      receberChegada(j.chegada);
    }
  } catch (x) {
    G.res[id] = {ok: false, texto: 'Não consegui falar com a ponte: ' + x.message};
    redesenhar(true);
  }
});

function comecar() { buscar(); setInterval(buscar, 3000); }
