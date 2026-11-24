const marcas={
  mujer:{archivo:'immujer',nombre:'IMMUJER',principal:'#9c101c',acento:'#f8ae28',fondo:'#fff7e9'},
  'atencion-ciudadana':{archivo:'atencion-ciudadana',nombre:'Atención Ciudadana',principal:'#a41b42',acento:'#ef2a57',fondo:'#fff2ec'}
};
const sede=new URLSearchParams(location.search).get('dependencia');
export const marca=Object.hasOwn(marcas,sede)?marcas[sede]:null;
if(marca){
  const body=document.body;
  body.dataset.marca=sede;
  body.style.setProperty('--marca',marca.principal);
  body.style.setProperty('--acento',marca.acento);
  body.style.setProperty('--suave',marca.fondo);
  const logo=document.querySelector('header img[src="./imju.webp"]');
  if(logo){logo.src='./'+marca.archivo+'.webp';logo.alt=marca.nombre}
  const tema=document.querySelector('meta[name="theme-color"]');
  if(tema)tema.content=marca.principal;
}
