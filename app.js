/* Meus Plantões — interface (vanilla JS, dados no próprio aparelho) */
(function () {
  'use strict';
  const C = window.Calc;
  const KEY = 'plantoes.v1';
  const $app = document.getElementById('app');
  const $title = document.getElementById('title');
  const $back = document.getElementById('btn-back');
  const CORES = ['#0f6b5c', '#3b4fa8', '#b0365a', '#c98a0a', '#6b4fa8', '#1d7a8a', '#7a5a1d'];

  // ---------------- estado ----------------
  let db = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { console.error(e); }
    return seed();
  }
  function seed() {
    return {
      versao: 1,
      locais: [Object.assign(novoLocal('HRVJ — Hospital Regional Vale do Jaguaribe', 15, CORES[0]), { toleranciaEntrada: 60, toleranciaSaida: 0 })],
      plantoes: [],
      ui: {},
    };
  }
  function migrate(d) {
    d.locais = d.locais || []; d.plantoes = d.plantoes || []; d.ui = d.ui || {};
    d.locais.forEach(l => { l.toleranciaEntrada = l.toleranciaEntrada || 0; l.toleranciaSaida = l.toleranciaSaida || 0; l.tabelas = l.tabelas || []; l.feriados = l.feriados || []; l.recebidos = l.recebidos || {}; });
    return d;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast('Erro ao salvar: ' + e.message); }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function novoLocal(nome, dia, cor) {
    const y = new Date().getFullYear();
    return {
      id: uid(), nome, cor, diaCompetencia: dia, horaDiurno: '07:00', horaNoturno: '19:00',
      regraNoturno: 'inicio', toleranciaEntrada: 0, toleranciaSaida: 0,
      tabelas: [{ id: uid(), vigencia: `${y}-01-01`, obs: '', valores: C.emptyValores() }],
      feriados: [], recebidos: {},
    };
  }
  const getLocal = id => db.locais.find(l => l.id === id);
  const getPlantao = id => db.plantoes.find(p => p.id === id);

  // ---------------- util ----------------
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function todayISO() { const d = new Date(); return `${d.getFullYear()}-${C.pad(d.getMonth() + 1)}-${C.pad(d.getDate())}`; }
  function toast(msg) {
    const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function diaHora(dt) {
    const [d, h] = dt.split('T');
    return `${C.WEEKDAY_SHORT[C.weekday(d)]}, ${C.fmtDate(d).slice(0, 5)} ${h}`;
  }
  function brNum(v) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function parseNum(s) { if (typeof s === 'number') return s; const n = Number(String(s).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; }
  function periodoLabel(p) { return p === 'D' ? 'Diurno' : 'Noturno'; }
  function compDe(p, local) { return C.competenciaInicio(p.inicio.slice(0, 10), local.diaCompetencia); }

  function statsComp(local, comp) {
    const lista = db.plantoes
      .filter(p => p.localId === local.id && compDe(p, local) === comp)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
    const out = { lista, calc: {}, minutos: 0, minD: 0, minN: 0, valor: 0, grupos: {}, avisos: [] };
    for (const p of lista) {
      const r = C.calcularPlantao(p, local);
      out.calc[p.id] = r;
      out.minutos += r.minutos; out.valor += r.valor;
      (r.avisos || []).forEach(a => out.avisos.push(a));
      for (const s of r.segmentos) {
        if (s.periodo === 'D') out.minD += s.minutos; else out.minN += s.minutos;
        const k = `${s.dayKey}|${s.periodo}|${s.taxa}`;
        const g = out.grupos[k] || (out.grupos[k] = { dayKey: s.dayKey, periodo: s.periodo, taxa: s.taxa, minutos: 0, valor: 0 });
        g.minutos += s.minutos; g.valor += s.valor;
      }
    }
    out.valor = Math.round(out.valor * 100) / 100;
    out.avisos = [...new Set(out.avisos)];
    return out;
  }

  // ---------------- navegação ----------------
  let stack = [{ v: 'painel' }];
  let form = null; // estado do formulário de lançamento
  const TAB_OF = { painel: 'painel', detalhe: 'painel', lancar: 'lancar', locais: 'locais', local: 'locais', tabela: 'locais', dados: 'dados' };
  function cur() { return stack[stack.length - 1]; }
  function go(view, replace) {
    if (replace) { stack = [view]; history.replaceState({ n: 1 }, ''); }
    else { stack.push(view); history.pushState({ n: stack.length }, ''); }
    if (view.v === 'lancar') form = null;
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', () => { if (stack.length > 1) { stack.pop(); render(); } });
  $back.addEventListener('click', () => history.back());
  document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => go({ v: b.dataset.tab }, true)));

  function render() {
    const view = cur();
    const tab = TAB_OF[view.v];
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $back.hidden = stack.length <= 1;
    const fn = VIEWS[view.v] || VIEWS.painel;
    $app.innerHTML = fn(view);
    if (AFTER[view.v]) AFTER[view.v](view);
  }

  // ---------------- views ----------------
  const VIEWS = {};
  const AFTER = {};

  VIEWS.painel = function () {
    $title.textContent = 'Meus Plantões';
    if (!db.locais.length) return `<div class="empty">Cadastre um local de trabalho para começar.<br><br>
      <button class="btn primary" data-act="novo-local">Cadastrar local</button></div>`;
    const hoje = todayISO();
    let total = 0, min = 0, n = 0;
    const cards = db.locais.map(l => {
      const comp = C.competenciaInicio(hoje, l.diaCompetencia);
      const s = statsComp(l, comp);
      total += s.valor; min += s.minutos; n += s.lista.length;
      const semValor = !C.tabelaVigente(l, hoje) || Object.values(C.tabelaVigente(l, hoje).valores).every(v => !v.D && !v.N);
      return `<div class="card tap" data-act="detalhe" data-id="${l.id}" data-comp="${comp}">
        <div class="row"><h2><span class="dot" style="background:${esc(l.cor)}"></span>${esc(l.nome)}</h2>
          ${l.recebidos[comp] ? '<span class="badge b-ok">Recebido</span>' : ''}</div>
        <div class="muted">Competência ${esc(C.competenciaLabel(comp, l.diaCompetencia))}</div>
        <div class="big" style="margin-top:6px">${C.fmtBRL(s.valor)}</div>
        <div class="stats">
          <div class="stat"><b>${s.lista.length}</b><span>plantões</span></div>
          <div class="stat"><b>${C.fmtDur(s.minD)}</b><span>diurno</span></div>
          <div class="stat"><b>${C.fmtDur(s.minN)}</b><span>noturno</span></div>
        </div>
        ${semValor ? '<div class="hint err" style="margin-top:8px">⚠ Valores do contrato ainda não cadastrados — toque em Locais.</div>' : ''}
      </div>`;
    }).join('');

    const recentes = db.plantoes.slice().sort((a, b) => b.inicio.localeCompare(a.inicio)).slice(0, 5);
    const recHTML = recentes.length ? recentes.map(p => {
      const l = getLocal(p.localId); if (!l) return '';
      const r = C.calcularPlantao(p, l);
      return `<div class="shift row"><div><div class="when">${diaHora(p.inicio)} → ${diaHora(p.fim)}</div>
        <div class="muted"><span class="dot" style="background:${esc(l.cor)}"></span>${esc(l.nome)} · ${C.fmtDur(r.minutos)}</div></div>
        <div class="num"><b>${C.fmtBRL(r.valor)}</b></div></div>`;
    }).join('') : '<div class="muted">Nenhum plantão lançado ainda.</div>';

    return `<div class="card hero">
        <div class="label">Produzido nas competências em aberto</div>
        <div class="big">${C.fmtBRL(total)}</div>
        <div class="stats">
          <div class="stat"><b>${n}</b><span>plantões</span></div>
          <div class="stat"><b>${C.fmtDur(min)}</b><span>trabalhadas</span></div>
          <div class="stat"><b>${db.locais.length}</b><span>locais</span></div>
        </div>
      </div>
      ${cards}
      <div class="card"><h2>Últimos lançamentos</h2>${recHTML}</div>
      <button class="btn primary block" data-act="lancar">＋ Lançar plantão</button>`;
  };

  VIEWS.detalhe = function (view) {
    const l = getLocal(view.id);
    if (!l) return '<div class="empty">Local não encontrado.</div>';
    $title.textContent = l.nome;
    const comp = view.comp;
    const fim = C.competenciaFim(comp, l.diaCompetencia);
    const s = statsComp(l, comp);
    const recebido = !!l.recebidos[comp];

    const order = k => C.ALL_KEYS.indexOf(k);
    const grupos = Object.values(s.grupos).sort((a, b) => order(a.dayKey) - order(b.dayKey) || a.periodo.localeCompare(b.periodo) || a.taxa - b.taxa);
    const tabela = grupos.length ? `<table>
      <thead><tr><th>Categoria</th><th class="r">Tempo</th><th class="r">R$/h</th><th class="r">Valor</th></tr></thead>
      <tbody>${grupos.map(g => `<tr>
        <td><span class="badge b-${g.dayKey === 'fer' ? 'F' : g.periodo}">${periodoLabel(g.periodo)}</span> ${C.KEY_LABEL[g.dayKey]}</td>
        <td class="r num">${C.fmtDur(g.minutos)}</td><td class="r num">${brNum(g.taxa)}</td><td class="r num">${C.fmtBRL(g.valor)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td>Total</td><td class="r num">${C.fmtDur(s.minutos)}</td><td></td><td class="r num">${C.fmtBRL(s.valor)}</td></tr></tfoot>
    </table>` : '<div class="muted">Sem plantões nesta competência.</div>';

    // histórico das últimas 6 competências
    const hist = [];
    for (let i = -5; i <= 0; i++) {
      const c = C.moverCompetencia(comp, l.diaCompetencia, i);
      hist.push({ c, v: statsComp(l, c).valor });
    }
    const max = Math.max(1, ...hist.map(h => h.v));
    const bars = hist.map(h => {
      const [, m] = h.c.split('-').map(Number);
      return `<div class="bar ${h.c === comp ? 'cur' : ''}" data-act="detalhe" data-id="${l.id}" data-comp="${h.c}" title="${C.fmtBRL(h.v)}">
        <i style="height:${Math.round(h.v / max * 100)}%"></i><small>${C.MONTHS[m - 1].slice(0, 3)}</small></div>`;
    }).join('');

    const lista = s.lista.length ? s.lista.map(p => {
      const r = s.calc[p.id];
      const segs = r.segmentos.map(x => `<span class="badge b-${x.dayKey === 'fer' ? 'F' : x.periodo}">${x.periodo === 'D' ? '☀' : '☾'} ${C.KEY_LABEL[x.dayKey]} ${C.fmtDur(x.minutos)}</span>`).join(' ');
      return `<div class="shift">
        <div class="row"><div class="when">${diaHora(p.inicio)} → ${diaHora(p.fim)}</div><b class="num">${C.fmtBRL(r.valor)}</b></div>
        <div class="muted">${C.fmtDur(r.minutos)} (${r.minutos} min)${p.obs ? ' · ' + esc(p.obs) : ''}</div>
        ${r.ajustes.map(a => `<div class="hint" style="color:var(--ok)">✓ ${esc(a)}</div>`).join('')}
        <div class="row-wrap" style="margin-top:6px">${segs}</div>
        <div class="acts">
          <button class="btn small" data-act="editar" data-id="${p.id}">Editar</button>
          <button class="btn small" data-act="duplicar" data-id="${p.id}">Duplicar</button>
          <button class="btn small danger" data-act="excluir" data-id="${p.id}">Excluir</button>
        </div></div>`;
    }).join('') : '<div class="muted">Nenhum plantão.</div>';

    return `<div class="compnav">
        <button data-act="comp" data-delta="-1" aria-label="Competência anterior">‹</button>
        <div class="mid"><span class="muted">Competência</span><b>${C.fmtDate(comp)} a ${C.fmtDate(fim)}</b></div>
        <button data-act="comp" data-delta="1" aria-label="Próxima competência">›</button>
      </div>
      <div class="card hero">
        <div class="row"><span class="label">Total da competência</span>${recebido ? '<span class="badge" style="background:rgba(255,255,255,.25)">✓ Recebido</span>' : ''}</div>
        <div class="big">${C.fmtBRL(s.valor)}</div>
        <div class="stats">
          <div class="stat"><b>${s.lista.length}</b><span>plantões</span></div>
          <div class="stat"><b>${C.fmtDur(s.minD)}</b><span>diurno</span></div>
          <div class="stat"><b>${C.fmtDur(s.minN)}</b><span>noturno</span></div>
        </div>
      </div>
      ${s.avisos.length ? `<div class="card err">${s.avisos.map(esc).join('<br>')}</div>` : ''}
      <div class="card"><h2>Resumo por categoria</h2>${tabela}</div>
      <div class="card"><h2>Últimas 6 competências</h2><div class="bars">${bars}</div></div>
      <div class="card"><h2>Plantões</h2>${lista}</div>
      <div class="row-wrap">
        <button class="btn primary" data-act="lancar" data-local="${l.id}">＋ Lançar</button>
        <button class="btn" data-act="csv-comp">Exportar planilha (CSV)</button>
        <button class="btn" data-act="recebido">${recebido ? 'Desmarcar recebido' : 'Marcar como recebido'}</button>
      </div>`;
  };

  // ---------- lançar / editar ----------
  function initForm(view) {
    if (view.editId) {
      const p = getPlantao(view.editId);
      if (p) return { id: p.id, localId: p.localId, ed: p.inicio.slice(0, 10), eh: p.inicio.slice(11), sd: p.fim.slice(0, 10), sh: p.fim.slice(11), obs: p.obs || '', sdManual: true };
    }
    const base = view.dup ? getPlantao(view.dup) : null;
    const localId = view.localId || (base && base.localId) || db.ui.ultimoLocal || (db.locais[0] && db.locais[0].id);
    const l = getLocal(localId) || db.locais[0];
    const d = todayISO();
    const f = {
      id: null, localId: l ? l.id : null, ed: d, eh: base ? base.inicio.slice(11) : (l ? l.horaDiurno : '07:00'),
      sd: d, sh: base ? base.fim.slice(11) : (l ? l.horaNoturno : '19:00'), obs: base ? base.obs || '' : '', sdManual: false,
    };
    autoSaida(f);
    return f;
  }
  function autoSaida(f) {
    if (f.sdManual) return;
    f.sd = f.sh <= f.eh ? C.addDays(f.ed, 1) : f.ed;
  }
  function formPlantao(f) { return { localId: f.localId, inicio: `${f.ed}T${f.eh}`, fim: `${f.sd}T${f.sh}`, obs: f.obs.trim() }; }

  VIEWS.lancar = function (view) {
    $title.textContent = view.editId ? 'Editar plantão' : 'Lançar plantão';
    if (!db.locais.length) return `<div class="empty">Cadastre um local primeiro.<br><br><button class="btn primary" data-act="novo-local">Cadastrar local</button></div>`;
    if (!form) form = initForm(view);
    const f = form;
    const opts = db.locais.map(l => `<option value="${l.id}" ${l.id === f.localId ? 'selected' : ''}>${esc(l.nome)}</option>`).join('');
    return `<div class="card">
      <label for="f-local">Local de trabalho</label>
      <select id="f-local" data-f="localId">${opts}</select>

      <label>Atalhos de turno (a partir da data de entrada)</label>
      <div class="row-wrap">
        <button class="btn small chip" data-act="preset" data-p="D">☀ Diurno 12h</button>
        <button class="btn small chip" data-act="preset" data-p="N">☾ Noturno 12h</button>
        <button class="btn small chip" data-act="preset" data-p="24">24h</button>
      </div>

      <div class="grid2">
        <div><label for="f-ed">Entrada — data</label><input type="date" id="f-ed" data-f="ed" value="${f.ed}"></div>
        <div><label for="f-eh">Entrada — hora</label><input type="time" id="f-eh" data-f="eh" value="${f.eh}"></div>
      </div>
      <div class="hint" id="h-ent"></div>
      <div class="grid2">
        <div><label for="f-sd">Saída — data</label><input type="date" id="f-sd" data-f="sd" value="${f.sd}"></div>
        <div><label for="f-sh">Saída — hora</label><input type="time" id="f-sh" data-f="sh" value="${f.sh}"></div>
      </div>
      <div class="hint" id="h-sai"></div>

      <label for="f-obs">Observação (opcional)</label>
      <input id="f-obs" data-f="obs" value="${esc(f.obs)}" placeholder="Ex.: cobertura, troca com colega…">

      <div class="preview" id="preview"></div>
      <button class="btn primary block" data-act="salvar-plantao">${f.id ? 'Salvar alterações' : 'Salvar plantão'}</button>
    </div>`;
  };
  AFTER.lancar = function () { if (form) updatePreview(); };

  function updatePreview() {
    const f = form; if (!f) return;
    const el = document.getElementById('preview'); if (!el) return;
    const l = getLocal(f.localId);
    const wd = iso => iso ? C.WEEKDAY_NAMES[C.weekday(iso)] : '';
    const he = document.getElementById('h-ent'), hs = document.getElementById('h-sai');
    if (he) he.textContent = f.ed ? wd(f.ed) + (l && C.isFeriado(l, f.ed) ? ' · FERIADO' : '') : '';
    if (hs) hs.textContent = f.sd ? wd(f.sd) + (l && C.isFeriado(l, f.sd) ? ' · FERIADO' : '') : '';
    if (!l || !f.ed || !f.eh || !f.sd || !f.sh) { el.innerHTML = '<span class="muted">Preencha entrada e saída.</span>'; return; }
    const p = formPlantao(f);
    const r = C.calcularPlantao(p, l);
    if (r.erro) { el.innerHTML = `<div class="err">${esc(r.erro)}</div>`; return; }
    const sobrepoe = db.plantoes.filter(o => o.id !== f.id && o.localId === f.localId && o.inicio < p.fim && o.fim > p.inicio);
    const comp = C.competenciaInicio(f.ed, l.diaCompetencia);
    el.innerHTML = `<div class="row"><div><div class="muted">Tempo considerado</div><b>${C.fmtDur(r.minutos)}</b> <span class="muted">(${r.minutos} min)</span>${r.minutosReais !== r.minutos ? `<div class="muted">Real: ${C.fmtDur(r.minutosReais)}</div>` : ''}</div>
      <div style="text-align:right"><div class="muted">Valor</div><div class="big">${C.fmtBRL(r.valor)}</div></div></div>
      <table style="margin-top:8px"><tbody>${r.segmentos.map(s => `<tr>
        <td><span class="badge b-${s.dayKey === 'fer' ? 'F' : s.periodo}">${periodoLabel(s.periodo)}</span> ${C.KEY_LABEL[s.dayKey]}<div class="muted">${s.inicio.slice(11)}–${s.fim.slice(11)}</div></td>
        <td class="r num">${C.fmtDur(s.minutos)}</td><td class="r num">× ${brNum(s.taxa)}</td><td class="r num">${C.fmtBRL(s.valor)}</td></tr>`).join('')}
      </tbody></table>
      ${r.ajustes.map(a => `<div class="hint" style="color:var(--ok);font-weight:600">✓ ${esc(a)}</div>`).join('')}
      <div class="hint">Entra na competência ${esc(C.competenciaLabel(comp, l.diaCompetencia))}.</div>
      ${r.avisos.map(a => `<div class="err hint">⚠ ${esc(a)}</div>`).join('')}
      ${r.segmentos.some(s => !s.taxa) ? '<div class="err hint">⚠ Há período com valor/hora zerado — confira a tabela do contrato.</div>' : ''}
      ${sobrepoe.length ? `<div class="err hint">⚠ Sobrepõe outro plantão neste local (${sobrepoe.map(o => diaHora(o.inicio)).join(', ')}).</div>` : ''}`;
  }

  function aplicarPreset(tipo) {
    const l = getLocal(form.localId); if (!l) return;
    form.sdManual = false;
    if (tipo === 'D') { form.eh = l.horaDiurno; form.sh = l.horaNoturno; }
    if (tipo === 'N') { form.eh = l.horaNoturno; form.sh = l.horaDiurno; }
    if (tipo === '24') { form.eh = l.horaDiurno; form.sh = l.horaDiurno; }
    autoSaida(form);
    render();
  }

  function salvarPlantao() {
    const f = form; const l = getLocal(f.localId);
    if (!l) return toast('Escolha um local.');
    const p = formPlantao(f);
    const r = C.calcularPlantao(p, l);
    if (r.erro) return toast(r.erro);
    if (f.id) Object.assign(getPlantao(f.id), p);
    else db.plantoes.push({ id: uid(), ...p, criadoEm: new Date().toISOString() });
    db.ui.ultimoLocal = l.id;
    save();
    toast(`Plantão salvo · ${C.fmtBRL(r.valor)}`);
    const comp = C.competenciaInicio(f.ed, l.diaCompetencia);
    form = null;
    go({ v: 'detalhe', id: l.id, comp }, true);
  }

  // ---------- locais ----------
  VIEWS.locais = function () {
    $title.textContent = 'Locais e contratos';
    const hoje = todayISO();
    const cards = db.locais.map(l => {
      const t = C.tabelaVigente(l, hoje);
      const v = t ? t.valores : null;
      const resumo = v ? `Seg D/N: ${brNum(v.seg.D)} / ${brNum(v.seg.N)} · Sáb D/N: ${brNum(v.sab.D)} / ${brNum(v.sab.N)} · Feriado D/N: ${brNum(v.fer.D)} / ${brNum(v.fer.N)}` : 'Sem tabela vigente';
      return `<div class="card tap" data-act="abrir-local" data-id="${l.id}">
        <h2><span class="dot" style="background:${esc(l.cor)}"></span>${esc(l.nome)}</h2>
        <div class="muted">Competência inicia dia ${l.diaCompetencia} · Diurno ${l.horaDiurno}–${l.horaNoturno} · Tolerância entrada ${l.toleranciaEntrada || 0} min / saída ${l.toleranciaSaida || 0} min · ${l.tabelas.length} tabela(s) · ${l.feriados.length} feriado(s)</div>
        <div class="hint">R$/h vigente — ${resumo}</div>
      </div>`;
    }).join('');
    return `${cards || '<div class="empty">Nenhum local cadastrado.</div>'}
      <button class="btn primary block" data-act="novo-local">＋ Novo local de trabalho</button>`;
  };

  VIEWS.local = function (view) {
    const l = getLocal(view.id);
    if (!l) return '<div class="empty">Local não encontrado.</div>';
    $title.textContent = 'Editar local';
    const hoje = todayISO();
    const vig = C.tabelaVigente(l, hoje);
    const tabs = l.tabelas.slice().sort((a, b) => b.vigencia.localeCompare(a.vigencia)).map(t => `
      <div class="shift row">
        <div><div class="when">A partir de ${C.fmtDate(t.vigencia)} ${t === vig ? '<span class="badge b-ok">vigente</span>' : ''}</div>
        <div class="muted">${esc(t.obs || 'Sem observação')}</div></div>
        <button class="btn small" data-act="abrir-tabela" data-tab="${t.id}">Editar</button>
      </div>`).join('');
    const ferAno = new Date().getFullYear();
    const fers = l.feriados.slice().sort((a, b) => a.data.localeCompare(b.data)).map(f => `
      <div class="shift row"><div><b>${C.fmtDate(f.data)}</b> <span class="muted">${C.WEEKDAY_SHORT[C.weekday(f.data)]}</span><div class="muted">${esc(f.nome)}</div></div>
      <button class="btn small danger" data-act="del-feriado" data-data="${f.data}">Remover</button></div>`).join('');
    const nPl = db.plantoes.filter(p => p.localId === l.id).length;

    return `<div class="card">
      <h2>Dados do local</h2>
      <label for="l-nome">Nome</label><input id="l-nome" data-l="nome" value="${esc(l.nome)}">
      <label>Cor</label>
      <div class="row-wrap">${CORES.map(c => `<button class="btn small chip" data-act="cor" data-cor="${c}" style="background:${c};width:34px;${c === l.cor ? 'outline:3px solid var(--text)' : ''}" aria-label="cor"></button>`).join('')}</div>
      <label for="l-dia">Dia do mês em que a competência inicia</label>
      <input id="l-dia" type="number" min="1" max="31" inputmode="numeric" data-l="diaCompetencia" value="${l.diaCompetencia}">
      <div class="hint">Ex.: 15 → competência de 15 de um mês até 14 do mês seguinte. Use 1 para mês cheio. O plantão entra na competência da data de entrada.</div>
      <div class="grid2">
        <div><label for="l-hd">Início do diurno</label><input id="l-hd" type="time" data-l="horaDiurno" value="${l.horaDiurno}"></div>
        <div><label for="l-hn">Início do noturno</label><input id="l-hn" type="time" data-l="horaNoturno" value="${l.horaNoturno}"></div>
      </div>
      <label for="l-regra">Noite que atravessa a meia-noite</label>
      <select id="l-regra" data-l="regraNoturno">
        <option value="inicio" ${l.regraNoturno === 'inicio' ? 'selected' : ''}>Vale pelo dia em que a noite começou (19h de sexta → 7h de sábado = noite de sexta)</option>
        <option value="calendario" ${l.regraNoturno === 'calendario' ? 'selected' : ''}>Após 0h vale pelo dia do calendário (0h–7h de sábado = sábado)</option>
      </select>
      <h3>Tolerância de horário</h3>
      <div class="grid2">
        <div><label for="l-te">Atraso tolerado na entrada (min)</label><input id="l-te" type="number" min="0" max="720" inputmode="numeric" data-l="toleranciaEntrada" value="${l.toleranciaEntrada || 0}"></div>
        <div><label for="l-ts">Saída antecipada tolerada (min)</label><input id="l-ts" type="number" min="0" max="720" inputmode="numeric" data-l="toleranciaSaida" value="${l.toleranciaSaida || 0}"></div>
      </div>
      <div class="hint">0 = sem tolerância. Ex.: 60 → entrada até 08:00 (ou 20:00) conta como 07:00 (19:00); a partir de 1h01 de atraso conta a hora exata. Vale para as trocas de turno (${l.horaDiurno} e ${l.horaNoturno}).</div>
      <div class="hint">Alterações salvas automaticamente.</div>
    </div>

    <div class="card">
      <h2>Tabelas de valores (R$/hora)</h2>
      <div class="muted">Cada reajuste é uma nova tabela com data de vigência. Plantões antigos continuam usando o valor da época.</div>
      ${tabs}
      <button class="btn block" data-act="nova-tabela">＋ Nova tabela / reajuste</button>
    </div>

    <div class="card">
      <h2>Feriados com valor especial</h2>
      <div class="muted">Só as datas listadas aqui usam a linha "Feriado" da tabela (diurno e a noite que começa nesse dia).</div>
      ${fers || '<div class="muted" style="margin-top:8px">Nenhum feriado cadastrado.</div>'}
      <div class="grid2" style="margin-top:8px">
        <div><label for="fer-data">Data</label><input type="date" id="fer-data"></div>
        <div><label for="fer-nome">Nome</label><input id="fer-nome" placeholder="Ex.: Natal"></div>
      </div>
      <button class="btn block" data-act="add-feriado">Adicionar feriado</button>
      <div class="row-wrap" style="margin-top:10px">
        <button class="btn small" data-act="fer-nac" data-ano="${ferAno}">Sugerir nacionais ${ferAno}</button>
        <button class="btn small" data-act="fer-nac" data-ano="${ferAno + 1}">Sugerir nacionais ${ferAno + 1}</button>
      </div>
      <div class="hint">A sugestão inclui Carnaval, Corpus Christi e vésperas de Natal/Ano-Novo — remova o que o contrato não considerar feriado.</div>
    </div>

    <button class="btn danger block" data-act="del-local">Excluir local${nPl ? ` e seus ${nPl} plantões` : ''}</button>`;
  };

  VIEWS.tabela = function (view) {
    const l = getLocal(view.id); const t = l && l.tabelas.find(x => x.id === view.tab);
    if (!t) return '<div class="empty">Tabela não encontrada.</div>';
    $title.textContent = 'Valores do contrato';
    const v = t.valores;
    const rows = C.ALL_KEYS.map(k => `<tr><td>${C.KEY_LABEL[k]}</td>
      <td><input inputmode="decimal" data-rate="${k}|D" value="${brNum(v[k].D)}"></td>
      <td><input inputmode="decimal" data-rate="${k}|N" value="${brNum(v[k].N)}"></td></tr>`).join('');
    return `<div class="card">
      <div class="muted">${esc(l.nome)}</div>
      <label for="t-vig">Vigente a partir de</label><input type="date" id="t-vig" data-t="vigencia" value="${t.vigencia}">
      <label for="t-obs">Observação</label><input id="t-obs" data-t="obs" value="${esc(t.obs || '')}" placeholder="Ex.: Contrato 2026 / aditivo nº 2">
    </div>
    <div class="card">
      <h2>Preenchimento rápido</h2>
      <div class="muted">Preencha e toque em "Aplicar" para replicar na grade abaixo.</div>
      <table class="rates"><thead><tr><th></th><th class="r">Diurno</th><th class="r">Noturno</th></tr></thead><tbody>
        <tr><td>Seg a Sex</td><td><input inputmode="decimal" id="q-uD" placeholder="0,00"></td><td><input inputmode="decimal" id="q-uN" placeholder="0,00"></td></tr>
        <tr><td>Sáb e Dom</td><td><input inputmode="decimal" id="q-fD" placeholder="0,00"></td><td><input inputmode="decimal" id="q-fN" placeholder="0,00"></td></tr>
        <tr><td>Feriado</td><td><input inputmode="decimal" id="q-xD" placeholder="0,00"></td><td><input inputmode="decimal" id="q-xN" placeholder="0,00"></td></tr>
      </tbody></table>
      <button class="btn block" data-act="aplicar-rapido">Aplicar à grade</button>
    </div>
    <div class="card">
      <h2>Valor da hora por dia e turno (R$)</h2>
      <table class="rates"><thead><tr><th>Dia</th><th class="r">Diurno</th><th class="r">Noturno</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="hint">Salvo automaticamente. Todos os plantões dentro desta vigência são recalculados na hora.</div>
    </div>
    ${l.tabelas.length > 1 ? '<button class="btn danger block" data-act="del-tabela">Excluir esta tabela</button>' : ''}`;
  };

  VIEWS.dados = function () {
    $title.textContent = 'Dados e backup';
    const bytes = new Blob([JSON.stringify(db)]).size;
    return `<div class="card">
      <h2>Backup</h2>
      <div class="muted">Os dados ficam apenas neste aparelho/navegador. Faça backup regularmente (ex.: salve no Google Drive ou envie no WhatsApp para você mesmo).</div>
      <button class="btn primary block" data-act="export-json">Baixar backup (.json)</button>
      <label for="imp" class="btn block" style="color:var(--text);font-size:15px;margin-top:10px">Restaurar backup…</label>
      <input type="file" id="imp" accept="application/json,.json" hidden>
      <div class="hint">${db.plantoes.length} plantões · ${db.locais.length} locais · ${(bytes / 1024).toFixed(1)} KB</div>
    </div>
    <div class="card">
      <h2>Planilha</h2>
      <div class="muted">Todos os plantões, com valores calculados, em CSV (abre no Excel/Google Planilhas).</div>
      <button class="btn block" data-act="csv-all">Exportar todos os plantões (CSV)</button>
    </div>
    <div class="card">
      <h2>Como o cálculo funciona</h2>
      <div class="muted">
        • O tempo é contado minuto a minuto entre a entrada e a saída.<br>
        • Cada minuto é classificado como diurno (padrão 7h–19h) ou noturno (19h–7h).<br>
        • O valor/hora vem da tabela do local vigente na data do período, conforme o dia da semana — ou da linha "Feriado" se a data estiver na lista de feriados do local.<br>
        • Tolerância (se configurada no local): atraso na entrada até o limite conta como entrada no horário do turno; acima do limite conta a hora exata. O mesmo vale para saída antecipada.<br>
        • Valor = minutos ÷ 60 × R$/hora, arredondado ao centavo por período.<br>
        • A competência é definida pela data de entrada do plantão.
      </div>
    </div>
    <button class="btn danger block" data-act="apagar-tudo">Apagar todos os dados</button>`;
  };
  AFTER.dados = function () {
    const inp = document.getElementById('imp');
    inp.addEventListener('change', () => {
      const file = inp.files[0]; if (!file) return;
      file.text().then(txt => {
        const d = JSON.parse(txt);
        if (!d || !Array.isArray(d.locais) || !Array.isArray(d.plantoes)) throw new Error('arquivo inválido');
        if (!confirm(`Restaurar backup com ${d.plantoes.length} plantões e ${d.locais.length} locais? Os dados atuais serão substituídos.`)) return;
        db = migrate(d); save(); toast('Backup restaurado'); go({ v: 'painel' }, true);
      }).catch(e => toast('Não foi possível ler: ' + e.message));
    });
  };

  // ---------------- exportação ----------------
  function download(nome, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function csv(plantoes) {
    const head = ['Local', 'Competência', 'Entrada', 'Dia entrada', 'Saída', 'Dia saída', 'Duração', 'Minutos', 'Min diurno', 'Min noturno', 'Valor (R$)', 'Detalhamento', 'Observação'];
    const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const linhas = plantoes.slice().sort((a, b) => a.inicio.localeCompare(b.inicio)).map(p => {
      const l = getLocal(p.localId); if (!l) return null;
      const r = C.calcularPlantao(p, l);
      const comp = compDe(p, l);
      const minD = r.segmentos.filter(s => s.periodo === 'D').reduce((a, s) => a + s.minutos, 0);
      const det = r.segmentos.map(s => `${C.KEY_LABEL[s.dayKey]} ${periodoLabel(s.periodo)} ${C.fmtDur(s.minutos)} x ${brNum(s.taxa)} = ${brNum(s.valor)}`).join(' | ');
      const dt = x => `${C.fmtDate(x.slice(0, 10))} ${x.slice(11)}`;
      return [l.nome, C.competenciaLabel(comp, l.diaCompetencia), dt(p.inicio), C.WEEKDAY_NAMES[C.weekday(p.inicio.slice(0, 10))],
        dt(p.fim), C.WEEKDAY_NAMES[C.weekday(p.fim.slice(0, 10))], C.fmtDur(r.minutos), r.minutos, minD, r.minutos - minD,
        brNum(r.valor), det, p.obs || ''].map(q).join(';');
    }).filter(Boolean);
    return '﻿' + [head.map(q).join(';'), ...linhas].join('\r\n');
  }

  // ---------------- eventos ----------------
  $app.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act; const view = cur();
    const l = view.id ? getLocal(view.id) : null;
    switch (act) {
      case 'detalhe': go({ v: 'detalhe', id: b.dataset.id, comp: b.dataset.comp }, view.v === 'detalhe'); if (view.v === 'detalhe') stack = [{ v: 'painel' }, stack[0]]; break;
      case 'comp': view.comp = C.moverCompetencia(view.comp, l.diaCompetencia, Number(b.dataset.delta)); render(); break;
      case 'lancar': go({ v: 'lancar', localId: b.dataset.local }); break;
      case 'editar': go({ v: 'lancar', editId: b.dataset.id }); break;
      case 'duplicar': go({ v: 'lancar', dup: b.dataset.id }); break;
      case 'excluir': {
        const p = getPlantao(b.dataset.id);
        if (p && confirm(`Excluir o plantão de ${diaHora(p.inicio)}?`)) {
          db.plantoes = db.plantoes.filter(x => x.id !== p.id); save(); render(); toast('Plantão excluído');
        } break;
      }
      case 'recebido': l.recebidos[view.comp] ? delete l.recebidos[view.comp] : (l.recebidos[view.comp] = new Date().toISOString()); save(); render(); break;
      case 'csv-comp': {
        const s = statsComp(l, view.comp);
        download(`plantoes_${l.nome.split(' ')[0]}_${view.comp}.csv`, csv(s.lista), 'text/csv;charset=utf-8'); break;
      }
      case 'preset': aplicarPreset(b.dataset.p); break;
      case 'salvar-plantao': salvarPlantao(); break;
      case 'novo-local': {
        const nl = novoLocal('Novo local', 1, CORES[db.locais.length % CORES.length]);
        db.locais.push(nl); save(); go({ v: 'local', id: nl.id }); break;
      }
      case 'abrir-local': go({ v: 'local', id: b.dataset.id }); break;
      case 'cor': l.cor = b.dataset.cor; save(); render(); break;
      case 'nova-tabela': {
        const base = C.tabelaVigente(l, todayISO()) || l.tabelas[l.tabelas.length - 1];
        const t = { id: uid(), vigencia: todayISO(), obs: 'Reajuste', valores: JSON.parse(JSON.stringify(base ? base.valores : C.emptyValores())) };
        l.tabelas.push(t); save(); go({ v: 'tabela', id: l.id, tab: t.id }); break;
      }
      case 'abrir-tabela': go({ v: 'tabela', id: l.id, tab: b.dataset.tab }); break;
      case 'del-tabela':
        if (confirm('Excluir esta tabela de valores?')) { l.tabelas = l.tabelas.filter(t => t.id !== view.tab); save(); history.back(); }
        break;
      case 'aplicar-rapido': {
        const t = l.tabelas.find(x => x.id === view.tab);
        const get = id => { const v = document.getElementById(id).value; return v.trim() === '' ? null : parseNum(v); };
        const set = (keys, p, val) => { if (val !== null) keys.forEach(k => { t.valores[k][p] = val; }); };
        const util = ['seg', 'ter', 'qua', 'qui', 'sex'], fds = ['sab', 'dom'];
        set(util, 'D', get('q-uD')); set(util, 'N', get('q-uN'));
        set(fds, 'D', get('q-fD')); set(fds, 'N', get('q-fN'));
        set(['fer'], 'D', get('q-xD')); set(['fer'], 'N', get('q-xN'));
        save(); render(); toast('Valores aplicados'); break;
      }
      case 'add-feriado': {
        const data = document.getElementById('fer-data').value, nome = document.getElementById('fer-nome').value.trim();
        if (!data) return toast('Informe a data');
        if (l.feriados.some(f => f.data === data)) return toast('Data já cadastrada');
        l.feriados.push({ data, nome: nome || 'Feriado' }); save(); render(); break;
      }
      case 'del-feriado': l.feriados = l.feriados.filter(f => f.data !== b.dataset.data); save(); render(); break;
      case 'fer-nac': {
        const novos = C.feriadosNacionais(Number(b.dataset.ano)).filter(f => !l.feriados.some(x => x.data === f.data));
        l.feriados.push(...novos); save(); render(); toast(`${novos.length} feriados adicionados`); break;
      }
      case 'del-local':
        if (confirm(`Excluir "${l.nome}" e todos os seus plantões? Isso não pode ser desfeito.`)) {
          db.plantoes = db.plantoes.filter(p => p.localId !== l.id);
          db.locais = db.locais.filter(x => x.id !== l.id); save(); go({ v: 'locais' }, true);
        } break;
      case 'export-json': download(`backup_plantoes_${todayISO()}.json`, JSON.stringify(db, null, 2), 'application/json'); break;
      case 'csv-all': download(`plantoes_todos_${todayISO()}.csv`, csv(db.plantoes), 'text/csv;charset=utf-8'); break;
      case 'apagar-tudo':
        if (confirm('Apagar TODOS os locais e plantões deste aparelho?') && confirm('Tem certeza? Faça um backup antes.')) {
          localStorage.removeItem(KEY); db = seed(); save(); go({ v: 'painel' }, true);
        } break;
    }
  });

  function onField(e) {
    const el = e.target; const view = cur();
    if (el.dataset.f && form) {
      const k = el.dataset.f;
      form[k] = el.value;
      if (k === 'sd') form.sdManual = true;
      if (k === 'ed' || k === 'eh' || k === 'sh') {
        autoSaida(form);
        const sd = document.getElementById('f-sd'); if (sd) sd.value = form.sd;
      }
      if (k === 'localId' && e.type === 'change') { db.ui.ultimoLocal = form.localId; }
      updatePreview();
      return;
    }
    if (el.dataset.l) {
      const l = getLocal(view.id); const k = el.dataset.l;
      if (k === 'toleranciaEntrada' || k === 'toleranciaSaida') { const n = parseInt(el.value, 10); l[k] = n >= 0 ? Math.min(n, 720) : 0; save(); return; }
      if (k === 'diaCompetencia') { const n = parseInt(el.value, 10); if (n >= 1 && n <= 31) l.diaCompetencia = n; else return; }
      else if ((k === 'horaDiurno' || k === 'horaNoturno') && !el.value) return;
      else l[k] = el.value;
      if (C.hhmmToMin(l.horaDiurno) >= C.hhmmToMin(l.horaNoturno)) toast('O início do diurno deve ser antes do noturno');
      save(); return;
    }
    if (el.dataset.t) {
      const l = getLocal(view.id); const t = l.tabelas.find(x => x.id === view.tab);
      if (el.dataset.t === 'vigencia' && !el.value) return;
      t[el.dataset.t] = el.value; save(); return;
    }
    if (el.dataset.rate) {
      const l = getLocal(view.id); const t = l.tabelas.find(x => x.id === view.tab);
      const [k, p] = el.dataset.rate.split('|');
      t.valores[k][p] = parseNum(el.value); save(); return;
    }
  }
  $app.addEventListener('input', onField);
  $app.addEventListener('change', e => {
    onField(e);
    if (e.target.dataset.rate) e.target.value = brNum(parseNum(e.target.value));
  });
  $app.addEventListener('focusin', e => { if (e.target.dataset.rate) e.target.select(); });

  // ---------------- início ----------------
  history.replaceState({ n: 1 }, '');
  render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
