# App-Plant-o — Meus Plantões

Aplicativo web (PWA) para calcular os valores a receber de plantões médicos.

## O que faz
- Lança cada plantão com **data/hora de entrada e saída** e calcula o tempo **minuto a minuto**.
- Separa automaticamente **diurno (7h–19h)** e **noturno (19h–7h)**; os horários são configuráveis por local.
- Cada **local de trabalho** tem o seu contrato:
  - valor/hora por **dia da semana × turno**, mais uma linha de **feriado**;
  - **tabelas com data de vigência** (reajustes não alteram plantões antigos);
  - lista de **feriados especiais** (com sugestão dos nacionais);
  - **dia de início da competência** (ex.: HRVJ = dia 15 → 15 a 14 do mês seguinte);
  - **tolerância de atraso na entrada** e de **saída antecipada** (ex.: HRVJ = 60 min na entrada, 0 na saída);
  - regra da noite que atravessa a meia-noite (vale o dia de início, ou o dia do calendário).
- **Painel** com o total produzido por competência, resumo por categoria e histórico.
- Exporta **CSV** (Excel/Google Planilhas) e faz **backup/restauração** em JSON.
- Funciona **offline** e pode ser instalado na tela inicial do celular.

Os dados ficam salvos **somente no aparelho** (localStorage). Faça backups periódicos pela aba *Dados*.

## Publicar (GitHub Pages)
1. No GitHub: *Settings → Pages → Build and deployment → Source: GitHub Actions*.
2. Faça merge na branch `main`. O workflow `.github/workflows/pages.yml` roda os testes e publica.
3. Acesse `https://<usuario>.github.io/App-Plant-o/` no celular e use “Adicionar à tela inicial”.

## Versão artefato (Claude)
`python3 tools/build-artifact.py` gera `dist/artifact.html` (arquivo único). Publicado como artefato,
o app salva os dados na conta Claude do usuário (documentos privados) e exporta arquivos pelo recurso de downloads.

## Desenvolvimento
- `calc.js` — motor de cálculo (puro, testável).
- `app.js` — interface.
- Testes: `node tests/calc.test.js`
- Rodar localmente: `python3 -m http.server` e abrir `http://localhost:8000`.
