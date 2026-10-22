# Órbita — CRM local

CRM em português para abrir diretamente no computador, sem servidor, instalação, conta ou internet. Interface em HTML, Bootstrap 5 e jQuery; planilhas `.xlsx` lidas e geradas com ExcelJS. Todas as bibliotecas estão incluídas em `vendor/`.

## Abrir

1. Baixe **`CRM.html`**. Ele contém todos os estilos e bibliotecas necessários.
2. Abra `CRM.html` com um navegador moderno (Chrome, Edge ou Firefox).
3. Cadastre um prospect ou use **Experimentar com exemplos** com a base vazia.
4. Ao terminar, clique em **Exportar Excel** e salve o arquivo na sua pasta.
5. Para continuar em outro navegador ou computador, abra o HTML e use **Importar Excel**.

A versão `CRM.html` pode ser movida sozinha. Para desenvolvimento, `index.html` usa as pastas `assets/` e `vendor/`; mantenha essas pastas juntas. Não há requisições de rede em tempo de execução, fontes remotas, serviços de terceiros ou servidor web.

## Fluxo

- **Prospect**: nome, empresa, email, telefone, origem e observações; etapas Novo e Em contato.
- **Conversão**: cria um cliente e uma oportunidade vinculados e preserva o prospect como Convertido. Informe o título e o valor estimado da oportunidade.
- **Cliente**: permite cadastrar outras oportunidades para a mesma pessoa ou empresa.
- **Oportunidade**: valor estimado, previsão e status. Pode receber várias propostas ou ser encerrada como Perdida.
- **Proposta**: valor próprio, validade e observações. Pode ser marcada como enviada (sem enviar email), recusada ou aceita.
- **Aceite**: marca a oportunidade como Ganha, recusa as propostas em aberto concorrentes e gera exatamente uma fatura pelo valor da proposta aceita. Informe o vencimento.
- **Fatura**: número único, emissão, vencimento, valor e status Pendente/Paga. O pagamento registra recebimento integral; sua data pode ser corrigida na edição. Não há parcelas, estornos, impostos ou emissão de nota fiscal.

Propostas encerradas preservam seus dados comerciais. O app não exclui registros ou reabre negócios encerrados. Faturas são registros comerciais de controle interno, sem validade de documento fiscal. Valores usam reais (BRL).

## Excel e persistência

**O Excel é a cópia portátil dos dados.** O navegador não sobrescreve automaticamente o arquivo importado: Exportar Excel baixa uma nova cópia. Confirme o download e substitua seu arquivo anterior, se desejar, usando o gerenciador de arquivos.

Há um cache de recuperação em `localStorage`, quando permitido. Esse cache pertence ao navegador e ao contexto do arquivo, pode mudar ao mover a pasta e pode ser removido ao limpar os dados do navegador. No modo privado, não conte com sua permanência. Se o cache não puder ser gravado, um aviso pede a exportação antes de fechar. O app avisa ao sair com alterações sem exportação. Evite editar em duas abas: não há controle de concorrência ou sincronização.

O arquivo exportado contém cinco abas de dados: `prospects`, `clientes`, `oportunidades`, `propostas`, `faturas`, e a aba `LEIA-ME`. Exporte uma base vazia para obter o modelo. Preserve os cabeçalhos e IDs. As colunas `ClienteID`, `OportunidadeID` e `PropostaID` ligam as entidades.

A importação substitui toda a base após validação e confirmação. Exporte um backup antes. Arquivos inválidos não alteram os registros atuais. São verificados IDs únicos, vínculos, status, valores positivos com duas casas decimais, datas e coerência entre propostas aceitas, negócios ganhos e faturas. Datas devem estar em `AAAA-MM-DD` ou como datas nativas do Excel. Valores devem ser células numéricas. Texto é exibido como texto, sem executar HTML. Fórmulas e células complexas não são aceitas. Macros não são suportadas. Limites: arquivo `.xlsx` de até 10 MB, até 10.000 registros somados e até 10.000 caracteres por campo.

Não há criptografia, autenticação, controle de acesso ou backup remoto. Proteja a pasta e as planilhas com as permissões e ferramentas do seu computador. Nenhum dado de exemplo é carregado automaticamente.

## Desenvolvimento e validação

Não é necessário build para usar ou editar a versão modular. Edite `index.html`, `assets/style.css` e `assets/app.js` e reabra a página. Para atualizar a versão de arquivo único, execute `python tools/build-standalone.py`. Não edite `CRM.html` manualmente: ele é gerado dessas fontes. A aplicação usa scripts clássicos, sem módulos, `fetch` ou APIs que exijam HTTP.

Teste de ponta a ponta: `node tests/smoke.cjs`, com Playwright disponível no ambiente. Por padrão, ele abre o HTML por `file://`, bloqueia conexões HTTP, percorre o fluxo completo, exporta e reimporta Excel e verifica a rejeição de uma planilha inconsistente. Em navegadores gerenciados que bloqueiam `file://` por política, use `CHROMIUM_PATH=/usr/bin/chromium node tests/smoke.cjs --routed`: o Playwright fornece os mesmos arquivos diretamente do disco por interceptação, sem servidor ou acesso remoto. Esse modo valida a aplicação, mas não a política de abertura de arquivos do navegador do usuário. Use também `--standalone` para testar o arquivo único. O Playwright é necessário apenas para desenvolvimento, nunca para usar o CRM.

## Bibliotecas

- Bootstrap 5.3.3 — MIT
- jQuery 3.7.1 — MIT
- ExcelJS 4.4.0 — MIT

Arquivos oficiais obtidos por HTTPS via jsDelivr. Licenças em `vendor/LICENSE-*.txt`. As versões e hashes locais estão em `vendor/SHA256SUMS`. Nenhum CDN é acessado ao abrir o app.
