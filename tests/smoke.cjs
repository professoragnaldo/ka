/* Development-only end-to-end test. No server or runtime npm dependencies. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const routed = process.argv.includes('--routed');
(async () => {
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const context = await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [], network = [];
  const temp = await fs.mkdtemp(path.join(os.tmpdir(),'orbita-test-'));
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept());
  const base = routed ? 'https://orbita.test/' : 'file://'+root+'/';
  // Managed cloud Chromium blocks file:// by policy. Routed mode serves bytes
  // from disk through Playwright interception; no web server or remote requests.
  await context.route('**/*',async route=>{
    const url = new URL(route.request().url());
    if(routed&&url.origin==='https://orbita.test'){
      const file = path.join(root, decodeURIComponent(url.pathname));
      assert.ok(file.startsWith(root+path.sep));
      const ext = path.extname(file);
      const type={'.html':'text/html','.css':'text/css','.js':'text/javascript'}[ext]||'application/octet-stream';
      return route.fulfill({body:await fs.readFile(file),contentType:type});
    }
    if(['http:','https:'].includes(url.protocol)){network.push(url.href);return route.abort();}
    return route.continue();
  });
  const click = selector => page.locator(selector).click();
  const fill = (name,value)=>page.locator(`[name="${name}"]`).fill(String(value));
  const state = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('orbita.crm.v1')).data);
  const closed = ()=>page.locator('#editor').waitFor({state:'hidden'});
  const confirm = async()=>{await click('#confirm-action');await page.locator('#confirmation').waitFor({state:'hidden'});await page.locator('.modal-backdrop').waitFor({state:'detached'});};
  const go = async section=>{await click(`nav [data-page="${section}"]`);await page.waitForFunction(s=>document.querySelector('#breadcrumb').textContent===s,({prospects:'Prospects',clientes:'Clientes',oportunidades:'Oportunidades',propostas:'Propostas',faturas:'Faturas',inicio:'Visão geral',funil:'Funil de vendas'})[section]);};
  try {
    await page.goto(base+(process.argv.includes('--standalone')?'CRM.html':'index.html'));
    assert.equal(await page.title(),'Órbita · CRM local');
    await click('#new-record');
    await fill('nome','Ana <script>alert(1)</script>');await fill('empresa','Acme & Filhos');await fill('email','ana@example.com');await fill('telefone','11999999999');await fill('origem','Indicação');
    await click('#record-form [type="submit"]');await closed();
    assert.equal((await state()).prospects.length,1);
    assert.equal(await page.locator('#content script').count(),0,'User input must not become HTML');
    await click('[data-action="convert"]');await fill('titulo','Projeto CRM');await fill('valor','1500.50');await fill('previsao','2026-12-15');await click('#record-form [type="submit"]');await closed();
    let data=await state();assert.equal(data.clientes.length,1);assert.equal(data.oportunidades.length,1);assert.equal(data.prospects[0].status,'Convertido');
    await go('oportunidades');await click('[data-action="new-proposal"]');await fill('titulo','Proposta principal');await fill('valor','1800');await fill('validade','2026-12-30');await click('#record-form [type="submit"]');await closed();
    await click('[data-action="new-proposal"]');await fill('titulo','Proposta alternativa');await fill('valor','2000');await click('#record-form [type="submit"]');await closed();
    await go('propostas');
    await page.locator('tr').filter({hasText:'Proposta principal'}).locator('[data-action="send"]').click();await confirm();
    await page.locator('tr').filter({hasText:'Proposta principal'}).locator('[data-action="win"]').click();
    await fill('vencimento','2000-01-01');await click('#record-form [type="submit"]');await page.locator('#modal-error').waitFor();assert.match(await page.locator('#modal-error').innerText(),/vencimento/);assert.equal((await state()).faturas.length,0,'Invalid acceptance must not partially mutate state');
    await fill('vencimento','2099-12-31');await click('#record-form [type="submit"]');await closed();
    data=await state();assert.equal(data.oportunidades[0].status,'Ganha');assert.equal(data.faturas.length,1);assert.equal(data.faturas[0].valor,1800);assert.deepEqual(data.propostas.map(p=>p.status),['Aceita','Recusada']);assert.equal(await page.locator('[data-action="win"]').count(),0);
    // Closed proposal commercial values are immutable, notes remain editable.
    await page.locator('tr').filter({hasText:'Proposta principal'}).locator('[data-action="edit"]').click();assert.equal(await page.locator('[name="valor"]').getAttribute('readonly'),'');await fill('notas','Aprovada pelo cliente');await click('#record-form [type="submit"]');await closed();
    await go('faturas');await click('[data-action="pay"]');await confirm();assert.equal((await state()).faturas[0].status,'Paga');
    await page.reload();assert.equal((await state()).faturas[0].status,'Paga','Data must survive reload');
    // Excel export, actual workbook structure, then round trip through import.
    const downloadEvent=page.waitForEvent('download');await click('#export');const download=await downloadEvent;const xlsx=path.join(temp,'roundtrip.xlsx');await download.saveAs(xlsx);
    const bytes=await fs.readFile(xlsx);assert.equal(bytes.subarray(0,2).toString(),'PK');
    const inspect=await page.evaluate(async bytes=>{const w=new ExcelJS.Workbook();await w.xlsx.load(new Uint8Array(bytes));return {sheets:w.worksheets.map(s=>s.name),amount:w.getWorksheet('faturas').getCell('D2').value};},Array.from(bytes));
    assert.deepEqual(inspect.sheets,['prospects','clientes','oportunidades','propostas','faturas','LEIA-ME']);assert.equal(inspect.amount,1800);
    const before=await state();await page.locator('#file-input').setInputFiles(xlsx);await confirm();assert.deepEqual(await state(),before);
    // Bad relationships are rejected without destroying the current base.
    const invalid=await page.evaluate(async bytes=>{const w=new ExcelJS.Workbook();await w.xlsx.load(new Uint8Array(bytes));w.getWorksheet('faturas').getCell('B2').value='missing-proposal';return Array.from(new Uint8Array(await w.xlsx.writeBuffer()));},Array.from(bytes));
    await page.locator('#file-input').setInputFiles({name:'invalid.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(invalid)});
    await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Importação cancelada'));assert.deepEqual(await state(),before);
    // A valid blank workbook supports starting over; demo data is opt-in.
    const blank=await page.evaluate(async bytes=>{const original=new ExcelJS.Workbook();await original.xlsx.load(new Uint8Array(bytes));const w=new ExcelJS.Workbook();for(const s of original.worksheets)if(s.name!=='LEIA-ME')w.addWorksheet(s.name).addRow(s.getRow(1).values);return Array.from(new Uint8Array(await w.xlsx.writeBuffer()));},Array.from(bytes));
    await page.locator('#file-input').setInputFiles({name:'empty.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(blank)});await confirm();
    await go('inicio');await click('[data-action="demo"]');await confirm();assert.equal((await state()).prospects.length,3);
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(temp,'desktop.png'),fullPage:true});
    // Losing a deal closes proposals; no invoice is created for it.
    await go('oportunidades');await page.locator('tr').filter({hasText:'Identidade visual'}).locator('[data-action="lose"]').click();await confirm();data=await state();assert.equal(data.oportunidades[0].status,'Perdida');assert.equal(data.propostas[0].status,'Recusada');assert.equal(data.faturas.length,1);
    await go('prospects');await page.locator('#search').fill('Verde');assert.equal(await page.locator('tbody tr').count(),1);await page.locator('#search').fill('');await page.locator('#status-filter').selectOption('Convertido');assert.equal(await page.locator('tbody tr').count(),1);
    await page.setViewportSize({width:390,height:844});await go('inicio');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile page must not overflow horizontally');await page.screenshot({path:path.join(temp,'mobile.png'),fullPage:true});
    assert.deepEqual(errors,[],'No JavaScript errors');assert.deepEqual(network,[],'No external network requests');
    console.log('PASS: create, convert, proposals, atomic acceptance, single invoice, payment, persistence, XLSX round trip, invalid XLSX rejection, demo, lost deal, search, filter, mobile, offline assets.');
    console.log('Mode:',routed?'intercepted local files (managed Chromium blocks file://)':'file://');console.log('Screenshots:',temp);
  } catch(error) { console.error('UI notice:',await page.locator('#notice').textContent());await page.screenshot({path:path.join(temp,'failure.png'),fullPage:true});console.error('Failure screenshot:',path.join(temp,'failure.png'));throw error; } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
