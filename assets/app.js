/* Órbita CRM — opens over file://; no network requests or server. */
'use strict';
$(function () {
  const schemas = {
    prospects: [['id','ID'],['nome','Nome'],['empresa','Empresa'],['email','Email'],['telefone','Telefone'],['origem','Origem'],['status','Status'],['clienteId','ClienteID'],['notas','Notas'],['criadoEm','CriadoEm']],
    clientes: [['id','ID'],['nome','Nome'],['empresa','Empresa'],['email','Email'],['telefone','Telefone'],['notas','Notas'],['criadoEm','CriadoEm']],
    oportunidades: [['id','ID'],['clienteId','ClienteID'],['titulo','Titulo'],['valor','Valor'],['previsao','Previsao'],['status','Status'],['notas','Notas'],['criadoEm','CriadoEm']],
    propostas: [['id','ID'],['oportunidadeId','OportunidadeID'],['titulo','Titulo'],['valor','Valor'],['validade','Validade'],['status','Status'],['notas','Notas'],['criadoEm','CriadoEm']],
    faturas: [['id','ID'],['propostaId','PropostaID'],['numero','Numero'],['valor','Valor'],['emissao','Emissao'],['vencimento','Vencimento'],['status','Status'],['pagaEm','PagaEm'],['notas','Notas'],['criadoEm','CriadoEm']]
  };
  const names = {dashboard:'Dashboard',inicio:'Visão geral',funil:'Funil de vendas',prospects:'Prospects',clientes:'Clientes',oportunidades:'Oportunidades',propostas:'Propostas',faturas:'Faturas'};
  const singular = {prospects:'prospect',clientes:'cliente',oportunidades:'oportunidade',propostas:'proposta',faturas:'fatura'};
  const empty = () => Object.fromEntries(Object.keys(schemas).map(k=>[k,[]]));
  let db = empty(), page = 'dashboard', query = '', filter = '', editing = null, pending = null, busy = false, dashFrom = '', dashTo = '';
  const store = new OrbitaExcel(schemas,validate);
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
  $('#confirm-action').on('click',async function(){if(busy)return;const fn=pending;pending=null;confirmation.hide();if(fn)await fn();});
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
  function updateStatus(){
    $('#file-name').text(store.handle?.name || 'Nenhum Excel aberto');
    $('#save-status').text(busy?'Gravando no Excel…':'Gravação automática ativa · Alterações confirmadas no arquivo.');
  }
  function setBusy(value){busy=value;$('#app-view button,#editor button,#confirmation button').prop('disabled',value);updateStatus();}
  async function mutate(fn,message){if(busy||!store.user)return false;const backup=JSON.stringify(db);setBusy(true);
    try{fn();validate(db);await store.save(db);render();if(message)notice(message+' Salvo no Excel.');$('#modal-error').remove();return true;}
    catch(e){db=JSON.parse(backup);notice('Alteração não confirmada: '+e.message,'danger');if(document.getElementById('editor').classList.contains('show')){$('#modal-error').remove();$('<div id="modal-error" class="alert alert-danger" role="alert"></div>').text(e.message).prependTo('#editor-fields');}return false;}
    finally{setBusy(false);}
  }
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
  function renderDashboard(){
    const inPeriod=d=>(!dashFrom||d>=dashFrom)&&(!dashTo||d<=dashTo);
    const opps=db.oportunidades.filter(o=>inPeriod(o.criadoEm));
    const invoices=db.faturas.filter(f=>inPeriod(f.emissao));
    const paid=db.faturas.filter(f=>f.status==='Paga'&&inPeriod(f.pagaEm));
    const won=opps.filter(o=>o.status==='Ganha'),lost=opps.filter(o=>o.status==='Perdida'),open=opps.filter(o=>o.status==='Aberta');
    const accepted=db.propostas.filter(p=>won.some(o=>o.id===p.oportunidadeId)&&p.status==='Aceita');
    const pendingInvoices=invoices.filter(f=>f.status==='Pendente'),overdue=pendingInvoices.filter(f=>f.vencimento<today());
    const cards=[['Recebido',money(sum(paid)),'Por data de pagamento'],['A receber',money(sum(pendingInvoices)),'Por data de emissão'],['Em atraso',money(sum(overdue)),overdue.length+' fatura(s) vencida(s)'],['Pipeline aberto',money(sum(open)),open.length+' oportunidade(s)'],['Taxa de conquista',(won.length+lost.length?(won.length/(won.length+lost.length)*100).toFixed(1).replace('.',','):'0')+'%','Ganhas ÷ encerradas no recorte'],['Ticket médio ganho',money(won.length?sum(accepted)/won.length:0),won.length+' negócio(s) ganho(s)']];
    const end=dashTo||today();const endMonth=new Date(end.slice(0,7)+'-01T12:00:00');
    const months=Array.from({length:6},(_,i)=>{const d=new Date(endMonth);d.setMonth(d.getMonth()-5+i);return {key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}),billed:0,received:0};});
    for(const m of months){m.billed=sum(invoices.filter(f=>f.emissao.startsWith(m.key)));m.received=sum(paid.filter(f=>f.pagaEm.startsWith(m.key)));}
    const max=Math.max(1,...months.flatMap(m=>[m.billed,m.received]));
    const top=new Map();for(const f of invoices){const p=find('propostas',f.propostaId),o=find('oportunidades',p.oportunidadeId);top.set(o.clienteId,(top.get(o.clienteId)||0)+f.valor);}
    const leaders=[...top].sort((a,b)=>b[1]-a[1]).slice(0,5);
    const stagesData=[['Abertas',open.length,'#b2c29a'],['Ganhas',won.length,'#467963'],['Perdidas',lost.length,'#cba18b']];
    $('#content').html(`<div class="dashboard-toolbar"><div><h2>Seu negócio em números</h2><p>Indicadores calculados a partir do Excel aberto.</p></div><form id="dashboard-filter" class="dashboard-filter"><label>De<input type="date" id="dash-from" class="form-control" value="${esc(dashFrom)}" aria-label="Início do período"></label><label>Até<input type="date" id="dash-to" class="form-control" value="${esc(dashTo)}" aria-label="Fim do período"></label><button class="btn btn-primary">Aplicar</button><button type="button" id="dash-clear" class="btn btn-light">Todo o período</button></form></div>
      <div class="stats dashboard-stats">${cards.map(([title,value,note])=>`<div class="stat"><div class="stat-top">${title}</div><div class="stat-value">${value}</div><small>${note}</small></div>`).join('')}</div>
      <div class="dashboard-grid"><section class="panel"><div class="panel-header"><div><h2>Faturado × recebido</h2><p class="chart-note">6 meses até ${date(end)} · respeita o filtro de datas</p></div><div class="chart-legend"><span>● Faturado</span><span>● Recebido</span></div></div><div class="monthly-chart" role="img" aria-label="Comparativo mensal de valores faturados e recebidos. Valores detalhados na tabela abaixo.">${months.map(m=>`<div class="month-group"><div class="month-bars"><div class="bar billed" style="height:${m.billed/max*100}%" title="Faturado: ${money(m.billed)}"></div><div class="bar received" style="height:${m.received/max*100}%" title="Recebido: ${money(m.received)}"></div></div><span>${esc(m.label)}</span></div>`).join('')}</div><details class="chart-details"><summary>Ver valores por mês</summary><div class="table-responsive"><table class="table"><thead><tr><th>MÊS</th><th>FATURADO</th><th>RECEBIDO</th></tr></thead><tbody>${months.map(m=>`<tr><td>${esc(m.label)}</td><td>${money(m.billed)}</td><td>${money(m.received)}</td></tr>`).join('')}</tbody></table></div></details></section>
      <section class="panel"><div class="panel-header"><h2>Resultado das oportunidades</h2></div><div class="outcome-chart">${stagesData.map(([label,n,color])=>`<div class="outcome-row"><div><span>${label}</span><strong>${n}</strong></div><div class="outcome-track"><i style="width:${opps.length?n/opps.length*100:0}%;background:${color}"></i></div></div>`).join('')}<p class="chart-note">Por data de criação da oportunidade. O status representa a situação atual.</p></div></section>
      <section class="panel"><div class="panel-header"><h2>Clientes por faturamento</h2><span class="chart-note">Top 5 · emissão no período</span></div>${leaders.length?`<div class="table-responsive"><table class="table"><thead><tr><th>CLIENTE</th><th>FATURADO</th></tr></thead><tbody>${leaders.map(([key,value])=>`<tr><td>${entity(clientName(key))}</td><td>${money(value)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nenhuma fatura no período.</div>'}</section>
      <section class="panel"><div class="panel-header"><h2>Atenção aos recebimentos</h2><span class="chart-note">Pendentes no recorte de emissão</span></div>${pendingInvoices.length?`<div class="table-responsive"><table class="table"><thead><tr><th>FATURA / CLIENTE</th><th>VALOR</th><th>VENCIMENTO</th></tr></thead><tbody>${[...pendingInvoices].sort((a,b)=>a.vencimento.localeCompare(b.vencimento)).slice(0,5).map(f=>`<tr><td>${entity(f.numero,invoiceClient(f))}</td><td>${money(f.valor)}</td><td class="${f.vencimento<today()?'text-danger':''}">${date(f.vencimento)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Nenhum recebimento pendente neste período.</div>'}</section></div>`);
  }
  $('#content').on('submit','#dashboard-filter',function(event){event.preventDefault();const from=$('#dash-from').val(),to=$('#dash-to').val();if(from&&to&&from>to){notice('A data inicial deve ser anterior ou igual à data final.','danger');return;}dashFrom=from;dashTo=to;renderDashboard();}).on('click','#dash-clear',()=>{dashFrom='';dashTo='';renderDashboard();});
  function render(){
    if(!store.user){$('#content').empty();return;}
    $('nav a').removeClass('active').filter(`[data-page="${page}"]`).addClass('active').attr('aria-current','page');$('nav a').not('.active').removeAttr('aria-current');
    $('#breadcrumb').text(names[page]);$('#prospect-count').text(db.prospects.filter(r=>r.status!=='Convertido').length);
    $('#page-title').text(page==='inicio'?'Seu próximo negócio começa aqui.':names[page]);
    $('#page-subtitle').text(({dashboard:'Os números que ajudam você a decidir seu próximo passo.',inicio:'Acompanhe cada conversa, da primeira conexão à conquista.',funil:'Cada conexão tem um caminho. Acompanhe o seu, etapa por etapa.',prospects:'Transforme primeiras conversas em boas oportunidades.',clientes:'Quem confia no seu trabalho, sempre por perto.',oportunidades:'Dê um próximo passo em cada negociação.',propostas:'Da ideia à aprovação, com tudo organizado.',faturas:'Negócios conquistados, pagamentos acompanhados.'})[page]);
    const target=['dashboard','inicio','funil','faturas'].includes(page)?'prospects':page;
    $('#new-record').toggle(page!=='faturas').text('+ Nov'+(target==='prospects'||target==='clientes'?'o ':'a ')+singular[target]).data('type',target);
    if(page==='dashboard'){renderDashboard();}
    else if(page==='inicio'){
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
  $('#record-form').on('submit',async function(event){event.preventDefault();if(!this.reportValidity())return;const values=Object.fromEntries(new FormData(this).entries());const {type,key,mode}=editing;const old=key?find(type,key):null;
    let saved;
    if(mode==='convert')saved=await mutate(()=>{if(!old||old.status==='Convertido')throw Error('Prospect já convertido.');const c={...Object.fromEntries(schemas.clientes.map(([k])=>[k,old[k]||''])),id:id('CLI'),criadoEm:today()};db.clientes.push(c);db.oportunidades.push({id:id('OP'),clienteId:c.id,titulo:values.titulo,valor:Number(values.valor),previsao:values.previsao,status:'Aberta',notas:'',criadoEm:today()});old.status='Convertido';old.clienteId=c.id;},'Prospect convertido! Cliente e oportunidade criados.');
    else if(mode==='win')saved=await mutate(()=>{if(!old||!['Rascunho','Enviada'].includes(old.status))throw Error('Proposta já encerrada.');if(values.vencimento<today())throw Error('O vencimento não pode ser anterior à emissão.');old.status='Aceita';const o=find('oportunidades',old.oportunidadeId);o.status='Ganha';db.propostas.filter(p=>p.oportunidadeId===o.id&&p.id!==old.id&&['Rascunho','Enviada'].includes(p.status)).forEach(p=>p.status='Recusada');let n=1;while(db.faturas.some(f=>f.numero===`FAT-${String(n).padStart(4,'0')}`))n++;db.faturas.push({id:id('FAT'),propostaId:old.id,numero:`FAT-${String(n).padStart(4,'0')}`,valor:old.valor,emissao:today(),vencimento:values.vencimento,status:'Pendente',pagaEm:'',notas:'',criadoEm:today()});},'Negócio conquistado! Fatura criada, pronta para acompanhar.');
    else saved=await mutate(()=>{
      const r=old||{...Object.fromEntries(schemas[type].map(([k])=>[k,k==='valor'?0:''])),id:id(type.toUpperCase().slice(0,3)),criadoEm:today()};
      for(const [k,v] of Object.entries(values))r[k]=k==='valor'?Number(v):v.trim();
      if(!key){if(type==='prospects')r.status=values.status||'Novo';if(type==='oportunidades')r.status='Aberta';if(type==='propostas')r.status='Rascunho';db[type].push(r);}
    },'Registro atualizado.');
    // Validation errors stay visible and preserve the form for correction.
    if(saved)editor.hide();
  });
  function action(action,key,type){
    if(busy||!store.user)return;
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
  function navigate(){page=Object.hasOwn(names,location.hash.slice(1))?location.hash.slice(1):'dashboard';query='';filter='';render();}
  $('nav').on('click','a',event=>{if(busy)event.preventDefault();});
  $(window).on('hashchange',()=>{if(!busy)navigate();});
  function loadDemo(){if(Object.values(db).some(a=>a.length)){notice('A base de exemplo só pode ser carregada com o CRM vazio.','warning');return;}confirmAction('Carregar dados fictícios para explorar o CRM? Eles serão identificados como base de exemplo.',()=>mutate(()=>{
    const common={email:'',telefone:'',notas:'',criadoEm:today()};
    db.prospects=[{...common,id:'PRO-DEMO-1',nome:'Marina Costa',empresa:'Estúdio Aurora',email:'marina@example.com',origem:'Indicação',status:'Novo',clienteId:''},{...common,id:'PRO-DEMO-2',nome:'Rafael Almeida',empresa:'Verde & Cia',origem:'LinkedIn',status:'Em contato',clienteId:''},{...common,id:'PRO-DEMO-3',nome:'Beatriz Lima',empresa:'Casa Botânica',origem:'Evento',status:'Convertido',clienteId:'CLI-DEMO-1'}];
    db.clientes=[{...common,id:'CLI-DEMO-1',nome:'Beatriz Lima',empresa:'Casa Botânica',email:'beatriz@example.com'},{...common,id:'CLI-DEMO-2',nome:'Lucas Santos',empresa:'Café Horizonte'}];
    db.oportunidades=[{id:'OP-DEMO-1',clienteId:'CLI-DEMO-1',titulo:'Identidade visual',valor:4800,previsao:plusDays(15),status:'Aberta',notas:'',criadoEm:today()},{id:'OP-DEMO-2',clienteId:'CLI-DEMO-2',titulo:'Consultoria de marca',valor:3200,previsao:today(),status:'Ganha',notas:'',criadoEm:today()}];
    db.propostas=[{id:'PROP-DEMO-1',oportunidadeId:'OP-DEMO-1',titulo:'Projeto de identidade visual',valor:4800,validade:plusDays(10),status:'Enviada',notas:'',criadoEm:today()},{id:'PROP-DEMO-2',oportunidadeId:'OP-DEMO-2',titulo:'Consultoria de marca',valor:3200,validade:today(),status:'Aceita',notas:'',criadoEm:today()}];
    db.faturas=[{id:'FAT-DEMO-1',propostaId:'PROP-DEMO-2',numero:'FAT-0001',valor:3200,emissao:today(),vencimento:plusDays(30),status:'Pendente',pagaEm:'',notas:'',criadoEm:today()}];
  },'Base fictícia carregada.'));}
  async function exportExcel(){if(busy||!store.user)return;const url=URL.createObjectURL(new Blob([store.bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download='copia-'+store.handle.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notice('Cópia do último Excel salvo gerada para download.');}
  $('#export').on('click',exportExcel);
  function showAuth(){if(busy)return;store.logout();db=empty();$('#content').empty();$('#app-view').prop('hidden',true);$('#auth-view').prop('hidden',false);$('#login-form')[0].reset();$('#auth-file-name').text('Nenhuma planilha selecionada');$('#auth-title').text('Entre no seu CRM');$('#setup-fields').prop('hidden',true);$('#login-confirm').prop('required',false);$('#login-password').attr('autocomplete','current-password').removeAttr('minlength');$('#login-submit').prop('disabled',true).text('Entrar');$('#auth-notice').attr('class','alert alert-info').text('Abra sua planilha para entrar novamente.');$('#notice').addClass('d-none');}
  $('#logout,#import').on('click',showAuth);
  function authMessage(text,type='info'){$('#auth-notice').attr('class','alert alert-'+type).text(text);}
  async function selectExcel(create){if(busy)return;if(!OrbitaExcel.supported()){authMessage('Este navegador não oferece gravação direta. Abra o CRM.html no Chrome ou Edge para computador.','warning');return;}
    try{
      // Invoke the native picker immediately inside the user's click gesture.
      const handle=create?await window.showSaveFilePicker({suggestedName:'orbita-crm.xlsx',types:OrbitaExcel.fileTypes}):(await window.showOpenFilePicker({types:OrbitaExcel.fileTypes,multiple:false,mode:'readwrite'}))[0];
      busy=true;$('#auth-view button,#login-form input').prop('disabled',true);authMessage('Abrindo e validando a planilha…');store.logout();
      if(create)await store.prepareNew(handle);else await store.open(handle);
      const setup=store.needsSetup;$('#auth-file-name').text(handle.name);$('#setup-fields').prop('hidden',!setup);$('#login-confirm').prop('required',setup);$('#login-password').attr('autocomplete',setup?'new-password':'current-password');if(setup)$('#login-password').attr('minlength','8');else $('#login-password').removeAttr('minlength');
      $('#auth-title').text(setup?'Configure o primeiro acesso':'Entre no seu CRM');$('#login-submit').text(setup?'Criar acesso e entrar':'Entrar');$('#login-form')[0].reset();
      authMessage(setup?'Esta planilha ainda não tem a aba usuarios. Defina o primeiro login e uma senha de pelo menos 8 caracteres. O cadastro será gravado no Excel.':'Planilha aberta. Informe seu login e senha cadastrados na aba usuarios.');
    }catch(e){if(e.name!=='AbortError'){store.logout();$('#auth-file-name').text('Nenhuma planilha selecionada');authMessage(e.message,'danger');}}
    finally{busy=false;$('#auth-view button,#login-form input').prop('disabled',false);$('#login-submit').prop('disabled',!store.handle);}
  }
  $('#open-excel').on('click',()=>selectExcel(false));$('#create-excel').on('click',()=>selectExcel(true));
  $('#login-form').on('submit',async function(event){event.preventDefault();if(busy||!store.handle||!this.reportValidity())return;
    const login=$('#login-name').val(),password=$('#login-password').val();if(store.needsSetup&&password!==$('#login-confirm').val()){authMessage('As senhas não coincidem.','danger');return;}
    busy=true;$('#auth-view button').prop('disabled',true);
    try{if(store.needsSetup)await store.setup(login,password,$('#login-display').val(),empty());db=await store.authenticate(login,password);$('#login-form')[0].reset();$('#auth-view').prop('hidden',true);$('#app-view').prop('hidden',false);$('#session-user').text(store.user.nome);$('#notice').addClass('d-none');navigate();}
    catch(e){authMessage(e.message,'danger');$('#login-password,#login-confirm').val('');if(!store.needsSetup){$('#setup-fields').prop('hidden',true);$('#login-confirm').prop('required',false);$('#login-password').removeAttr('minlength');$('#login-submit').text('Entrar');}}
    finally{busy=false;$('#auth-view button').prop('disabled',false);updateStatus();}
  });
  $('#help').on('click',()=>{ $('#confirmation-title').text('Trabalhando no seu Excel');$('#confirmation-text').html('<p>Abra ou crie seu Excel na tela de login e autorize a edição. Cada cadastro, conversão, proposta e pagamento é gravado <strong>no mesmo arquivo</strong>. Aguarde o indicador de gravação antes de fechar.</p><p>Use <strong>Baixar cópia</strong> para um backup. Mantenha a planilha fechada no Excel enquanto usa o CRM e evite editar o mesmo arquivo em várias janelas. Ao detectar mudança externa, o app pede que você saia e reabra o arquivo.</p><p>O login vem da aba <code>usuarios</code>. O app não mantém sessão nem dados no cache: ao reabrir, selecione o Excel e entre novamente. O login não criptografa a planilha.</p><p class="mb-0">A gravação direta exige Chrome ou Edge no computador. Não há servidor, sincronização ou emissão de nota fiscal.</p>');pending=null;confirmation.show();});
  window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
  if(!OrbitaExcel.supported())authMessage('Para ler e gravar no mesmo Excel, abra este HTML no Chrome ou Edge para computador.','warning');
  navigate();
});
