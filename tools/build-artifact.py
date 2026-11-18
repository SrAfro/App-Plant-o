#!/usr/bin/env python3
"""Gera dist/artifact.html: o app inteiro num único arquivo (para publicar como artefato no Claude)."""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
read = lambda f: (root / f).read_text(encoding='utf-8')
html = read('index.html')
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
body = re.sub(r'\s*<script src="[^"]+"></script>', '', body)
out = f"""<title>Meus Plantões</title>
<meta name="description" content="Cálculo de valores de plantões médicos por minuto, turno, dia da semana e local.">
<style>
{read('styles.css')}
.topbar {{ top: env(safe-area-inset-top, 0px); padding-top: 10px; }}
body::before {{ content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--primary); }}
</style>
{body.strip()}
<script>
{read('calc.js')}
</script>
<script>
{read('app.js')}
</script>
"""
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'artifact.html').write_text(out, encoding='utf-8')
print('dist/artifact.html', len(out.encode()), 'bytes')
