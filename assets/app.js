/* Órbita CRM — opens over file://; no network requests or server. */
'use strict';
$(function () {
  const KEY = 'orbita.crm.v1';
  const schemas = {
    prospects: [['id','ID'],['nome','Nome'],['empresa','Empresa'],['email','Email'],['telefone','Telefone'],['origem','Origem'],['status','Status'],['clienteId','ClienteID'],['notas','Notas'],['criadoEm','CriadoEm']],
    clientes: [['id','ID'],['nome','Nome'],['empresa','Empresa'],['email','Email'],['telefone','Telefone'],['notas','Notas'],['criadoEm','CriadoEm']],
    oportunidades: [['id','ID'],['clienteId','ClienteID'],['titulo','Titulo'],['valor','Valor'],['previsao','Previsao'],['status','Status'],['notas','Notas'],['criadoEm','CriadoEm']],
    propostas: [['id','ID'],['oportunidadeId','OportunidadeID'],['titulo','Titulo'],['valor','Valor'],['validade','Validade'],['status','Status'],['notas','Notas'],['criadoEm','CriadoEm']],
    faturas: [['id','ID'],['propostaId','PropostaID'],['numero','Numero'],['valor','Valor'],['emissao','Emissao'],['vencimento','Vencimento'],['status','Status'],['pagaEm','PagaEm'],['notas','Notas'],['criadoEm','CriadoEm']]
  };
  const names = {inicio:'Visão geral',funil:'Funil de vendas',prospects:'Prospects',clientes:'Clientes',oportunidades:'Oportunidades',propostas:'Propostas',faturas:'Faturas'};
  const singular = {prospects:'prospect',clientes:'cliente',oportunidades:'oportunidade',propostas:'proposta',faturas:'fatura'};
  const empty = () => Object.fromEntries(Object.keys(schemas).map(k=>[k,[]]));
  let db = empty(), page = 'inicio', query = '', filter = '', editing = null, pending = null, fileName = '', exported = '', cacheOK = true, busy = false;
  const editor = new bootstrap.Modal(document.getElementById('editor'));
  const confirmation = new bootstrap.Modal(document.getElementById('confirmation'));
  $('#confirmation').on('show.bs.modal',()=>$('#confirm-action').prop('disabled',true)).on('shown.bs.modal',()=>$('#confirm-action').prop('disabled',false));
  $('#editor').on('show.bs.modal',()=>$('#record-form [type="submit"]').prop('disabled',true)).on('shown.bs.modal',()=>$('#record-form [type="submit"]').prop('disabled',false));
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const plusDays = n => {const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const id = prefix => prefix+'-'+(crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''));
  const money = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n || 0);
  const date = d => d ? d.split('-').reverse().join('/') : '—';
  const sum = list => list.reduce((s,r)=>s+r.valor,0);
  const find = (type,key) => db[type].find(r=>r.id===key);
  const clientName = key => {const r=find('clientes',key);return r ? r.empresa || r.nome : '—';};
  const oppName = key => find('oportunidades',key)?.titulo || '—';
  const invoiceClient = r => clientName(find('oportunidades',find('propostas',r.propostaId)?.oportunidadeId)?.clienteId);
  const badge = status => `<span class="badge-status ${esc(status)}">${esc(status)}</span>`;
  const act = (action,key,label,primary=false) => `<button class="btn ${primary?'btn-primary':'btn-light'}" data-action="${action}" data-id="${esc(key)}">${label}</button>`;
  const entity = (title,sub='') => `<div class="entity"><span class="avatar">${esc(title.slice(0,2).toUpperCase())}</span><div><span class="record-name">${esc(title)}</span>${sub?`<small>${esc(sub)}</small>`:''}</div></div>`;
  function notice(message,type='success') {$('#notice').removeClass('d-none alert-success alert-danger alert-warning alert-info').addClass('alert-'+type).text(message);}
  function confirmAction(message,fn) {$('#confirmation-title').text('Confirmar ação');$('#confirmation-text').text(message);pending=fn;confirmation.show();}
  $('#confirm-action').on('click',function(){const fn=pending;pending=null;confirmation.hide();if(fn)fn();});
  function validate(data) {
    const statuses={prospects:['Novo','Em contato','Convertido'],oportunidades:['Aberta','Ganha','Perdida'],propostas:['Rascunho','Enviada','Aceita','Recusada'],faturas:['Pendente','Paga']};
    const dateFields=['previsao','validade','emissao','vencimento','pagaEm','criadoEm'];
    const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
    for (const [type,fields] of Object.entries(schemas)) {
      if(!Array.isArray(data[type]))throw Error('Aba ausente: '+type);
      const ids=new Set();
      for(const r of data[type]) {
        if(typeof r.id!=='string'||!r.id.trim()||ids.has(r.id))throw Error(type+': ID vazio ou duplicado.');
        ids.add(r.id);
        for(const [key] of fields) {
          if(key==='valor'){if(typeof r[key]!=='number'||!Number.isFinite(r[key])||r[key]<=0||r[key]>1e12||Math.abs(r[key]*100-Math.round(r[key]*100))>.001)throw Error(type+': valor deve ser positivo, com até duas casas decimais.');}
          else if(typeof r[key]!=='string'||r[key].length>10000)throw Error(type+': campo inválido: '+key);
          if(dateFields.includes(key)&&r[key]&&!validDate(r[key]))throw Error(type+': data inválida em '+key+'. Use AAAA-MM-DD.');
        }
        if(!r.criadoEm)throw Error(type+': CriadoEm é obrigatório.');
        if(statuses[type]&&!statuses[type].includes(r.status))throw Error(type+': status inválido.');
        if(['prospects','clientes'].includes(type)&&!r.nome.trim())throw Error(type+': nome obrigatório.');
        if(['oportunidades','propostas'].includes(type)&&!r.titulo.trim())throw Error(type+': título obrigatório.');
        if(r.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))throw Error(type+': email inválido.');
      }
    }
    const lookup=(type,key)=>data[type].find(r=>r.id===key);
    for(const p of data.prospects)if(p.status==='Convertido'?!lookup('clientes',p.clienteId):!!p.clienteId)throw Error('Prospect com vínculo de cliente inconsistente.');
    for(const o of data.oportunidades) {
      if(!lookup('clientes',o.clienteId))throw Error('Oportunidade sem cliente válido.');
      const accepted=data.propostas.filter(p=>p.oportunidadeId===o.id&&p.status==='Aceita');
      if((o.status==='Ganha'&&accepted.length!==1)||(o.status!=='Ganha'&&accepted.length))throw Error('Negócio ganho exige exatamente uma proposta aceita.');
      if(o.status!=='Aberta'&&data.propostas.some(p=>p.oportunidadeId===o.id&&['Rascunho','Enviada'].includes(p.status)))throw Error('Negócio encerrado possui proposta em aberto.');
    }
    for(const p of data.propostas) {
      if(!lookup('oportunidades',p.oportunidadeId))throw Error('Proposta sem oportunidade válida.');
      if(p.status==='Aceita'&&data.faturas.filter(f=>f.propostaId===p.id).length!==1)throw Error('Proposta aceita exige uma única fatura.');
    }
    const nums=new Set(), billed=new Set();
    for(const f of data.faturas) {
      const p=lookup('propostas',f.propostaId);
      if(!p||p.status!=='Aceita'||p.valor!==f.valor||billed.has(f.propostaId))throw Error('Fatura incompatível com a proposta ou duplicada.');
      if(!f.numero.trim()||nums.has(f.numero))throw Error('Número de fatura vazio ou duplicado.');
      if(!f.emissao||!f.vencimento||f.vencimento<f.emissao)throw Error('Vencimento deve ser igual ou posterior à emissão.');
      if(f.status==='Paga'?!f.pagaEm||f.pagaEm<f.emissao:!!f.pagaEm)throw Error('Data de pagamento incompatível com o status da fatura.');
      nums.add(f.numero);billed.add(f.propostaId);
    }
    return data;
  }
  function persist(){try{localStorage.setItem(KEY,JSON.stringify({version:1,data:db,fileName,exported}));cacheOK=true;}catch{cacheOK=false;}updateStatus();}
  function updateStatus(){
    $('#file-name').text(fileName || 'Sua base de vendas');
    let text=JSON.stringify(db)===exported?'Excel atualizado com os dados atuais.':'Alterações locais • exporte o Excel para salvar na planilha.';
    if(!Object.values(db).some(a=>a.length)&&!exported)text='Importe um Excel ou comece cadastrando um prospect.';
    if(!cacheOK)text='Cache indisponível. Exporte o Excel antes de fechar esta janela.';
    $('#save-status').text(text);
  }
  function mutate(fn,message){const backup=JSON.stringify(db);try{fn();validate(db);persist();render();if(message)notice(message);$('#modal-error').remove();return true;}catch(e){db=JSON.parse(backup);notice(e.message,'danger');if(document.getElementById('editor').classList.contains('show')){$('#modal-error').remove();$('<div id="modal-error" class="alert alert-danger" role="alert"></div>').text(e.message).prependTo('#editor-fields');}return false;}}
  try{const raw=localStorage.getItem(KEY);if(raw){const saved=JSON.parse(raw);if(saved.version!==1)throw Error('Versão de cache desconhecida.');db=validate(saved.data);fileName=saved.fileName||'';exported=saved.exported||'';}}catch(e){cacheOK=false;notice('Não foi possível recuperar o cache local. Importe seu último Excel. '+e.message,'warning');}
  const statusOptions = {prospects:['Novo','Em contato','Convertido'],oportunidades:['Aberta','Ganha','Perdida'],propostas:['Rascunho','Enviada','Aceita','Recusada'],faturas:['Pendente','Paga']};
  function rowHTML(type,r) {
    let cells='',buttons='';
    if(type==='prospects') {cells=`<td>${entity(r.nome,r.empresa)}</td><td>${esc(r.email||r.telefone||'—')}</td><td>${esc(r.origem||'—')}</td><td>${badge(r.status)}</td>`;buttons=act('edit',r.id,'Editar')+(r.status!=='Convertido'?act('convert',r.id,'Converter →',true):act('client',r.clienteId,'Ver cliente'));}
    if(type==='clientes'){cells=`<td>${entity(r.empresa||r.nome,r.empresa?r.nome:'')}</td><td>${esc(r.email||'—')}<small>${esc(r.telefone)}</small></td><td>${db.oportunidades.filter(o=>o.clienteId===r.id).length} negócios</td>`;buttons=act('edit',r.id,'Editar')+act('new-opp',r.id,'+ Oportunidade',true);}
    if(type==='oportunidades'){cells=`<td>${entity(r.titulo,clientName(r.clienteId))}</td><td>${money(r.valor)}</td><td>${date(r.previsao)}</td><td>${badge(r.status)}</td>`;buttons=act('edit',r.id,'Editar')+(r.status==='Aberta'?act('new-proposal',r.id,'+ Proposta',true)+act('lose',r.id,'Perdida'): '');}
    if(type==='propostas'){cells=`<td>${entity(r.titulo,oppName(r.oportunidadeId))}</td><td>${money(r.valor)}</td><td>${date(r.validade)}</td><td>${badge(r.status)}</td>`;buttons=act('edit',r.id,['Aceita','Recusada'].includes(r.status)?'Detalhes':'Editar');if(['Rascunho','Enviada'].includes(r.status)){if(r.status==='Rascunho')buttons+=act('send',r.id,'Enviada');buttons+=act('win',r.id,'Aceitar',true)+act('reject',r.id,'Recusar');}}
    if(type==='faturas'){cells=`<td>${entity(r.numero,invoiceClient(r))}</td><td>${money(r.valor)}</td><td>${date(r.vencimento)}${r.status==='Pendente'&&r.vencimento<today()?'<small class="text-danger">Em atraso</small>':''}</td><td>${badge(r.status)}${r.pagaEm?`<small>${date(r.pagaEm)}</small>`:''}</td>`;buttons=act('edit',r.id,'Editar')+(r.status==='Pendente'?act('pay',r.id,'Registrar pagamento',true):'');}
    return `<tr>${cells}<td><div class="actions">${buttons}</div></td></tr>`;
  }
  const headers={prospects:['CONTATO / EMPRESA','EMAIL / TELEFONE','ORIGEM','ETAPA'],clientes:['EMPRESA / CONTATO','EMAIL / TELEFONE','OPORTUNIDADES'],oportunidades:['NEGÓCIO / CLIENTE','VALOR ESTIMADO','PREVISÃO','STATUS'],propostas:['PROPOSTA / NEGÓCIO','VALOR','VALIDADE','STATUS'],faturas:['FATURA / CLIENTE','VALOR','VENCIMENTO','STATUS']};
  function emptyHTML(type){const message={prospects:'Cadastre quem pode se tornar seu próximo cliente.',clientes:'Converta um prospect ou cadastre um cliente.',oportunidades:'Crie uma oportunidade vinculada a um cliente.',propostas:'Abra uma oportunidade para preparar sua proposta.',faturas:'Ao aceitar uma proposta, sua fatura aparece aqui.'};return `<div class="empty"><div class="empty-symbol">◎</div><h3>${query||filter?'Nenhum resultado encontrado':'Tudo pronto para começar'}</h3><p>${query||filter?'Tente outra busca ou altere o filtro.':message[type]}</p>${type==='prospects'&&!query&&!filter?'<button class="btn btn-primary" data-action="new">+ Cadastrar primeiro prospect</button>':''}</div>`;}
  function table(type,rows){return rows.length?`<div class="table-responsive"><table class="table"><thead><tr>${headers[type].map(h=>`<th scope="col">${h}</th>`).join('')}<th scope="col">AÇÕES</th></tr></thead><tbody>${rows.map(r=>rowHTML(type,r)).join('')}</tbody></table></div>`:emptyHTML(type);}
  function stats(){return `<div class="stats">${[
    ['Prospects ativos',db.prospects.filter(r=>r.status!=='Convertido').length,'Novas conexões para cultivar','◎'],
    ['Em negociação',money(sum(db.oportunidades.filter(r=>r.status==='Aberta'))),'Valor estimado das oportunidades','◇'],
    ['Negócios conquistados',db.oportunidades.filter(r=>r.status==='Ganha').length,'Oportunidades com proposta aceita','↗'],
    ['A receber',money(sum(db.faturas.filter(r=>r.status==='Pendente'))),'Faturas aguardando pagamento','▧']
  ].map(([title,value,note,symbol])=>`<div class="stat"><div class="stat-top">${title}<span class="stat-symbol">${symbol}</span></div><div class="stat-value">${value}</div><small>${note}</small></div>`).join('')}</div>`;}
  function stages(detailed=false){const groups=[
    ['Prospects','Primeiro contato',db.prospects.filter(r=>r.status!=='Convertido'),'prospects'],
    ['Oportunidades','Negócios em aberto',db.oportunidades.filter(r=>r.status==='Aberta'&&!db.propostas.some(p=>p.oportunidadeId===r.id&&['Rascunho','Enviada'].includes(p.status))),'oportunidades'],
    ['Propostas','Em avaliação',db.propostas.filter(r=>['Rascunho','Enviada'].includes(r.status)),'propostas'],
    ['Conquistados','Propostas aceitas',db.oportunidades.filter(r=>r.status==='Ganha'),'oportunidades'],
    ['Faturas','Aguardando pagamento',db.faturas.filter(r=>r.status==='Pendente'),'faturas']
  ];const max=Math.max(1,...groups.map(g=>g[2].length));return `<div class="pipeline ${detailed?'kanban':''}">${groups.map(([title,note,list,type],i)=>`<div class="stage"><div class="stage-name">${String(i+1).padStart(2,'0')} · ${title}<span>→</span></div><div class="stage-num">${list.length}</div><div class="stage-caption">${note}</div><div class="stage-progress"><i style="width:${list.length/max*100}%"></i></div>${detailed?list.map(r=>`<div class="kanban-card"><strong>${esc(r.nome||r.titulo||r.numero)}</strong><p>${r.valor?money(r.valor):esc(r.empresa||r.origem||'Novo contato')}</p><button class="btn btn-light" data-action="open" data-type="${type}" data-id="${esc(r.id)}">Abrir →</button></div>`).join('')||'<p class="stage-caption mt-3">Nenhum registro nesta etapa.</p>':''}</div>`).join('')}</div>`;}
  function render(){
    $('nav a').removeClass('active').filter(`[data-page="${page}"]`).addClass('active').attr('aria-current','page');$('nav a').not('.active').removeAttr('aria-current');
    $('#breadcrumb').text(names[page]);$('#prospect-count').text(db.prospects.filter(r=>r.status!=='Convertido').length);
    $('#page-title').text(page==='inicio'?'Seu próximo negócio começa aqui.':names[page]);
    $('#page-subtitle').text(({inicio:'Acompanhe cada conversa, da primeira conexão à conquista.',funil:'Cada conexão tem um caminho. Acompanhe o seu, etapa por etapa.',prospects:'Transforme primeiras conversas em boas oportunidades.',clientes:'Quem confia no seu trabalho, sempre por perto.',oportunidades:'Dê um próximo passo em cada negociação.',propostas:'Da ideia à aprovação, com tudo organizado.',faturas:'Negócios conquistados, pagamentos acompanhados.'})[page]);
    const target=['inicio','funil','faturas'].includes(page)?'prospects':page;
    $('#new-record').toggle(page!=='faturas').text('+ Nov'+(target==='prospects'||target==='clientes'?'o ':'a ')+singular[target]).data('type',target);
    if(page==='inicio'){
      $('#content').html(stats()+`<div class="section-heading"><div><h2>Seu funil, em movimento</h2><p>Um panorama de cada etapa do relacionamento.</p></div><a href="#funil">Explorar funil →</a></div>`+stages()+`<div class="panel"><div class="panel-header"><h2>Últimas conexões</h2><a href="#prospects" class="btn btn-link">Ver prospects →</a></div>${table('prospects',[...db.prospects].reverse().slice(0,5))}</div>`+(!Object.values(db).some(a=>a.length)?'<div class="welcome-note"><div><strong>Um espaço novo. Muitas possibilidades.</strong><p>Explore o CRM com uma base de exemplo antes de começar.</p></div><button class="btn btn-light" data-action="demo">Experimentar com exemplos →</button></div>':''));
    }else if(page==='funil'){$('#content').html(stats()+stages(true)+`<p class="privacy-text">Oportunidades saem da coluna inicial quando recebem propostas em aberto. Negócios ganhos e suas faturas aparecem em colunas distintas. O funil não inclui negócios perdidos, propostas recusadas ou faturas pagas.</p>`);}
    else{
      $('#content').html(`<section class="panel"><div class="panel-header"><h2>${names[page]} <span class="text-muted fs-6">(${db[page].length})</span></h2><div class="toolbar"><input id="search" class="form-control search" type="search" aria-label="Buscar registros" placeholder="Buscar nome, empresa, contato…" value="${esc(query)}">${statusOptions[page]?`<select id="status-filter" class="form-select form-select-sm" aria-label="Filtrar status"><option value="">Todos os status</option>${statusOptions[page].map(s=>`<option ${filter===s?'selected':''}>${s}</option>`).join('')}</select>`:''}</div></div><div id="table-body"></div></section>`);renderRows();
    }updateStatus();
  }
  function renderRows(){const q=query.toLocaleLowerCase('pt-BR');const rows=[...db[page]].reverse().filter(r=>(!filter||r.status===filter)&&([...Object.values(r),r.clienteId?clientName(r.clienteId):'',r.oportunidadeId?oppName(r.oportunidadeId):'',page==='faturas'?invoiceClient(r):''].join(' ').toLocaleLowerCase('pt-BR').includes(q)));$('#table-body').html(table(page,rows));}
  const contactFields=[['nome','Nome do contato','text',true],['empresa','Empresa','text'],['email','Email','email'],['telefone','Telefone','tel']];
  function input([key,label,type='text',required=false],value='',options={}){let control='';const attrs=`id="field-${key}" name="${key}" ${required?'required':''} ${options.readonly?'readonly':''}`;
    if(type==='textarea')control=`<textarea class="form-control" ${attrs} rows="3" maxlength="10000">${esc(value)}</textarea>`;
    else if(type==='select')control=`<select class="form-select" ${attrs} ${options.readonly?'disabled':''}>${options.choices.map(([v,t])=>`<option value="${esc(v)}" ${value===v?'selected':''}>${esc(t)}</option>`).join('')}</select>`;
    else control=`<input class="form-control" type="${type}" ${attrs} value="${esc(value)}" ${type==='number'?'min="0.01" max="1000000000000" step="0.01"':'maxlength="1000"'}>`;
    return `<div class="mb-3"><label for="field-${key}" class="form-label">${label}${required?' <span aria-hidden="true">*</span>':''}</label>${control}</div>`;
  }
  function showForm(type,key=null,preset={}){
    const original=key?find(type,key):null;if(key&&!original)return;
    editing={type,key,mode:'edit'};const r={...preset,...original};let fields='';
    $('#editor-title').text(key?'Editar '+singular[type]:'Nov'+(['prospects','clientes'].includes(type)?'o ':'a ')+singular[type]);
    if(['prospects','clientes'].includes(type)){fields+=contactFields.map(f=>input(f,r[f[0]])).join('');if(type==='prospects')fields+=input(['origem','Origem'],r.origem)+input(['status','Etapa','select',true],r.status||'Novo',{readonly:r.status==='Convertido',choices:(r.status==='Convertido'?['Convertido']:['Novo','Em contato']).map(s=>[s,s])});}
    if(type==='oportunidades'){
      if(!db.clientes.length){notice('Cadastre um cliente ou converta um prospect antes de criar uma oportunidade.','warning');return;}
      fields+=input(['clienteId','Cliente','select',true],r.clienteId||db.clientes[0].id,{readonly:!!key,choices:db.clientes.map(c=>[c.id,(c.empresa?c.empresa+' · ':'')+c.nome])});
      fields+=input(['titulo','Título da oportunidade','text',true],r.titulo)+input(['valor','Valor estimado (R$)','number',true],r.valor)+input(['previsao','Previsão de fechamento','date'],r.previsao);
    }
    if(type==='propostas'){
      const available=key?db.oportunidades.filter(o=>o.id===r.oportunidadeId):db.oportunidades.filter(o=>o.status==='Aberta');
      if(!available.length){notice('Crie uma oportunidade em aberto antes de preparar uma proposta.','warning');return;}
      const locked=!!key&&['Aceita','Recusada'].includes(r.status);
      const selected=available.find(o=>o.id===r.oportunidadeId)||available[0];
      fields+=input(['oportunidadeId','Oportunidade','select',true],selected.id,{readonly:!!key,choices:available.map(o=>[o.id,o.titulo+' · '+clientName(o.clienteId)])});
      fields+=input(['titulo','Título da proposta','text',true],r.titulo||selected.titulo,{readonly:locked})+input(['valor','Valor da proposta (R$)','number',true],r.valor??selected.valor,{readonly:locked})+input(['validade','Validade','date'],r.validade,{readonly:locked});
      fields+=`<p class="form-note">${locked?'Proposta encerrada. Os dados comerciais são preservados. Você pode editar as observações.':'Ao aceitar esta proposta, a oportunidade será ganha e uma fatura será gerada. Outras propostas do negócio serão recusadas.'}</p>`;
    }
    if(type==='faturas')fields+=input(['numero','Número da fatura','text',true],r.numero)+input(['valor','Valor (R$)','number',true],r.valor,{readonly:true})+input(['emissao','Emissão','date',true],r.emissao,{readonly:true})+input(['vencimento','Vencimento','date',true],r.vencimento)+ (r.status==='Paga'?input(['pagaEm','Pagamento em','date',true],r.pagaEm):'')+`<p class="form-note">Fatura comercial de controle interno. Não substitui documento fiscal.</p>`;
    fields+=input(['notas','Observações','textarea'],r.notas);
    $('#editor-fields').html(fields);editor.show();
  }
  function showConvert(key){const p=find('prospects',key);if(!p||p.status==='Convertido')return;editing={type:'prospects',key,mode:'convert'};$('#editor-title').text('Converter prospect');$('#editor-fields').html(`<p class="form-note">${esc(p.nome)} será convertido em cliente, com os dados de contato e uma nova oportunidade.</p>`+input(['titulo','Título da oportunidade','text',true],p.empresa?'Negócio com '+p.empresa:'')+input(['valor','Valor estimado (R$)','number',true])+input(['previsao','Previsão de fechamento','date']));editor.show();}
  function accept(key){const p=find('propostas',key);if(!p||!['Rascunho','Enviada'].includes(p.status))return;editing={type:'propostas',key,mode:'win'};$('#editor-title').text('Conquistar negócio e gerar fatura');$('#editor-fields').html(`<p class="form-note">A proposta “${esc(p.titulo)}” será aceita por ${money(p.valor)}. A oportunidade será marcada como ganha. Outras propostas deste negócio serão recusadas.</p>`+input(['vencimento','Vencimento da fatura','date',true],plusDays(30)));editor.show();}
  $('#editor').on('shown.bs.modal',()=>$('#editor-fields').find('input:not([readonly]),select:not([disabled])').first().trigger('focus'));
  $('#record-form').on('submit',function(event){event.preventDefault();if(!this.reportValidity())return;const values=Object.fromEntries(new FormData(this).entries());const {type,key,mode}=editing;const old=key?find(type,key):null;
    if(mode==='convert')mutate(()=>{if(!old||old.status==='Convertido')throw Error('Prospect já convertido.');const c={...Object.fromEntries(schemas.clientes.map(([k])=>[k,old[k]||''])),id:id('CLI'),criadoEm:today()};db.clientes.push(c);db.oportunidades.push({id:id('OP'),clienteId:c.id,titulo:values.titulo,valor:Number(values.valor),previsao:values.previsao,status:'Aberta',notas:'',criadoEm:today()});old.status='Convertido';old.clienteId=c.id;},'Prospect convertido! Cliente e oportunidade criados.');
    else if(mode==='win')mutate(()=>{if(!old||!['Rascunho','Enviada'].includes(old.status))throw Error('Proposta já encerrada.');if(values.vencimento<today())throw Error('O vencimento não pode ser anterior à emissão.');old.status='Aceita';const o=find('oportunidades',old.oportunidadeId);o.status='Ganha';db.propostas.filter(p=>p.oportunidadeId===o.id&&p.id!==old.id&&['Rascunho','Enviada'].includes(p.status)).forEach(p=>p.status='Recusada');let n=1;while(db.faturas.some(f=>f.numero===`FAT-${String(n).padStart(4,'0')}`))n++;db.faturas.push({id:id('FAT'),propostaId:old.id,numero:`FAT-${String(n).padStart(4,'0')}`,valor:old.valor,emissao:today(),vencimento:values.vencimento,status:'Pendente',pagaEm:'',notas:'',criadoEm:today()});},'Negócio conquistado! Fatura criada, pronta para acompanhar.');
    else mutate(()=>{
      const r=old||{...Object.fromEntries(schemas[type].map(([k])=>[k,k==='valor'?0:''])),id:id(type.toUpperCase().slice(0,3)),criadoEm:today()};
      for(const [k,v] of Object.entries(values))r[k]=k==='valor'?Number(v):v.trim();
      if(!key){if(type==='prospects')r.status=values.status||'Novo';if(type==='oportunidades')r.status='Aberta';if(type==='propostas')r.status='Rascunho';db[type].push(r);}
    },'Registro salvo. Exporte o Excel para atualizar sua planilha.');
    // Validation errors stay visible and preserve the form for correction.
    if(!$('#notice').hasClass('alert-danger'))editor.hide();
  });
  function action(action,key,type){
    const current=type||(['inicio','funil'].includes(page)?'prospects':page);
    if(action==='new')return showForm('prospects');
    if(action==='edit')return showForm(current,key);
    if(action==='open')return showForm(type,key);
    if(action==='convert')return showConvert(key);
    if(action==='client'){location.hash='clientes';return;}
    if(action==='new-opp')return showForm('oportunidades',null,{clienteId:key});
    if(action==='new-proposal')return showForm('propostas',null,{oportunidadeId:key});
    if(action==='win')return accept(key);
    if(action==='demo')return loadDemo();
    if(action==='lose')return confirmAction('Marcar esta oportunidade como perdida? As propostas em aberto serão recusadas.',()=>mutate(()=>{const o=find('oportunidades',key);if(o.status!=='Aberta')throw Error('Oportunidade já encerrada.');o.status='Perdida';db.propostas.filter(p=>p.oportunidadeId===key&&['Rascunho','Enviada'].includes(p.status)).forEach(p=>p.status='Recusada');},'Oportunidade marcada como perdida.'));
    if(action==='pay')return confirmAction('Confirmar o recebimento integral desta fatura na data de hoje?',()=>mutate(()=>{const f=find('faturas',key);f.status='Paga';f.pagaEm=today();},'Pagamento registrado.'));
    if(action==='send'||action==='reject')return confirmAction(action==='send'?'Marcar esta proposta como enviada? O app não envia emails.':'Recusar esta proposta?',()=>mutate(()=>{const p=find('propostas',key);if(!['Rascunho','Enviada'].includes(p.status))throw Error('Proposta já encerrada.');p.status=action==='send'?'Enviada':'Recusada';},'Status da proposta atualizado.'));
  }
  $('#content').on('click','[data-action]',function(){action(this.dataset.action,this.dataset.id,this.dataset.type);});
  $('#new-record').on('click',function(){showForm($(this).data('type'));});
  $('#content').on('input','#search',function(){query=this.value;renderRows();}).on('change','#status-filter',function(){filter=this.value;renderRows();});
  function navigate(){page=Object.hasOwn(names,location.hash.slice(1))?location.hash.slice(1):'inicio';query='';filter='';render();}
  $(window).on('hashchange',navigate);
  function loadDemo(){if(Object.values(db).some(a=>a.length)){notice('A base de exemplo só pode ser carregada com o CRM vazio.','warning');return;}confirmAction('Carregar dados fictícios para explorar o CRM? Eles serão identificados como base de exemplo.',()=>mutate(()=>{
    const common={email:'',telefone:'',notas:'',criadoEm:today()};
    db.prospects=[{...common,id:'PRO-DEMO-1',nome:'Marina Costa',empresa:'Estúdio Aurora',email:'marina@example.com',origem:'Indicação',status:'Novo',clienteId:''},{...common,id:'PRO-DEMO-2',nome:'Rafael Almeida',empresa:'Verde & Cia',origem:'LinkedIn',status:'Em contato',clienteId:''},{...common,id:'PRO-DEMO-3',nome:'Beatriz Lima',empresa:'Casa Botânica',origem:'Evento',status:'Convertido',clienteId:'CLI-DEMO-1'}];
    db.clientes=[{...common,id:'CLI-DEMO-1',nome:'Beatriz Lima',empresa:'Casa Botânica',email:'beatriz@example.com'},{...common,id:'CLI-DEMO-2',nome:'Lucas Santos',empresa:'Café Horizonte'}];
    db.oportunidades=[{id:'OP-DEMO-1',clienteId:'CLI-DEMO-1',titulo:'Identidade visual',valor:4800,previsao:plusDays(15),status:'Aberta',notas:'',criadoEm:today()},{id:'OP-DEMO-2',clienteId:'CLI-DEMO-2',titulo:'Consultoria de marca',valor:3200,previsao:today(),status:'Ganha',notas:'',criadoEm:today()}];
    db.propostas=[{id:'PROP-DEMO-1',oportunidadeId:'OP-DEMO-1',titulo:'Projeto de identidade visual',valor:4800,validade:plusDays(10),status:'Enviada',notas:'',criadoEm:today()},{id:'PROP-DEMO-2',oportunidadeId:'OP-DEMO-2',titulo:'Consultoria de marca',valor:3200,validade:today(),status:'Aceita',notas:'',criadoEm:today()}];
    db.faturas=[{id:'FAT-DEMO-1',propostaId:'PROP-DEMO-2',numero:'FAT-0001',valor:3200,emissao:today(),vencimento:plusDays(30),status:'Pendente',pagaEm:'',notas:'',criadoEm:today()}];fileName='Base de exemplo (dados fictícios)';
  },'Base fictícia carregada. Você pode exportá-la para conhecer o modelo Excel.'));}
  async function exportExcel(){if(busy)return;busy=true;$('#export').prop('disabled',true);const snapshot=JSON.parse(JSON.stringify(db));try{
    const workbook=new ExcelJS.Workbook();workbook.creator='Órbita CRM';workbook.created=new Date();
    for(const [name,fields] of Object.entries(schemas)){
      const sheet=workbook.addWorksheet(name);sheet.columns=fields.map(([key,header])=>({header,key,width:key==='id'||key.endsWith('Id')?45:key==='notas'?45:24}));
      snapshot[name].forEach(r=>sheet.addRow(r));sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:'A1',to:{row:1,column:fields.length}};
      sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF285C4D'}};
      const col=fields.findIndex(([key])=>key==='valor');if(col>=0)sheet.getColumn(col+1).numFmt='"R$" #,##0.00';
    }
    const info=workbook.addWorksheet('LEIA-ME');[
      ['Órbita CRM','Modelo v1'],['Como usar','Edite as abas mantendo os cabeçalhos e IDs. Importe o arquivo no CRM.'],['Relacionamentos','ClienteID, OportunidadeID e PropostaID referenciam os IDs das outras abas.'],['Datas','Use texto no formato AAAA-MM-DD. Datas nativas do Excel também são aceitas.'],['Valores','Use células numéricas, maiores que zero, com até duas casas decimais.'],['Status de prospects','Novo | Em contato | Convertido'],['Status de oportunidades','Aberta | Ganha | Perdida'],['Status de propostas','Rascunho | Enviada | Aceita | Recusada'],['Status de faturas','Pendente | Paga'],['Fluxo','Converta prospects e aceite propostas pelo CRM para manter os vínculos.'],['Privacidade','O aplicativo não transmite dados. Mantenha seu Excel e computador protegidos.'],['Faturas','Documentos de controle interno. Não são notas fiscais.'],['Limites','Importação: até 10 MB e 10.000 registros somados. Sem fórmulas ou macros.']
    ].forEach(row=>info.addRow(row));info.getColumn(1).width=26;info.getColumn(2).width=115;
    const buffer=await workbook.xlsx.writeBuffer();const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='orbita-crm-'+today()+'.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    exported=JSON.stringify(snapshot);fileName=a.download;persist();notice('Excel gerado para download. Confirme que o arquivo foi salvo na sua pasta.');
  }catch(e){notice('Não foi possível gerar o Excel: '+e.message,'danger');}finally{busy=false;$('#export').prop('disabled',false);}}
  $('#export').on('click',exportExcel);
  $('#import').on('click',()=>{if(!busy)$('#file-input').trigger('click');});
  $('#file-input').on('change',async function(){const file=this.files[0];this.value='';if(!file||busy)return;if(!/\.xlsx$/i.test(file.name)||file.size>10*1024*1024){notice('Escolha um arquivo .xlsx com até 10 MB.','danger');return;}busy=true;$('#import').prop('disabled',true);try{
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await file.arrayBuffer());const imported=empty();let count=0;
    for(const [type,fields] of Object.entries(schemas)){
      const sheet=workbook.getWorksheet(type);if(!sheet)throw Error('Aba obrigatória ausente: '+type+'. Exporte um modelo pelo CRM.');
      const columns={};sheet.getRow(1).eachCell((cell,index)=>{if(typeof cell.value!=='string')throw Error(type+': cabeçalho inválido.');if(columns[cell.value])throw Error(type+': cabeçalho duplicado.');columns[cell.value]=index;});
      for(const [,header]of fields)if(!columns[header])throw Error(type+': coluna ausente: '+header);
      sheet.eachRow((row,index)=>{if(index===1)return;const r={};let any=false;for(const [key,header]of fields){let value=row.getCell(columns[header]).value;
        if(value!==null&&value!==undefined&&value!=='')any=true;
        if(value instanceof Date){if(Number.isNaN(value.getTime()))throw Error('Data inválida.');value=value.toISOString().slice(0,10);}
        if(value!==null&&typeof value==='object')throw Error(type+': fórmulas, links e células complexas não são aceitos. Use valores simples.');
        r[key]=key==='valor'?(typeof value==='number'?value:NaN):value===null||value===undefined?'':String(value).trim();
      }if(any){imported[type].push(r);count++;if(count>10000)throw Error('Limite de 10.000 registros por arquivo.');}});
    }
    validate(imported);
    confirmAction(`Importar ${count} registros de “${file.name}”? A base atual será substituída, incluindo dados fictícios. Exporte a base atual antes de confirmar se quiser guardar uma cópia.`,()=>{db=imported;fileName=file.name;exported=JSON.stringify(db);persist();render();notice('Excel importado e validado. Continue seu trabalho normalmente.');});
  }catch(e){notice('Importação cancelada. Seus dados atuais foram preservados. '+e.message,'danger');}finally{busy=false;$('#import').prop('disabled',false);}});
  $('#help').on('click',()=>{ $('#confirmation-title').text('Seus dados, no seu computador');$('#confirmation-text').html('<p>1. Cadastre contatos ou <strong>importe um Excel exportado pelo CRM</strong>.</p><p>2. Trabalhe no fluxo: prospect → cliente + oportunidade → proposta → fatura.</p><p>3. Clique em <strong>Exportar Excel</strong> e guarde a planilha na sua pasta ao terminar. O navegador baixa uma nova cópia: ele não altera automaticamente o arquivo original.</p><p>O cache deste navegador ajuda a recuperar seu trabalho, mas pode ser apagado e varia entre navegadores e caminhos do arquivo. Seu Excel é a cópia portátil dos dados. Evite trabalhar em duas janelas ao mesmo tempo.</p><p class="mb-0">Tudo funciona offline. Não há login, servidor, sincronização, envio de emails nem emissão de nota fiscal. Faturas são registros de controle comercial.</p>');pending=null;confirmation.show();});
  window.addEventListener('beforeunload',event=>{if(JSON.stringify(db)!==exported&&Object.values(db).some(a=>a.length)){event.preventDefault();event.returnValue='';}});
  window.addEventListener('storage',event=>{if(event.key===KEY)notice('A base mudou em outra janela. Exporte suas alterações antes de recarregar para evitar sobrescrever dados.','warning');});
  navigate();
});
