/* AMPHX_ETIQUETAS_WORD_2026: salida A4 .docx y reserva segura del código en Supabase. */
export function iniciarEtiquetasAmphx({db,getProductos,recargar,estado,onCodigoGenerado}){
 const clave='amp_etiquetas_word_v1';
 let lista=[];
 try{
  const guardada=JSON.parse(localStorage.getItem(clave)||'[]');
  if(Array.isArray(guardada))lista=guardada.filter(x=>x&&Number.isSafeInteger(Number(x.id))&&typeof x.codigo==='string'&&Number.isInteger(x.cantidad)&&x.cantidad>0).slice(0,500);
 }catch(_){}
 const guardar=()=>{try{localStorage.setItem(clave,JSON.stringify(lista));}catch(_){}};
 let cargaBarras=null,cargaWord=null;
 function cargarScript(urls,ok){
  if(ok())return Promise.resolve();
  return (async()=>{
   let ultimo;
   for(const src of urls){
    try{
     await new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=src;script.async=true;
      const timeout=setTimeout(()=>{script.remove();reject(new Error('Tiempo de espera agotado'));},12000);
      script.onload=()=>{clearTimeout(timeout);resolve();};
      script.onerror=()=>{clearTimeout(timeout);script.remove();reject(new Error('No se pudo cargar la biblioteca'));};
      document.head.append(script);
     });
     if(ok())return;
    }catch(e){ultimo=e;}
   }
   throw ultimo||new Error('No se pudo cargar la biblioteca');
  })();
 }
 function barras(){
  return cargaBarras||(cargaBarras=cargarScript([
   'https://cdn.jsdelivr.net/npm/jsbarcode@3.12.3/dist/JsBarcode.all.min.js',
   'https://unpkg.com/jsbarcode@3.12.3/dist/JsBarcode.all.min.js'
  ],()=>typeof window.JsBarcode==='function').catch(e=>{cargaBarras=null;throw e;}));
 }
 function word(){
  return cargaWord||(cargaWord=cargarScript([
   'https://cdn.jsdelivr.net/npm/docx@9.16.0/dist/index.iife.js',
   'https://unpkg.com/docx@9.16.0/dist/index.iife.js'
  ],()=>!!window.docx?.Document&&!!window.docx?.Packer).catch(e=>{cargaWord=null;throw e;}));
 }
 const formato=()=>document.getElementById('ampEtiquetaTamano')?.value==='40x20'?{ancho:40,alto:20,columnas:4}:{ancho:30,alto:15,columnas:6};
 const total=()=>lista.reduce((n,x)=>n+x.cantidad,0);
 function productosParaArchivo(){
  const productos=getProductos();
  if(!productos.length)throw new Error('Primero cargá COSTOS.');
  const mapa=new Map(productos.map(p=>[Number(p.id),p]));
  const etiquetas=[];
  for(const x of lista){
   const actual=mapa.get(Number(x.id));
   if(!actual||String(actual.codigo_barras||'').trim()!==x.codigo)
    throw new Error('La etiqueta de '+x.detalles+' ya no coincide con COSTOS. Actualizá y revisá la selección.');
   for(let n=0;n<x.cantidad;n++)etiquetas.push({codigo:x.codigo,detalles:actual.detalles});
  }
  if(!etiquetas.length)throw new Error('Primero agregá etiquetas desde las fichas.');
  if(etiquetas.length>500)throw new Error('Máximo 500 etiquetas por archivo.');
  return etiquetas;
 }
 function renderLista(){
  const cont=document.getElementById('ampEtiquetaLista'),numero=document.getElementById('ampEtiquetaCantidad');
  if(!cont||!numero)return;
  cont.replaceChildren();
  numero.textContent=total()+' etiqueta'+(total()===1?'':'s')+' en espera';
  for(const x of lista){
   const row=document.createElement('div');row.className='amp-etiqueta-item';
   const nombre=document.createElement('span');nombre.textContent=x.detalles+' · '+x.codigo;
   const menos=document.createElement('button');menos.type='button';menos.textContent='−';menos.title='Quitar una copia';
   const cantidad=document.createElement('strong');cantidad.textContent='×'+x.cantidad;
   const mas=document.createElement('button');mas.type='button';mas.textContent='+';mas.title='Añadir otra copia';
   const quitar=document.createElement('button');quitar.type='button';quitar.textContent='✕';quitar.title='Quitar producto de esta hoja';
   menos.onclick=()=>{x.cantidad--;if(x.cantidad<1)lista=lista.filter(z=>z!==x);guardar();renderLista();};
   mas.onclick=()=>{if(total()>=500)return estado('Máximo 500 etiquetas por archivo.',true);x.cantidad++;guardar();renderLista();};
   quitar.onclick=()=>{lista=lista.filter(z=>z!==x);guardar();renderLista();};
   row.append(nombre,menos,cantidad,mas,quitar);cont.append(row);
  }
  for(const id of ['ampDescargarEtiquetasWord','ampVistaEtiquetasImpresion','ampVaciarEtiquetas']){
   const btn=document.getElementById(id);if(btn)btn.disabled=total()===0;
  }
 }
 function agregar(p){
  const codigo=String(p.codigo_barras||'').trim();
  if(!codigo){estado('Este producto no tiene código. Primero pulsá GENERAR CÓDIGO.',true);return;}
  if(total()>=500){estado('La hoja alcanzó el máximo de 500 etiquetas.',true);return;}
  let x=lista.find(x=>Number(x.id)===Number(p.id)&&x.codigo===codigo);
  if(x)x.cantidad++;else lista.push({id:p.id,codigo,detalles:String(p.detalles||''),cantidad:1});
  guardar();renderLista();
  estado('Etiqueta '+codigo+' agregada a Word. No se imprimió nada.');
 }
 async function generar(p,btn){
  const codigoExistente=String(p.codigo_barras||'').trim();
  if(codigoExistente){
   const usar=confirm('ESTE PRODUCTO YA TIENE UN CÓDIGO DE BARRAS:\n\n'+codigoExistente+'\n\nNo se generará otro código ni se reemplazará el existente.\n\n¿Querés añadir este código a Word para imprimir etiquetas?');
   if(usar)agregar(p);
   else estado('Código ya registrado: '+codigoExistente+'. No se modificó el producto.');
   return;
  }
  if(btn)btn.disabled=true;
  try{
   const {data,error}=await db.rpc('generar_codigo_interno_amphx',{p_producto_id:Number(p.id)});
   if(error)throw error;
   if(!/^AMPHX[0-9]{6}$/.test(String(data||'')))throw new Error('Supabase no confirmó un código AMPHX válido');
   p.codigo_barras=String(data);
   if(typeof onCodigoGenerado==='function')onCodigoGenerado(p,String(data));
   agregar(p);
   await recargar();
   estado('Código '+data+' registrado, agregado a Word y pendiente de imprimir.');
  }catch(e){estado('No se pudo generar el código: '+String(e?.message||e),true);}
  finally{if(btn&&btn.isConnected)btn.disabled=false;}
 }
 function botones(p){
  const row=document.createElement('div');row.className='amp-botones-etiquetas';
  const gen=document.createElement('button');gen.type='button';gen.className='alt amp-etiqueta-generar';
  gen.textContent='▥ GENERAR CÓDIGO';gen.title='Crear código AMPHX permanente para este producto';
  gen.disabled=false;gen.onclick=()=>generar(p,gen);
  const anadir=document.createElement('button');anadir.type='button';anadir.className='alt amp-etiqueta-word';
  anadir.textContent='▤ AÑADIR A WORD';anadir.title='Añadir etiqueta a la hoja Word sin imprimir';
  anadir.disabled=!String(p.codigo_barras||'').trim();anadir.onclick=()=>agregar(p);
  row.append(gen,anadir);return row;
 }
 function pngCodigo(codigo){
  const base=document.createElement('canvas');
  window.JsBarcode(base,codigo,{format:'CODE128',width:2.5,height:100,margin:10,displayValue:false,lineColor:'#000000',background:'#ffffff'});
  const out=document.createElement('canvas');out.width=base.width;out.height=base.height+36;
  const ctx=out.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(base,0,0);
  ctx.textAlign='center';ctx.fillStyle='#000';ctx.font='bold 24px Arial,sans-serif';
  ctx.fillText(codigo,out.width/2,out.height-9);
  return out.toDataURL('image/png');
 }
 async function descargarWord(){
  const boton=document.getElementById('ampDescargarEtiquetasWord');
  boton.disabled=true;boton.textContent='CREANDO WORD…';
  try{
   const etiquetas=productosParaArchivo(),t=formato();
   await Promise.all([barras(),word()]);
   const D=window.docx,mm=n=>Math.round(n*56.692913);
   const line={style:D.BorderStyle.SINGLE,size:2,color:'DFE5E9'},rows=[];
   for(let i=0;i<etiquetas.length;i+=t.columnas){
    const cells=[];
    for(let j=0;j<t.columnas;j++){
     const item=etiquetas[i+j],borders={top:line,bottom:line,left:line,right:line};
     const width={size:mm(t.ancho),type:D.WidthType.DXA};
     if(!item){
      cells.push(new D.TableCell({width,borders,margins:{top:0,bottom:0,left:0,right:0},children:[new D.Paragraph({text:''})]}));continue;
     }
     const uri=pngCodigo(item.codigo);
     const data=Uint8Array.from(atob(uri.split(',')[1]),c=>c.charCodeAt(0));
     const run=new D.ImageRun({type:'png',data,transformation:{width:Math.round((t.ancho-2)*96/25.4),height:Math.round((t.alto-2)*96/25.4)}});
     cells.push(new D.TableCell({width,borders,verticalAlign:D.VerticalAlign.CENTER,
      margins:{top:0,bottom:0,left:0,right:0},
      children:[new D.Paragraph({alignment:D.AlignmentType.CENTER,spacing:{before:0,after:0},children:[run]})]}));
    }
    rows.push(new D.TableRow({cantSplit:true,height:{value:mm(t.alto),rule:D.HeightRule.EXACT},children:cells}));
   }
   const table=new D.Table({rows,columnWidths:Array(t.columnas).fill(mm(t.ancho)),
    width:{size:mm(t.ancho*t.columnas),type:D.WidthType.DXA},
    borders:{top:line,bottom:line,left:line,right:line,insideHorizontal:line,insideVertical:line}});
   const doc=new D.Document({sections:[{properties:{page:{size:{width:11906,height:16838},
    margin:{top:mm(12),bottom:mm(12),left:mm(12),right:mm(12)}}},children:[table]}]});
   const blob=await D.Packer.toBlob(doc);
   const link=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=link;a.download='AMPHX-ETIQUETAS-'+new Date().toISOString().slice(0,10)+'.docx';
   document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(link),60000);
   estado('Archivo Word con '+etiquetas.length+' etiquetas A4 descargado. Se imprimirá solo cuando lo ordenes desde Word.');
  }catch(e){estado('No se pudo crear el archivo Word: '+String(e?.message||e),true);}
  finally{boton.disabled=total()===0;boton.textContent='DESCARGAR WORD (.DOCX)';}
 }
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function vistaImpresion(){
  let etiquetas,t;
  try{etiquetas=productosParaArchivo();t=formato();}catch(e){estado(String(e.message||e),true);return;}
  const tab=window.open('','_blank');
  if(!tab){estado('El navegador bloqueó la pestaña. Podés descargar Word directamente.',true);return;}
  tab.document.write('<!doctype html><html><meta charset="utf-8"><body>Preparando vista de impresión…</body></html>');
  try{
   await barras();
   const labels=etiquetas.map(x=>'<div class="etiqueta"><img alt="'+esc(x.codigo)+'" src="'+pngCodigo(x.codigo)+'"></div>').join('');
   tab.document.open();
   tab.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>AMPHX · Etiquetas A4</title><style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0}.barra{background:#e5edf3;padding:10px}.barra button{padding:9px 14px}.hoja{display:grid;grid-template-columns:repeat('+t.columnas+','+t.ancho+'mm)}.etiqueta{width:'+t.ancho+'mm;height:'+t.alto+'mm;display:flex;align-items:center;justify-content:center;border:0.1mm solid #e0e4e8;break-inside:avoid}.etiqueta img{width:'+(t.ancho-2)+'mm;height:'+(t.alto-2)+'mm}@media print{.barra{display:none}}</style></head><body><div class="barra"><strong>AMPHX · '+etiquetas.length+' etiquetas</strong> <button onclick="print()">IMPRIMIR / GUARDAR PDF</button> Seleccioná tamaño A4 y escala 100%.</div><div class="hoja">'+labels+'</div></body></html>');
   tab.document.close();
   estado('Vista de etiquetas abierta. Todavía no se imprimió nada.');
  }catch(e){tab.document.body.textContent='No se pudo mostrar la hoja: '+String(e?.message||e);estado('No se pudo abrir la vista: '+String(e?.message||e),true);}
 }
 function panel(){
  if(document.getElementById('ampPanelEtiquetas'))return;
  const css=document.createElement('style');css.textContent=
   '#ampPanelEtiquetas{margin:12px 0 16px;padding:14px;border:1px solid #5d8ba7;border-radius:13px;background:linear-gradient(125deg,#0e2538,#193d58);color:#fff;box-shadow:0 8px 24px #0003}'+
   '#ampPanelEtiquetas .barra-etiquetas{display:flex;flex-wrap:wrap;align-items:center;gap:7px}'+
   '#ampPanelEtiquetas .nota-etiqueta{font-size:12px;color:#dbeaf2;margin:7px 0}'+
   '#ampPanelEtiquetas select,#ampPanelEtiquetas button{width:auto;max-width:100%;min-height:38px;font-size:12px;font-weight:750;padding:7px 10px;border-radius:8px}'+
   '#ampPanelEtiquetas select{background:#fff;color:#18364b;border:1px solid #789aad}'+
   '#ampPanelEtiquetas button{background:linear-gradient(135deg,#146b9f,#0b3558);color:#fff;border:1px solid #8fb7cc}'+
   '#ampPanelEtiquetas button:disabled{opacity:.45}'+
   '#ampEtiquetaLista{max-height:200px;overflow-y:auto;display:grid;gap:5px;margin-top:6px}'+
   '#ampEtiquetaLista .amp-etiqueta-item{display:flex;align-items:center;gap:6px;border-bottom:1px solid #7892a466;padding:4px 0}'+
   '#ampEtiquetaLista .amp-etiqueta-item span{flex:1;min-width:0;overflow-wrap:anywhere;font-size:12px}'+
   '#ampEtiquetaLista .amp-etiqueta-item button{min-width:31px;padding:5px 7px}'+
   '.amp-botones-etiquetas{display:flex;flex-wrap:wrap;gap:5px;width:100%;margin-top:6px}'+
   '.amp-botones-etiquetas button{flex:1 1 115px!important;width:auto!important;padding:8px 6px!important;font-size:11px!important;min-height:38px!important}'+
   '.amp-botones-etiquetas .amp-etiqueta-generar{background:#0c7598!important;color:white!important}'+
   '.amp-botones-etiquetas .amp-etiqueta-word{background:#1b4b7a!important;color:white!important}'+
   '.amp-botones-etiquetas button:disabled{opacity:.36}'+
   '#listado .sheet-card .sheet-actions>.sheet-tools>.amp-botones-etiquetas{grid-column:1/-1!important;grid-row:2!important;justify-self:stretch!important;display:flex!important;flex-flow:row wrap!important;gap:6px!important;width:100%!important;max-width:100%!important;min-width:0!important;padding:8px 0 2px!important;border-top:1px solid #d8e4ec!important;margin-top:3px!important}'+
   '#listado .sheet-card .sheet-actions>.sheet-tools>.amp-botones-etiquetas>button{flex:1 1 115px!important;max-width:none!important;width:auto!important;height:auto!important;min-height:40px!important;aspect-ratio:auto!important;white-space:normal!important;padding:8px 6px!important;font-size:11px!important;line-height:1.2!important}'+
   '#ampFichaCodigoInternoControles{grid-column:1/-1}';
  document.head.append(css);
  const section=document.createElement('section');section.id='ampPanelEtiquetas';
  section.innerHTML='<strong>▥ HOJA DE CÓDIGOS DE BARRAS PARA WORD</strong><p class="nota-etiqueta">Generá cada código desde su ficha: se agrega aquí, sin imprimir. Elegí copias y descargá el Word cuando quieras.</p><div class="barra-etiquetas"><strong id="ampEtiquetaCantidad">0 etiquetas en espera</strong><label for="ampEtiquetaTamano">Tamaño:</label><select id="ampEtiquetaTamano"><option value="30x15">Pequeña 30 × 15 mm</option><option value="40x20">Mediana 40 × 20 mm</option></select><button id="ampDescargarEtiquetasWord" type="button">DESCARGAR WORD (.DOCX)</button><button id="ampVistaEtiquetasImpresion" type="button">VER HOJA / IMPRIMIR</button><button id="ampVaciarEtiquetas" type="button">VACIAR</button></div><div id="ampEtiquetaLista"></div>';
  const antes=document.querySelector('#listado .listado-con-indice-costos');
  if(antes)antes.before(section);else document.getElementById('listado').append(section);
  document.getElementById('ampDescargarEtiquetasWord').onclick=descargarWord;
  document.getElementById('ampVistaEtiquetasImpresion').onclick=vistaImpresion;
  document.getElementById('ampVaciarEtiquetas').onclick=()=>{
   if(!confirm('¿Vaciar la hoja? Los códigos registrados permanecerán en Supabase.'))return;
   lista=[];guardar();renderLista();
  };
  renderLista();
 }
 panel();
 return {botones,agregar,generar,actualizarLista:renderLista};
}
