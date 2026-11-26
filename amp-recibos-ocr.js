// AMPHX: lectura local del comprobante y sugerencias conservadoras, sin enviar la imagen a terceros.
// Requiere internet para descargar el lector OCR y su modelo, pero analiza el archivo en el navegador.
const STOP=new Set(['DE','DEL','LA','EL','LOS','LAS','AL','A','EN','POR','PARA','CON','SIN','UN','UNA','UND','UNID','UNIDAD','UNIDADES','CJA','CJ','CAJA','PAQ','PAQUETE','PACK','PK','PZA','PZ','UNI','COD','CODIGO','ART','ARTICULO','TOTAL','SUBTOTAL','IVA','BS','BOLIVIANOS','CANT','CANTIDAD','PUNIT','PU','PRECIO','NETO','DESCUENTO','FECHA','GR','G','KG','ML','L','LT']);
function normalizar(s){
 return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
 .replace(/(\d+(?:[.,]\d+)?)\s*(GRAMOS?|GRS?|GR|G)\b/g,'$1G')
 .replace(/(\d+(?:[.,]\d+)?)\s*(MILILITROS?|ML)\b/g,'$1ML')
 .replace(/(\d+(?:[.,]\d+)?)\s*(KILOGRAMOS?|KGS?|KG)\b/g,'$1KG')
 .replace(/(\d+(?:[.,]\d+)?)\s*(LITROS?|LTS?|LT|L)\b/g,'$1L')
 .replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function tokenizar(s){
 return [...new Set(normalizar(s).split(' ').filter(x=>x.length>1&&!STOP.has(x)&&!/^\d+$/.test(x)))];
}
function similar(a,b){
 if(a===b)return 1;
 if(a.length<5||b.length<5||Math.abs(a.length-b.length)>1||/\d/.test(a)||/\d/.test(b))return 0;
 let i=0,j=0,err=0;
 while(i<a.length&&j<b.length){
  if(a[i]===b[j]){i++;j++;continue}
  if(++err>1)return 0;
  if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++}
 }
 return err+(a.length-i)+(b.length-j)<=1?0.74:0;
}
function puntuar(palabras,laLinea,frecuencias,total){
 if(!palabras.length||!laLinea.length)return null;
 let peso=0,coincide=0,exactas=0,distintas=0,coincidenciasFuertes=0,unicas=0;
 for(const palabra of palabras){
  const frec=frecuencias.get(palabra)||total;
  const rareza=Math.max(0,Math.log2((total+1)/(frec+1)));
  const w=1+rareza*.24;
  peso+=w;
  let mejor=0;
  for(const token of laLinea){const s=similar(palabra,token);if(s>mejor)mejor=s;if(s===1)break}
  coincide+=mejor*w;
  if(mejor===1)exactas++;
  if(mejor>.7){distintas++;if(!/^\d+(G|KG|ML|L)$/.test(palabra))coincidenciasFuertes++;if(rareza>2)unicas++}
 }
 const tamanosP=palabras.filter(x=>/^\d+(G|KG|ML|L)$/.test(x));
 const tamanosLinea=laLinea.filter(x=>/^\d+(G|KG|ML|L)$/.test(x));
 const conflicto=tamanosP.some(x=>tamanosLinea.some(y=>y!==x&&y.match(/[A-Z]+$/)?.[0]===x.match(/[A-Z]+$/)?.[0])&&!tamanosLinea.includes(x));
 let score=.83*(coincide/peso)+.17*(exactas/palabras.length);
 if(conflicto)score*=.6;
 if(tamanosP.length&&!tamanosP.every(t=>tamanosLinea.includes(t)))score*=.87;
 return {score,exactas,distintas,coincidenciasFuertes,unicas,conflicto};
}
export function compararRecibo(texto,catalogo){
 const lineas=String(texto||'').split(/\r?\n/).map(s=>s.trim()).filter(s=>s.length>=3).slice(0,280);
 const lista=(catalogo||[]).map(p=>({...p,palabras:tokenizar(p.detalles)}));
 const frecuencias=new Map();
 for(const p of lista)for(const t of p.palabras)frecuencias.set(t,(frecuencias.get(t)||0)+1);
 const seguros=new Map(),revisar=new Map();
 for(const linea of lineas){
  const palabras=tokenizar(linea);
  if(palabras.length<2)continue;
  const candidatos=[];
  for(const p of lista){
   const dato=puntuar(p.palabras,palabras,frecuencias,lista.length);
   if(dato&&dato.score>=.49&&dato.distintas>=2)candidatos.push({producto_id:Number(p.id),nombre:p.detalles,linea,...dato});
  }
  candidatos.sort((a,b)=>b.score-a.score);
  const primero=candidatos[0],segundo=candidatos[1];
  if(!primero)continue;
  const diferencia=primero.score-(segundo?.score||0);
  const claro=primero.score>=.89&&primero.exactas>=2&&primero.coincidenciasFuertes>=1&&!primero.conflicto&&diferencia>=.14;
  const candidato={...primero,diferencia};
  const destino=claro?seguros:revisar;
  const anterior=destino.get(primero.producto_id);
  if(!anterior||anterior.score<candidato.score)destino.set(primero.producto_id,candidato);
 }
 for(const id of seguros.keys())revisar.delete(id);
 return {seguros:[...seguros.values()].sort((a,b)=>b.score-a.score),revisar:[...revisar.values()].filter(c=>c.score>=.61&&c.diferencia>=.04).sort((a,b)=>b.score-a.score).slice(0,15),lineas:lineas.length};
}
let cargas=new Map();
async function cargarScript(src,globalName){
 if(window[globalName])return window[globalName];
 if(!cargas.has(src))cargas.set(src,new Promise((resolve,reject)=>{
  const tag=document.createElement('script');tag.src=src;tag.async=true;tag.crossOrigin='anonymous';
  tag.onload=()=>window[globalName]?resolve(window[globalName]):reject(Error('No se inició '+globalName));
  tag.onerror=()=>reject(Error('No se pudo descargar '+globalName+'. Revisá tu conexión.'));
  document.head.append(tag);
 }));
 return cargas.get(src);
}
async function crearOCR(onProgress){
 const t=await cargarScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js','Tesseract');
 return t.createWorker(['spa','eng'],1,{logger:x=>{if(x.status==='recognizing text')onProgress?.('Leyendo texto… '+Math.round((x.progress||0)*100)+'%');else if(x.status)onProgress?.('Preparando reconocimiento…')}});
}
async function imagenCanvas(file){
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('La imagen no se pudo abrir.'));img.src=url});
  const escala=Math.min(1,2500/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*escala));canvas.height=Math.max(1,Math.round(img.naturalHeight*escala));canvas.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0,canvas.width,canvas.height);
  return canvas;
 }finally{URL.revokeObjectURL(url)}
}
async function pdfATexto(file,onProgress){
 const pdfjs=await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','pdfjsLib');
 pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
 const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
 const cuantos=Math.min(pdf.numPages,4);
 let extraidos=[],pendientes=[];
 for(let i=1;i<=cuantos;i++){
  onProgress?.('Leyendo página '+i+' de '+cuantos+'…');
  const page=await pdf.getPage(i);
  const raw=await page.getTextContent();
  const partes=(raw.items||[]).filter(item=>item.str?.trim()).map(item=>({texto:item.str,x:item.transform?.[4]||0,y:item.transform?.[5]||0})).sort((a,b)=>b.y-a.y||a.x-b.x);
  const lineas=[];
  for(const item of partes){
   let linea=lineas.find(l=>Math.abs(l.y-item.y)<3);
   if(!linea){linea={y:item.y,partes:[]};lineas.push(linea)}
   linea.partes.push(item);
  }
  const texto=lineas.sort((a,b)=>b.y-a.y).map(l=>l.partes.sort((a,b)=>a.x-b.x).map(p=>p.texto).join(' ')).join('\n');
  if(texto.trim().length>35)extraidos.push(texto);
  else pendientes.push(page);
 }
 if(pendientes.length){
  const worker=await crearOCR(onProgress);
  try{
   for(let i=0;i<pendientes.length;i++){
    onProgress?.('Reconociendo página escaneada '+(i+1)+' de '+pendientes.length+'…');
    const page=pendientes[i],viewport=page.getViewport({scale:1.75});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    const res=await worker.recognize(canvas);
    extraidos.push(res.data?.text||'');
   }
  }finally{await worker.terminate()}
 }
 return {texto:extraidos.join('\n'),avisos:pdf.numPages>cuantos?'El PDF tiene más de 4 páginas: solo se analizaron las primeras cuatro.':''};
}
export async function leerArchivoRecibo(file,onProgress){
 if(!file)throw Error('Seleccioná una foto o PDF.');
 if(file.type==='application/pdf')return pdfATexto(file,onProgress);
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Solo se admiten JPG, PNG, WEBP y PDF.');
 const worker=await crearOCR(onProgress);
 try{const canvas=await imagenCanvas(file);const res=await worker.recognize(canvas);return {texto:res.data?.text||'',avisos:''}}
 finally{await worker.terminate()}
}
