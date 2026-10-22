#!/usr/bin/env python3
"""Build the self-contained CRM.html with only Python's standard library."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / 'index.html').read_text()

def css(match):
    text = (ROOT / match.group(1)).read_text()
    return '<style>\n' + re.sub(r'</style', r'<\\/style', text, flags=re.I) + '\n</style>'

def js(match):
    text = (ROOT / match.group(1)).read_text()
    return '<script>\n' + re.sub(r'</script', r'<\\/script', text, flags=re.I) + '\n</script>'

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
html = re.sub(r'<script src="([^"]+)"></script>', js, html)
licenses = '\n\n'.join(p.read_text() for p in sorted((ROOT / 'vendor').glob('LICENSE-*.txt')))
html = html.replace('<html lang="pt-BR">', '<!-- Third-party licenses\n' + licenses + '\n-->\n<html lang="pt-BR">')
(ROOT / 'CRM.html').write_text(html)
print('Generated CRM.html — all assets embedded; no web server or build needed to use it.')
