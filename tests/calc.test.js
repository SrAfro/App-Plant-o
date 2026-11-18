// Rodar com: node tests/calc.test.js
const assert = require('assert');
const C = require('../calc.js');

const valores = C.emptyValores();
['seg','ter','qua','qui','sex'].forEach(k => { valores[k] = { D: 100, N: 120 }; });
valores.sab = { D: 150, N: 170 }; valores.dom = { D: 150, N: 170 };
valores.fer = { D: 200, N: 220 };
const local = {
  nome: 'HRVJ', diaCompetencia: 15, horaDiurno: '07:00', horaNoturno: '19:00', regraNoturno: 'inicio',
  tabelas: [{ id: 't1', vigencia: '2026-01-01', valores }],
  feriados: [{ data: '2026-12-25', nome: 'Natal' }],
};
let r;

// Diurno de quarta 12h
r = C.calcularPlantao({ inicio: '2026-11-18T07:00', fim: '2026-11-18T19:00' }, local);
assert.strictEqual(r.minutos, 720); assert.strictEqual(r.valor, 1200);

// Noturno sexta → sábado: regra "início" → tudo como sexta noturno
r = C.calcularPlantao({ inicio: '2026-11-20T19:00', fim: '2026-11-21T07:00' }, local);
assert.strictEqual(r.segmentos.length, 1); assert.strictEqual(r.valor, 12 * 120);

// Mesma noite, regra "calendário" → 5h sexta + 7h sábado
r = C.calcularPlantao({ inicio: '2026-11-20T19:00', fim: '2026-11-21T07:00' }, { ...local, regraNoturno: 'calendario' });
assert.strictEqual(r.valor, 5 * 120 + 7 * 170);

// 24h sábado 7h → domingo 7h
r = C.calcularPlantao({ inicio: '2026-11-21T07:00', fim: '2026-11-22T07:00' }, local);
assert.strictEqual(r.valor, 12 * 150 + 12 * 170);

// Minutos quebrados: 07:12 → 19:47 de terça = 11h48 D + 47min N
r = C.calcularPlantao({ inicio: '2026-11-17T07:12', fim: '2026-11-17T19:47' }, local);
assert.strictEqual(r.minutos, 755);
assert.strictEqual(r.valor, Math.round((708/60*100 + 47/60*120)*100)/100);

// Feriado (Natal, sexta)
r = C.calcularPlantao({ inicio: '2026-12-25T07:00', fim: '2026-12-26T07:00' }, local);
assert.strictEqual(r.valor, 12 * 200 + 12 * 220);

// Reajuste com vigência
const l2 = { ...local, tabelas: [...local.tabelas, { id: 't2', vigencia: '2026-12-01', valores: { ...valores, qua: { D: 110, N: 130 } } }] };
assert.strictEqual(C.calcularPlantao({ inicio: '2026-11-25T07:00', fim: '2026-11-25T19:00' }, l2).valor, 1200);
assert.strictEqual(C.calcularPlantao({ inicio: '2026-12-02T07:00', fim: '2026-12-02T19:00' }, l2).valor, 1320);

// Saída antes da entrada
assert.ok(C.calcularPlantao({ inicio: '2026-11-18T19:00', fim: '2026-11-18T07:00' }, local).erro);

// Competência dia 15
assert.strictEqual(C.competenciaInicio('2026-11-14', 15), '2026-10-15');
assert.strictEqual(C.competenciaInicio('2026-11-15', 15), '2026-11-15');
assert.strictEqual(C.competenciaFim('2026-11-15', 15), '2026-12-14');
assert.strictEqual(C.competenciaInicio('2026-01-03', 15), '2025-12-15');
assert.strictEqual(C.competenciaInicio('2026-02-28', 31), '2026-02-28');
assert.strictEqual(C.competenciaLabel('2026-11-01', 1), 'novembro de 2026');

// Páscoa 2026 = 05/04
assert.strictEqual(C.pascoa(2026), '2026-04-05');

// Tolerância HRVJ: 60 min na entrada, 0 na saída
const hr = { ...local, toleranciaEntrada: 60, toleranciaSaida: 0 };
r = C.calcularPlantao({ inicio: '2026-11-18T08:00', fim: '2026-11-18T19:00' }, hr);
assert.strictEqual(r.minutos, 720); assert.strictEqual(r.minutosReais, 660);
r = C.calcularPlantao({ inicio: '2026-11-18T08:01', fim: '2026-11-18T19:00' }, hr);
assert.strictEqual(r.minutos, 659);
r = C.calcularPlantao({ inicio: '2026-11-18T19:40', fim: '2026-11-19T07:00' }, hr);
assert.strictEqual(r.minutos, 720);
r = C.calcularPlantao({ inicio: '2026-11-18T20:01', fim: '2026-11-19T07:00' }, hr);
assert.strictEqual(r.minutos, 659);
// Entrada 00:30 dentro de noite (não é fronteira) → sem ajuste
r = C.calcularPlantao({ inicio: '2026-11-19T00:30', fim: '2026-11-19T07:00' }, hr);
assert.strictEqual(r.minutos, 390);
// Sem tolerância de saída: sair 18:30 conta 18:30
r = C.calcularPlantao({ inicio: '2026-11-18T07:00', fim: '2026-11-18T18:30' }, hr);
assert.strictEqual(r.minutos, 690);
// Com tolerância de saída 30 min
r = C.calcularPlantao({ inicio: '2026-11-18T07:00', fim: '2026-11-18T18:30' }, { ...hr, toleranciaSaida: 30 });
assert.strictEqual(r.minutos, 720);
// Sem tolerância configurada: conta exato
r = C.calcularPlantao({ inicio: '2026-11-18T07:30', fim: '2026-11-18T19:00' }, local);
assert.strictEqual(r.minutos, 690);

console.log('OK — todos os testes passaram');
