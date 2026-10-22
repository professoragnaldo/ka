# Órbita — CRM local com Excel e login

HTML com Bootstrap 5 e jQuery, sem servidor, instalação ou internet. O arquivo **`CRM.html`** inclui todas as bibliotecas. Abra-o diretamente na pasta com **Chrome ou Edge para computador**.

## Começar

1. Baixe `CRM.html` e abra com dois cliques no Chrome ou Edge.
2. Clique em **Criar Excel**, escolha uma pasta e um nome `.xlsx` novo.
3. Defina seu login, nome e uma senha de pelo menos 8 caracteres. Confirme a senha e clique em **Criar acesso e entrar**.
4. Cadastre prospects, clientes, oportunidades e propostas. **Cada alteração é gravada no mesmo Excel**, sem precisar baixar e substituir o arquivo.
5. Aguarde o indicador de gravação antes de fechar. Use **Baixar cópia** para um backup.
6. Na próxima vez, clique em **Abrir Excel**, selecione a mesma planilha e entre com o login e a senha cadastrados nela.

O navegador pede acesso ao arquivo: autorize a edição. Não é possível escolher uma planilha silenciosamente apenas por seu caminho. Se a permissão for revogada, saia e reabra a planilha concedendo acesso. Firefox, Safari e navegadores móveis não oferecem a API exigida por este fluxo; o app informa a incompatibilidade e não simula uma gravação por download.

Se escolher um arquivo que já contém dados em **Criar Excel**, a operação é recusada para evitar sobrescrevê-lo. Use **Abrir Excel** para uma base existente.

## Usar sua planilha da primeira versão

Abra um Excel **exportado pelo Órbita**. Os cabeçalhos e vínculos da versão anterior continuam válidos. Se ele ainda não tiver a aba `usuarios`, a tela oferece a criação explícita do primeiro acesso, preservando os registros existentes.

Os antigos dados de recuperação do navegador não são carregados automaticamente. Se ainda precisar deles, exporte-os pela versão anterior antes de migrar. A nova versão não mantém dados ou senhas em `localStorage` e exige login a cada abertura/recarregamento.

O HTML enviado como exemplo foi usado como referência para a API de arquivos (`showOpenFilePicker` e `createWritable`). O esquema de dados do Órbita foi mantido; planilhas com cabeçalhos próprios de outro CRM precisam de conversão para o modelo do Órbita antes de serem abertas.

## Login pela aba `usuarios`

Só um usuário existente e ativo nessa aba, com a senha correta, libera a interface e os dados do CRM. O login não diferencia maiúsculas e minúsculas; a senha diferencia. O botão **Sair** limpa a sessão e retira os dados da tela.

Novos acessos criados pelo app usam **PBKDF2-HMAC-SHA-256**, salt aleatório de 16 bytes e 210.000 iterações. A senha original não é armazenada. A aba criada tem estes cabeçalhos:

| Coluna | Conteúdo |
| --- | --- |
| `Login` | Nome único do usuário, sem distinguir maiúsculas/minúsculas |
| `Nome` | Nome exibido na sessão |
| `SenhaHash` | Hash hexadecimal de 64 caracteres |
| `Salt` | Salt hexadecimal de 32 caracteres |
| `Iteracoes` | 210000 para acessos gerados pelo app |
| `Ativo` | `Sim` ou `Não`; vazio significa ativo |

Para cadastrar outros usuários manualmente, feche o CRM, abra o Excel e acrescente a coluna **`Senha`** à aba `usuarios`. Em uma nova linha, informe `Login`, `Nome`, `Senha` e `Ativo=Sim`, deixando `SenhaHash`, `Salt` e `Iteracoes` vazios. Células `Login` e `Senha` devem ser texto, principalmente se começarem com zeros. Esse formato simples é aceito para compatibilidade, mas deixa a senha legível no Excel. Quando existe `SenhaHash`, ele tem prioridade sobre `Senha`. Remova o hash e salt antigos se optar por redefinir uma senha manualmente pela coluna `Senha`.

Uma aba `usuarios` existente, porém inválida, vazia ou sem usuários ativos **não** libera a criação de outro acesso. Corrija a planilha para recuperar o acesso. Não há senha padrão, recuperação remota, gestão de permissões por papel ou cadastro público.

**Limite do login local:** ele controla a entrada na interface, sem criptografar o Excel ou proteger contra quem pode editar o HTML/arquivo diretamente. Proteja a pasta com as permissões do sistema operacional. Ao criar o primeiro acesso em uma base antiga sem usuários, a autorização é a posse e a permissão de gravação sobre a planilha.

## Dashboard

A tela inicial **Dashboard** contém:

- Total recebido, a receber e em atraso.
- Valor do pipeline aberto, taxa de conquista e ticket médio dos negócios ganhos.
- Gráfico de faturado × recebido, com os seis meses até o fim do período selecionado e uma tabela acessível com os valores.
- Distribuição das oportunidades abertas, ganhas e perdidas.
- Cinco clientes com maior faturamento e próximos recebimentos pendentes.
- Filtros de data inicial/final e botão para todo o período.

Recebidos são filtrados pela **data de pagamento**; faturas, pela **emissão**; oportunidades, pela **criação**, usando o seu status atual. A taxa de conquista é ganhas ÷ (ganhas + perdidas) desse recorte. O ticket médio usa os valores das propostas aceitas dos negócios ganhos. Pendências são os status atuais, não uma reconstrução histórica de saldos em datas passadas. O gráfico mostra apenas seis meses, mesmo se o filtro abranger um intervalo maior.

## Fluxo comercial

- **Prospect:** contato, empresa, email, telefone, origem e observações; etapas Novo e Em contato.
- **Conversão:** cria um cliente e uma oportunidade, preservando o prospect como Convertido.
- **Cliente:** permite criar outras oportunidades para a mesma pessoa/empresa.
- **Oportunidade:** valor estimado, previsão e status; aceita várias propostas ou pode ser encerrada como Perdida.
- **Proposta:** valor próprio, validade e observações; pode ser marcada como enviada (sem envio de email), recusada ou aceita.
- **Aceite:** marca o negócio como Ganha, recusa propostas concorrentes em aberto e gera uma única fatura pelo valor aceito.
- **Fatura:** número único, emissão, vencimento, valor e status Pendente/Paga; registra recebimento integral e permite corrigir a data de pagamento.

Valores em BRL. Faturas são registros de controle comercial, sem emissão de nota fiscal. Não há parcelas, impostos, estornos, exclusão de registros ou reabertura de negócios encerrados.

## Gravação e integridade

A base fica no **Excel selecionado**, não no cache do navegador. O app só confirma uma alteração depois de concluir `write` e `close` do arquivo. Se a gravação falhar, a alteração em memória é desfeita e, quando aplicável, o formulário continua aberto para correção ou nova tentativa. Sem confirmação, confira o arquivo antes de fechar a sessão.

O app compara SHA-256 do arquivo antes de salvar e verifica novamente após abrir o fluxo exclusivo de escrita. Se detectar mudança externa, recusa a alteração e orienta sair e reabrir o Excel. Isso reduz conflitos, mas não substitui controle de concorrência de um banco de dados: **use uma sessão por arquivo e mantenha a planilha fechada no Excel durante o uso do CRM**. Não há sincronização entre computadores ou usuários simultâneos.

Abas de dados: `prospects`, `clientes`, `oportunidades`, `propostas`, `faturas`. Preserve seus cabeçalhos e IDs. As colunas `ClienteID`, `OportunidadeID` e `PropostaID` fazem os vínculos. Datas: `AAAA-MM-DD` ou datas nativas do Excel; valores: células numéricas positivas com até duas casas decimais. São validados IDs, relacionamentos, status, datas, propostas aceitas e faturas únicas.

As abas do CRM são regeneradas ao gravar; sua formatação é padronizada. Colunas desconhecidas nessas abas são recusadas para evitar perda silenciosa de dados. Outras abas, incluindo `usuarios`, são mantidas pelo ExcelJS. Use planilhas simples do CRM: macros, objetos, gráficos avançados e recursos não suportados pelo ExcelJS não têm preservação garantida. Guarde um backup antes de migrar uma base personalizada.

Limites: `.xlsx` de até 10 MB; até 10.000 registros comerciais, 1.000 usuários e 10.000 caracteres por campo. Não são aceitas fórmulas, links ou células complexas nas abas de dados/login. Texto informado pelo usuário é exibido sem executar HTML. Dados fictícios só são carregados mediante confirmação, na visão geral com base vazia, e também são gravados no Excel.

## Desenvolvimento e testes

Fontes: `index.html`, `assets/style.css`, `assets/app.js` e `assets/excel-store.js`. A versão modular exige manter `assets/` e `vendor/` junto ao HTML. Não há build obrigatório para usá-la.

Para gerar o arquivo único, execute:

```sh
python tools/build-standalone.py
```

Com Playwright disponível no ambiente:

```sh
node tests/smoke.cjs
node tests/smoke.cjs --standalone
```

Em Chromium gerenciado que bloqueia `file://`, a validação pode carregar os mesmos arquivos por interceptação, sem webserver ou conexão remota:

```sh
CHROMIUM_PATH=/usr/bin/chromium node tests/smoke.cjs --routed
CHROMIUM_PATH=/usr/bin/chromium node tests/smoke.cjs --routed --standalone
```

Os testes substituem somente os seletores de arquivos por handles nativos em OPFS (armazenamento de arquivos do navegador). Exercitam leitura/gravação real de XLSX, autenticação, migração, fluxo comercial, dashboard, backup, falhas e conflitos. Não automatizam o diálogo nativo de escolha da pasta. O modo interceptado não comprova a política `file://` do navegador do usuário; a abertura direta e a concessão de permissão devem ser conferidas no computador de destino.

## Bibliotecas

Bootstrap 5.3.3, jQuery 3.7.1 e ExcelJS 4.4.0, sob licença MIT. Arquivos oficiais locais em `vendor/`, licenças em `vendor/LICENSE-*.txt`, hashes em `vendor/SHA256SUMS`. A versão única embute também as licenças. Não há CDN, fontes remotas ou requisições de rede ao usar o CRM.
