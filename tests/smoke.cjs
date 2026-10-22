/* End-to-end tests use real native FileSystemFileHandles in browser storage.
   Only native pickers are replaced; workbook reads/writes are real. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'..'),routed=process.argv.includes('--routed');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(12000);
 const errors=[],network=[],temp=await fs.mkdtemp(path.join(os.tmpdir(),'orbita-v2-'));
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(routed&&url.origin==='https://orbita.test'){const file=path.join(root,decodeURIComponent(url.pathname));assert.ok(file.startsWith(root+path.sep));return route.fulfill({body:await fs.readFile(file),contentType:({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[path.extname(file)]||'application/octet-stream'});}if(['http:','https:'].includes(url.protocol)){network.push(url.href);return route.abort();}return route.continue();});
 await page.addInitScript(()=>{
   window.testFileName='test.xlsx';
   window.testHandle=async(create=false)=>(await navigator.storage.getDirectory()).getFileHandle(window.testFileName,{create});
   const picked=async(create)=>{const h=await window.testHandle(create);return {name:h.name,getFile:()=>h.getFile(),queryPermission:async()=>window.testDenied?'denied':'granted',createWritable:async options=>{if(window.testWriteFail)throw Error('Falha de disco simulada');return h.createWritable(options);}};};
   window.showOpenFilePicker=async()=>[await picked(false)];window.showSaveFilePicker=()=>picked(true);
 });
 const click=s=>page.locator(s).click(),fill=(name,v)=>page.locator(`[name="${name}"]`).fill(String(v));
 const read=()=>page.evaluate(async()=>{const wb=new ExcelJS.Workbook();await wb.xlsx.load(await (await (await window.testHandle()).getFile()).arrayBuffer());return Object.fromEntries(wb.worksheets.map(s=>{const rows=[];s.eachRow((row,n)=>{if(n===1)return;const r={};s.getRow(1).eachCell((c,i)=>r[c.value]=row.getCell(i).value??'');rows.push(r);});return [s.name,rows];}));});
 const saved=()=>page.waitForFunction(()=>!document.querySelector('#new-record').disabled);
 const closed=async()=>{await page.locator('#editor').waitFor({state:'hidden'});await page.locator('.modal-backdrop').waitFor({state:'detached'});};
 const submit=async()=>{await click('#record-form [type="submit"]');await saved();};
 const confirm=async()=>{await click('#confirm-action');await page.locator('#confirmation').waitFor({state:'hidden'});await page.locator('.modal-backdrop').waitFor({state:'detached'});await saved();};
 const go=async section=>{await click(`nav [data-page="${section}"]`);await page.waitForFunction(s=>document.querySelector('nav a.active')?.dataset.page===s,section);};
 const login=async(password='test-password-123')=>{await page.waitForFunction(()=>!document.getElementById('login-submit').disabled);await page.locator('#login-name').fill('ana');await page.locator('#login-password').fill(password);await click('#login-submit');};
 const external=async fn=>{await page.evaluate(async code=>{const h=await window.testHandle();const wb=new ExcelJS.Workbook();await wb.xlsx.load(await (await h.getFile()).arrayBuffer());new Function('wb',code)(wb);const stream=await h.createWritable();await stream.write(await wb.xlsx.writeBuffer());await stream.close();},fn);};
 try{
  await page.goto((routed?'https://orbita.test/':'file://'+root+'/')+(process.argv.includes('--standalone')?'CRM.html':'index.html'));
  assert.equal(await page.locator('#app-view').isVisible(),false);
  await click('#create-excel');await page.locator('#setup-fields').waitFor({state:'visible'});
  await page.locator('#login-name').fill('ana');await page.locator('#login-password').fill('test-password-123');await page.locator('#login-confirm').fill('test-password-123');await page.locator('#login-display').fill('Ana');await click('#login-submit');await page.locator('#app-view').waitFor({state:'visible'});
  let data=await read();assert.equal(data.usuarios[0].Login,'ana');assert.equal(data.usuarios[0].Senha,undefined);assert.match(data.usuarios[0].SenhaHash,/^[0-9a-f]{64}$/);assert.equal(data.prospects.length,0);assert.equal(await page.locator('#breadcrumb').textContent(),'Dashboard');
  await click('#new-record');await fill('nome','Ana <script>alert(1)</script>');await fill('empresa','Acme & Filhos');await fill('email','ana@example.com');await fill('origem','Indicação');await submit();await closed();assert.equal((await read()).prospects.length,1);assert.equal(await page.locator('#content script').count(),0);
  await go('prospects');await click('[data-action="convert"]');await fill('titulo','Projeto CRM');await fill('valor','1500.50');await submit();await closed();data=await read();assert.equal(data.clientes.length,1);assert.equal(data.oportunidades.length,1);assert.equal(data.prospects[0].Status,'Convertido');
  // Unrelated sheets and users must survive each autosave.
  await external("wb.addWorksheet('Anotacoes').addRow(['Preservar este texto']);");
  await click('#logout');await click('#open-excel');await login();await page.locator('#app-view').waitFor({state:'visible'});
  await go('oportunidades');await click('[data-action="new-proposal"]');await fill('titulo','Proposta principal');await fill('valor','1800');await submit();await closed();await click('[data-action="new-proposal"]');await fill('titulo','Proposta alternativa');await fill('valor','2000');await submit();await closed();
  await go('propostas');await page.locator('tr').filter({hasText:'Proposta principal'}).locator('[data-action="win"]').click();await fill('vencimento','2000-01-01');await submit();await page.locator('#modal-error').waitFor();assert.equal((await read()).faturas.length,0);await fill('vencimento','2099-12-31');await submit();await closed();data=await read();assert.equal(data.faturas.length,1);assert.equal(data.faturas[0].Valor,1800);assert.deepEqual(data.propostas.map(p=>p.Status),['Aceita','Recusada']);assert.equal(data.oportunidades[0].Status,'Ganha');assert.ok(data.Anotacoes);assert.equal(data.usuarios[0].Login,'ana');
  await go('faturas');await click('[data-action="pay"]');await confirm();assert.equal((await read()).faturas[0].Status,'Paga');
  await go('dashboard');assert.match(await page.locator('.dashboard-stats .stat').filter({hasText:'Recebido'}).textContent(),/1\.800,00/);assert.match(await page.locator('.dashboard-stats .stat').filter({hasText:'Taxa de conquista'}).textContent(),/100,0%/);assert.equal(await page.locator('.monthly-chart .month-group').count(),6);
  await page.locator('#dash-from').fill('2000-01-01');await page.locator('#dash-to').fill('2000-12-31');await click('#dashboard-filter .btn-primary');assert.match(await page.locator('.dashboard-stats .stat').filter({hasText:'Recebido'}).textContent(),/0,00/);await click('#dash-clear');
  await page.screenshot({path:path.join(temp,'dashboard.png'),fullPage:true});
  // Real XLSX backup bytes, not a JSON or a download-only autosave.
  const downloadEvent=page.waitForEvent('download');await click('#export');const download=await downloadEvent;await download.saveAs(path.join(temp,'backup.xlsx'));assert.equal((await fs.readFile(path.join(temp,'backup.xlsx'))).subarray(0,2).toString(),'PK');
  await page.reload();assert.equal(await page.locator('#app-view').isVisible(),false);assert.equal(await page.locator('#content').textContent(),'');await click('#open-excel');await login('wrong-password');await page.waitForFunction(()=>document.querySelector('#auth-notice').textContent.includes('inválidos'));assert.equal(await page.locator('#app-view').isVisible(),false);await login();await page.locator('#app-view').waitFor({state:'visible'});assert.equal((await read()).faturas[0].Status,'Paga');
  // A revoked write permission rolls back the edit and keeps the form open.
  await go('prospects');await click('#new-record');await fill('nome','Não deve gravar');await page.evaluate(()=>window.testDenied=true);await submit();await page.locator('#modal-error').waitFor();assert.match(await page.locator('#modal-error').textContent(),/Permissão/);assert.equal((await read()).prospects.length,1);
  // Retrying after permission is restored must commit once, without duplicates.
  await page.evaluate(()=>window.testDenied=false);await submit();await closed();assert.equal((await read()).prospects.length,2);
  // A write stream failure must also leave the disk and UI state unchanged.
  await click('#new-record');await fill('nome','Falha de disco');await page.evaluate(()=>window.testWriteFail=true);await submit();await page.locator('#modal-error').waitFor();assert.equal((await read()).prospects.length,2);await page.evaluate(()=>window.testWriteFail=false);await click('#editor .btn-close');await closed();
  await external("wb.getWorksheet('prospects').getCell('C2').value='Alteração externa';");await click('#new-record');await fill('nome','Conflito');await submit();await page.locator('#modal-error').waitFor();assert.match(await page.locator('#modal-error').textContent(),/alterado fora/);assert.equal((await read()).prospects.length,2);assert.equal((await read()).prospects[0].Empresa,'Alteração externa');await click('#editor .btn-close');await closed();await click('#logout');
  // Disabled accounts and malformed workbooks cannot bypass authentication.
  await external("wb.getWorksheet('usuarios').getCell('F2').value='Não';");await click('#open-excel');await page.waitForFunction(()=>document.querySelector('#auth-notice').textContent.includes('Nenhum usuário ativo'));assert.equal(await page.locator('#app-view').isVisible(),false);
  await external("wb.getWorksheet('usuarios').getCell('F2').value='Sim';wb.getWorksheet('faturas').getCell('B2').value='missing-proposal';");await click('#open-excel');await page.waitForFunction(()=>document.querySelector('#auth-notice').textContent.includes('Proposta aceita exige uma única fatura'));assert.equal(await page.locator('#app-view').isVisible(),false);
  // Support explicit Login/Senha cells, including case-insensitive logins.
  await external("wb.getWorksheet('faturas').getCell('B2').value=wb.getWorksheet('propostas').getCell('A2').value;wb.removeWorksheet(wb.getWorksheet('usuarios').id);const u=wb.addWorksheet('usuarios');u.addRow(['Login','Senha','Nome','Ativo']);u.addRow(['ANA','legacy-password','Ana','Sim']);");await click('#open-excel');await login('legacy-password');await page.locator('#app-view').waitFor({state:'visible'});
  // Old workbooks with no users can be explicitly initialized, preserving data.
  await click('#logout');await external("wb.removeWorksheet(wb.getWorksheet('usuarios').id);");await click('#open-excel');await page.locator('#setup-fields').waitFor({state:'visible'});await page.locator('#login-name').fill('ana');await page.locator('#login-password').fill('test-password-123');await page.locator('#login-confirm').fill('test-password-123');await click('#login-submit');await page.locator('#app-view').waitFor({state:'visible'});assert.equal((await read()).prospects.length,2);assert.ok((await read()).Anotacoes);
  await go('dashboard');await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(temp,'mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);assert.equal(await page.evaluate(()=>localStorage.getItem('orbita.crm.v1')),null);
  console.log('PASS: native XLSX writes, hashed setup, login gate, invalid/disabled credentials, legacy credentials, legacy workbook migration, full sales flow, dashboard values/filters, reload, backup, permission/disk failures, external conflicts, preserved extra sheets, mobile, offline.');console.log('Artifacts:',temp);console.log('Native file handles in OPFS; picker UI substituted. '+(routed?'Local files intercepted because managed Chromium blocks file://.':'file:// mode.'));
 }catch(e){console.error('UI:',await page.locator('#notice').textContent(),await page.locator('#auth-notice').textContent());await page.screenshot({path:path.join(temp,'failure.png'),fullPage:true});console.error('Artifacts:',temp);throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
