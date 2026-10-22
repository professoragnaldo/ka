/* Workbook-backed persistence. No network, server or credential cache. */
'use strict';
window.OrbitaExcel = class OrbitaExcel {
  constructor(schemas, validate) {this.schemas=schemas;this.validate=validate;this.handle=null;this.bytes=null;this.signature=null;this.user=null;this.needsSetup=false;this.newFile=false;this.saving=false;}
  static fileTypes=[{description:'Planilha Excel do CRM',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}];
  static supported(){return !!(window.showOpenFilePicker&&window.showSaveFilePicker&&crypto.subtle);}
  async digest(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
  async readFile(){const file=await this.handle.getFile();if(!/\.xlsx$/i.test(file.name)||file.size>10*1024*1024)throw Error('Selecione um .xlsx com até 10 MB.');return new Uint8Array(await file.arrayBuffer());}
  async workbook(bytes=this.bytes){const wb=new ExcelJS.Workbook();if(bytes?.length)await wb.xlsx.load(bytes);return wb;}
  readData(wb){const data={};let count=0;
    for(const [type,fields] of Object.entries(this.schemas)){
      const sheet=wb.getWorksheet(type);if(!sheet)throw Error('Aba obrigatória ausente: '+type+'. Use uma planilha exportada pelo Órbita ou crie uma nova.');
      const columns=new Map();sheet.getRow(1).eachCell((cell,index)=>{if(typeof cell.value!=='string'||columns.has(cell.value))throw Error(type+': cabeçalho inválido ou duplicado.');columns.set(cell.value,index);});
      for(const [,header]of fields)if(!columns.has(header))throw Error(type+': coluna ausente: '+header);
      // Unknown columns would be lost when regenerating CRM sheets: reject instead.
      for(const header of columns.keys())if(!fields.some(([,h])=>h===header))throw Error(type+': coluna não reconhecida: '+header+'. Preserve os dados extras em outra aba.');
      data[type]=[];sheet.eachRow((row,index)=>{if(index===1)return;const r={};let any=false;
        for(const [key,header] of fields){let value=row.getCell(columns.get(header)).value;if(value!==null&&value!==undefined&&value!=='')any=true;
          if(value instanceof Date)value=value.toISOString().slice(0,10);
          if(value!==null&&typeof value==='object')throw Error(type+': use valores simples, sem fórmulas ou links.');
          r[key]=key==='valor'?(typeof value==='number'?value:NaN):value==null?'':String(value).trim();
        }
        if(any){data[type].push(r);if(++count>10000)throw Error('Limite de 10.000 registros por planilha.');}
      });
    }return this.validate(data);
  }
  readUsers(wb){const sheet=wb.getWorksheet('usuarios');if(!sheet)return null;
    const headers=new Map();sheet.getRow(1).eachCell((c,i)=>{const h=String(c.value??'').trim().toLowerCase();if(headers.has(h))throw Error('usuarios: cabeçalho duplicado.');headers.set(h,i);});
    if(!headers.has('login')||(!headers.has('senha')&&!headers.has('senhahash')))throw Error('A aba usuarios precisa de Login e Senha ou SenhaHash.');
    const users=[],seen=new Set();sheet.eachRow((row,n)=>{if(n===1)return;const read=(h)=>{const v=headers.has(h)?row.getCell(headers.get(h)).value:null;if(v!==null&&typeof v==='object')throw Error('usuarios: use apenas células de texto simples.');return v==null?'':String(v);};
      const login=read('login').trim();if(!login){if(row.values.some(v=>v!==null&&v!==undefined&&v!==''))throw Error('usuarios: linha sem Login.');return;}
      if(seen.has(login.toLowerCase()))throw Error('usuarios: Login duplicado.');seen.add(login.toLowerCase());
      const active=read('ativo').trim().toLowerCase();if(active&&!['sim','não','nao','true','false','1','0'].includes(active))throw Error('usuarios: Ativo deve ser Sim ou Não.');
      const u={login,nome:read('nome').trim()||login,senha:read('senha'),hash:read('senhahash'),salt:read('salt'),iterations:Number(read('iteracoes')||210000),active:!['não','nao','false','0'].includes(active)};
      if(u.hash&&(!/^[0-9a-f]{64}$/i.test(u.hash)||!/^[0-9a-f]{32}$/i.test(u.salt)||!Number.isInteger(u.iterations)||u.iterations<100000||u.iterations>1000000))throw Error('usuarios: configuração de hash inválida.');
      if(!u.hash&&!u.senha)throw Error('usuarios: senha ausente.');users.push(u);if(users.length>1000)throw Error('Limite de 1.000 usuários.');
    });
    if(!users.some(u=>u.active))throw Error('Nenhum usuário ativo na aba usuarios. Ajuste a planilha no Excel.');return users;
  }
  async open(handle){this.handle=handle;this.user=null;this.newFile=false;this.bytes=await this.readFile();if(!this.bytes.length)throw Error('O arquivo está vazio. Use Criar Excel para uma base nova.');this.signature=await this.digest(this.bytes);const wb=await this.workbook();this.readData(wb);this.needsSetup=this.readUsers(wb)===null;}
  async prepareNew(handle){this.handle=handle;this.user=null;this.newFile=true;this.bytes=await this.readFile();if(this.bytes.length)throw Error('Este arquivo já possui conteúdo. Para preservá-lo, use Abrir Excel ou escolha outro nome.');this.signature=await this.digest(this.bytes);this.needsSetup=true;}
  async hash(password,salt,iterations=210000){const saltBytes=Uint8Array.from(salt.match(/../g),s=>parseInt(s,16));const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return Array.from(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltBytes,iterations,hash:'SHA-256'},key,256)),b=>b.toString(16).padStart(2,'0')).join('');}
  writeData(wb,data){
    if(Object.values(data).reduce((n,rows)=>n+rows.length,0)>10000)throw Error('Limite de 10.000 registros por planilha.');
    for(const [name,fields]of Object.entries(this.schemas)){
      const prior=wb.getWorksheet(name);if(prior)wb.removeWorksheet(prior.id);
      const sheet=wb.addWorksheet(name);sheet.columns=fields.map(([key,header])=>({key,header,width:key==='id'||key.endsWith('Id')?45:key==='notas'?45:24}));
      data[name].forEach(r=>sheet.addRow(r));sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:'A1',to:{row:1,column:fields.length}};
      sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF285C4D'}};
      const col=fields.findIndex(([key])=>key==='valor');if(col>=0)sheet.getColumn(col+1).numFmt='"R$" #,##0.00';
    }
  }
  async writeBytes(bytes){
    if(bytes.length>10*1024*1024)throw Error('A planilha excederia o limite de 10 MB.');
    if(await this.handle.queryPermission({mode:'readwrite'})!=='granted')throw Error('Permissão de gravação revogada. Saia e abra o Excel novamente, autorizando a edição.');
    if(await this.digest(await this.readFile())!==this.signature)throw Error('O Excel foi alterado fora desta sessão. Esta alteração não foi salva. Saia e reabra o arquivo para carregar a versão atual.');
    let stream;
    try{stream=await this.handle.createWritable({mode:'exclusive'});
      if(await this.digest(await this.readFile())!==this.signature)throw Error('O arquivo mudou enquanto a gravação era iniciada. Reabra a planilha.');
      await stream.write(bytes);await stream.close();
    }catch(e){if(stream)try{await stream.abort();}catch{}throw e;}
    this.bytes=new Uint8Array(bytes);this.signature=await this.digest(bytes);
  }
  async setup(login,password,name,data){if(!this.needsSetup)throw Error('Esta planilha já possui usuários.');if(!login.trim()||password.length<8)throw Error('Informe um login e uma senha de pelo menos 8 caracteres.');
    const wb=await this.workbook();if(wb.getWorksheet('usuarios'))throw Error('Usuários já cadastrados. Reabra a planilha.');
    if(this.newFile)this.writeData(wb,data);else this.readData(wb);
    const salt=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');const hash=await this.hash(password,salt);
    const users=wb.addWorksheet('usuarios');users.addRow(['Login','Nome','SenhaHash','Salt','Iteracoes','Ativo']);users.addRow([login.trim(),name.trim()||login.trim(),hash,salt,210000,'Sim']);users.getRow(1).font={bold:true};users.columns.forEach(c=>c.width=25);
    await this.writeBytes(new Uint8Array(await wb.xlsx.writeBuffer()));this.needsSetup=false;this.newFile=false;
  }
  async authenticate(login,password){
    // Re-read to honor account changes made since opening the login page.
    const bytes=await this.readFile();const wb=await this.workbook(bytes);const users=this.readUsers(wb);if(!users)throw Error('Planilha sem aba usuarios. Reabra para configurar o primeiro acesso.');
    const u=users.find(r=>r.active&&r.login.toLowerCase()===login.trim().toLowerCase());
    const valid=u&&(u.hash?(await this.hash(password,u.salt,u.iterations)).toLowerCase()===u.hash.toLowerCase():u.senha===password);
    if(!valid)throw Error('Login ou senha inválidos, ou usuário inativo.');
    const data=this.readData(wb);this.bytes=bytes;this.signature=await this.digest(bytes);this.user={login:u.login,nome:u.nome};return data;
  }
  async save(data){if(!this.user)throw Error('Entre com seu login antes de gravar.');if(this.saving)throw Error('Aguarde a gravação anterior.');this.saving=true;
    try{this.validate(data);const wb=await this.workbook();this.writeData(wb,data);await this.writeBytes(new Uint8Array(await wb.xlsx.writeBuffer()));}finally{this.saving=false;}
  }
  logout(){this.user=null;this.handle=null;this.bytes=null;this.signature=null;this.needsSetup=false;}
};
