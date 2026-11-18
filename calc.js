/*
 * Motor de cálculo dos plantões.
 * Trabalha com datas/horas "locais ingênuas" (sem fuso), convertidas para
 * minutos via Date.UTC — evita qualquer problema de fuso/horário de verão.
 */
(function (root) {
  'use strict';

  const DAY_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const ALL_KEYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom', 'fer'];
  const KEY_LABEL = {
    seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta',
    sab: 'Sábado', dom: 'Domingo', fer: 'Feriado',
  };
  const WEEKDAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
    'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  // ---------- datas ----------
  function parseDT(str) {
    const [d, t = '00:00'] = String(str).split('T');
    const [y, m, dd] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    return Date.UTC(y, m - 1, dd, h, mi) / 60000;
  }
  function dateToMin(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 60000;
  }
  function isoDate(min) { return new Date(min * 60000).toISOString().slice(0, 10); }
  function isoDT(min) { return new Date(min * 60000).toISOString().slice(0, 16); }
  function weekday(iso) { return new Date(dateToMin(iso) * 60000).getUTCDay(); }
  function addDays(iso, n) { return isoDate(dateToMin(iso) + n * 1440); }
  function hhmmToMin(s) { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); } // m: 1-12
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
  function fmtDate(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

  // ---------- regras do contrato ----------
  function emptyValores() {
    const v = {};
    ALL_KEYS.forEach(k => { v[k] = { D: 0, N: 0 }; });
    return v;
  }

  function tabelaVigente(local, iso) {
    const tabs = (local.tabelas || []).slice().sort((a, b) => a.vigencia.localeCompare(b.vigencia));
    let found = null;
    for (const t of tabs) if (t.vigencia <= iso) found = t;
    return found;
  }

  function isFeriado(local, iso) {
    return (local.feriados || []).some(f => f.data === iso);
  }

  function dayKeyFor(local, iso) {
    return isFeriado(local, iso) ? 'fer' : DAY_KEYS[weekday(iso)];
  }

  /**
   * Divide o plantão em segmentos Diurno/Noturno e precifica por minuto.
   * regraNoturno:
   *  - 'inicio'     → o período noturno (19h–7h) inteiro pertence ao dia em que começou
   *                   (ex.: noite de sexta → valor de sexta, mesmo após 0h).
   *  - 'calendario' → após a meia-noite, os minutos passam a valer pelo dia do calendário.
   */
  /**
   * Tolerância (flexibilização) de horário, por local:
   *  - toleranciaEntrada (min): entrada até X min após o início do turno (7h/19h)
   *    é contada como se fosse no horário. Acima disso, conta a hora exata.
   *  - toleranciaSaida (min): saída até X min antes do fim do turno é contada
   *    como se fosse no horário. Acima disso, conta a hora exata.
   */
  function aplicarTolerancia(s, e, local, DS, NS) {
    const tolE = Math.max(0, Number(local.toleranciaEntrada) || 0);
    const tolS = Math.max(0, Number(local.toleranciaSaida) || 0);
    const out = { s, e, atraso: 0, saidaAntecipada: 0 };
    if (tolE) {
      const day = Math.floor(s / 1440) * 1440;
      // fronteira de turno mais recente antes (ou igual) à entrada
      const cands = [day - 1440 + NS, day + DS, day + NS].filter(b => b <= s);
      const b = Math.max(...cands);
      const atraso = s - b;
      if (atraso > 0 && atraso <= tolE && b < e) { out.s = b; out.atraso = atraso; }
    }
    if (tolS) {
      const day = Math.floor(e / 1440) * 1440;
      const cands = [day + DS, day + NS, day + 1440 + DS].filter(b => b >= e);
      const b = Math.min(...cands);
      const adiant = b - e;
      if (adiant > 0 && adiant <= tolS && b > out.s) { out.e = b; out.saidaAntecipada = adiant; }
    }
    return out;
  }

  function calcularPlantao(plantao, local) {
    const s0 = parseDT(plantao.inicio);
    const e0 = parseDT(plantao.fim);
    if (!(e0 > s0)) return { erro: 'A saída precisa ser depois da entrada.', segmentos: [], minutos: 0, valor: 0 };
    if (e0 - s0 > 7 * 1440) return { erro: 'Plantão maior que 7 dias — confira as datas.', segmentos: [], minutos: 0, valor: 0 };

    const DS = hhmmToMin(local.horaDiurno || '07:00');
    const NS = hhmmToMin(local.horaNoturno || '19:00');
    const regra = local.regraNoturno || 'inicio';
    const tol = aplicarTolerancia(s0, e0, local, DS, NS);
    const s = tol.s, e = tol.e;
    const ajustes = [];
    if (tol.atraso) ajustes.push(`Atraso de ${fmtDur(tol.atraso)} tolerado — contado a partir de ${isoDT(s).slice(11)}.`);
    if (tol.saidaAntecipada) ajustes.push(`Saída ${fmtDur(tol.saidaAntecipada)} antes tolerada — contado até ${isoDT(e).slice(11)}.`);

    const raw = [];
    let cur = s;
    while (cur < e) {
      const dayStart = Math.floor(cur / 1440) * 1440;
      const m = cur - dayStart;
      const iso = isoDate(dayStart);
      let periodo, ref, end;
      if (m >= DS && m < NS) {
        periodo = 'D'; ref = iso; end = dayStart + NS;
      } else if (m >= NS) {
        periodo = 'N'; ref = iso;
        end = regra === 'calendario' ? dayStart + 1440 : dayStart + 1440 + DS;
      } else {
        periodo = 'N'; ref = regra === 'calendario' ? iso : addDays(iso, -1);
        end = dayStart + DS;
      }
      const segEnd = Math.min(e, end);
      const last = raw[raw.length - 1];
      if (last && last.periodo === periodo && last.ref === ref && last.fim === cur) {
        last.fim = segEnd;
      } else {
        raw.push({ periodo, ref, ini: cur, fim: segEnd });
      }
      cur = segEnd;
    }

    const avisos = [];
    const segmentos = raw.map(r => {
      const key = dayKeyFor(local, r.ref);
      const tab = tabelaVigente(local, r.ref);
      if (!tab) avisos.push(`Sem tabela de valores vigente em ${fmtDate(r.ref)}.`);
      const taxa = tab ? Number((tab.valores[key] || {})[r.periodo] || 0) : 0;
      const minutos = r.fim - r.ini;
      const valor = Math.round((minutos / 60) * taxa * 100) / 100;
      return {
        periodo: r.periodo, ref: r.ref, dayKey: key,
        inicio: isoDT(r.ini), fim: isoDT(r.fim),
        minutos, taxa, valor, tabelaId: tab ? tab.id : null,
      };
    });

    const minutos = segmentos.reduce((a, x) => a + x.minutos, 0);
    const valor = Math.round(segmentos.reduce((a, x) => a + x.valor, 0) * 100) / 100;
    return {
      segmentos, minutos, valor, avisos: [...new Set(avisos)], ajustes,
      minutosReais: e0 - s0, inicioConsiderado: isoDT(s), fimConsiderado: isoDT(e),
    };
  }

  // ---------- competência ----------
  function clampDay(y, m, dia) { return Math.min(dia, daysInMonth(y, m)); }

  function competenciaInicio(iso, diaInicio) {
    const [y, m, d] = iso.split('-').map(Number);
    const dia = Math.max(1, Math.min(31, Number(diaInicio) || 1));
    if (d >= clampDay(y, m, dia)) return ymd(y, m, clampDay(y, m, dia));
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    return ymd(py, pm, clampDay(py, pm, dia));
  }
  function moverCompetencia(inicioIso, diaInicio, delta) {
    let [y, m] = inicioIso.split('-').map(Number);
    m += delta;
    while (m > 12) { m -= 12; y++; }
    while (m < 1) { m += 12; y--; }
    const dia = Math.max(1, Math.min(31, Number(diaInicio) || 1));
    return ymd(y, m, clampDay(y, m, dia));
  }
  function competenciaFim(inicioIso, diaInicio) {
    return addDays(moverCompetencia(inicioIso, diaInicio, 1), -1);
  }
  function competenciaLabel(inicioIso, diaInicio) {
    const [y, m, d] = inicioIso.split('-').map(Number);
    if (Number(diaInicio) === 1 && d === 1) return `${MONTHS[m - 1]} de ${y}`;
    const fim = competenciaFim(inicioIso, diaInicio);
    return `${fmtDate(inicioIso).slice(0, 5)} a ${fmtDate(fim)}`;
  }

  // ---------- feriados ----------
  function pascoa(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return ymd(y, month, day);
  }
  function feriadosNacionais(y) {
    const p = pascoa(y);
    return [
      { data: `${y}-01-01`, nome: 'Confraternização Universal' },
      { data: addDays(p, -48), nome: 'Carnaval (segunda)' },
      { data: addDays(p, -47), nome: 'Carnaval (terça)' },
      { data: addDays(p, -2), nome: 'Sexta-feira Santa' },
      { data: `${y}-04-21`, nome: 'Tiradentes' },
      { data: `${y}-05-01`, nome: 'Dia do Trabalho' },
      { data: addDays(p, 60), nome: 'Corpus Christi' },
      { data: `${y}-09-07`, nome: 'Independência' },
      { data: `${y}-10-12`, nome: 'Nossa Senhora Aparecida' },
      { data: `${y}-11-02`, nome: 'Finados' },
      { data: `${y}-11-15`, nome: 'Proclamação da República' },
      { data: `${y}-11-20`, nome: 'Consciência Negra' },
      { data: `${y}-12-24`, nome: 'Véspera de Natal' },
      { data: `${y}-12-25`, nome: 'Natal' },
      { data: `${y}-12-31`, nome: 'Véspera de Ano-Novo' },
    ].sort((a, b) => a.data.localeCompare(b.data));
  }

  // ---------- formatação ----------
  function fmtDur(min) {
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return `${m}min`;
    return m ? `${h}h${pad(m)}` : `${h}h`;
  }
  function fmtBRL(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  const api = {
    DAY_KEYS, ALL_KEYS, KEY_LABEL, WEEKDAY_NAMES, WEEKDAY_SHORT, MONTHS,
    parseDT, dateToMin, isoDate, isoDT, weekday, addDays, hhmmToMin, fmtDate, pad,
    emptyValores, tabelaVigente, aplicarTolerancia, isFeriado, dayKeyFor, calcularPlantao,
    competenciaInicio, competenciaFim, moverCompetencia, competenciaLabel,
    pascoa, feriadosNacionais, fmtDur, fmtBRL,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== 'undefined' ? self : this);
