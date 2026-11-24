import {marca} from './marca.js';
const paths = {
  inicio: 'M3 10 12 3l9 7v10h-6v-6H9v6H3Z',
  qr: 'M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M7 7h3v3H7zm7 0h3v3h-3zm-7 7h3v3H7zm7 0h3v3h-3z',
  lista: 'm3 7 2 2 4-5m3 3h9M3 16l2 2 4-5m3 3h9',
  padron: 'M4 4h15v16H4zM2 8h4m-4 8h4m3-1q3-4 6 0m-2-6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 1 1 3 0',
  agenda: 'M3 6h18v15H3zm0 5h18M7 3v5m10-5v5',
  horas: 'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0m-9-5v5l4 2',
  cuenta: 'M16 8a4 4 0 1 1-8 0 4 4 0 1 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
  gafete: 'M3 5h18v14H3zm4 5h3m-3 4h4m3-4h4m-4 4h4',
  mas: 'M3 6h18M3 12h18M3 18h18',
  flecha: 'M5 12h14m-6-6 6 6-6 6'
};

export function icon(id) {
  return '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[id]+'"/></svg>';
}

export function navigation(pages, current, admin) {
  const primary = admin ? ['inicio','qr','lista','padron'] : ['inicio','gafete','horas','agenda'];
  const short = {inicio:'Inicio',qr:'Escanear',lista:'Lista',padron:'Jóvenes',gafete:'Gafete',horas:'Horas',agenda:'Agenda'};
  const button = (id,label) => '<button type="button" data-page="'+id+'" '+(current===id?'aria-current="page"':'')+'>'+icon(id)+'<span>'+label+'</span></button>';
  const rest = Object.keys(pages).filter(id=>!primary.includes(id));
  const desktop = '<nav class="rail" aria-label="Navegación principal"><div class="rail-brand"><img src="./'+(marca?marca.archivo+'.webp':'insignia.svg')+'" alt=""><strong>Jóvenes que<br>unen al barrio</strong></div>'+Object.entries(pages).map(([id,label])=>button(id,label)).join('')+'</nav>';
  const mobile = '<nav class="dock" aria-label="Navegación móvil">'+primary.map(id=>button(id,short[id])).join('')+'<details class="nav-more" '+(!primary.includes(current)?'data-active':'')+'><summary>'+icon('mas')+'Más</summary><div>'+rest.map(id=>button(id,pages[id])).join('')+'</div></details></nav>';
  return desktop+mobile;
}
