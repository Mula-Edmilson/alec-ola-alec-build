  const alecNewsKind={new:'Nova funcionalidade',improved:'Melhoria',fixed:'Correcção',removed:'Removido'};
  function whatsNewPage(){
    const u=state.update||{},now=state.version;
    const installed=ALEC_RELEASE_HISTORY.filter(r=>r.version===now||r.date!==null);
    const selected=installed.find(r=>r.version===ui.alecNewsVersion)||installed.find(r=>r.version===now)||installed[0];
    const date=r=>r.date?new Date(r.date+'T12:00:00').toLocaleDateString('pt-PT',{day:'numeric',month:'short',year:'numeric'}):'Versão candidata';
    const busy=!!u.installing||!!u.checking||!!u.done;
    return [
      el('div',{className:'alec-news-head'},el('h2',{textContent:'Novidades'}),el('p',{textContent:'O que mudou no ALEC, versão a versão.'})),
      el('section',{className:'group alec-news-card'},el('h2',{textContent:'Actualizações'}),el('p',{textContent:'Versão instalada · '+now}),
        el('p',{role:'status',textContent:u.installing?'A instalar…':u.checking?'A verificar…':u.done?'Instalação concluída; a reiniciar.':u.available?'Nova versão '+u.available+' disponível.':u.result?.ok===false?'Não foi possível verificar. O histórico local continua disponível.':u.result?.ok?'Não existem novas actualizações.':'Verifica se existe uma nova versão.'}),
        el('div',{className:'row-btns'},btn(u.checking?'A verificar…':'Verificar actualizações',()=>act('update'),{disabled:busy,k:'alec-news-check'}),u.available?(u.signed&&u.feed&&!u.page?btn('Instalar e reiniciar',alecUpdateNow,{kind:'primary',disabled:busy||!!state.busy,k:'alec-news-install'}):btn('Consultar versão',()=>act('install_update'),{disabled:busy,k:'alec-news-release'})):null),
        u.available&&u.notes?el('details',{},el('summary',{textContent:'Notas da versão disponível'}),el('p',{className:'alec-news-notes',textContent:u.notes})):null,
        !u.signed?el('p',{textContent:'Instalação automática indisponível nesta compilação.'}):null),
      el('section',{className:'group alec-news-card'},el('h2',{textContent:'Histórico de versões'}),
        el('label',{className:'alec-form-field'},el('span',{textContent:'Seleccionar versão'}),el('select',{className:'alec-news-select','data-k':'alec-news-version','aria-label':'Versão do histórico',on:{change:e=>{ui.alecNewsVersion=e.target.value;render('alec-news-version');}}},installed.map(r=>el('option',{value:r.version,selected:r===selected,textContent:'v'+r.version+' · '+r.title+(r.version===now?' (instalada)':'')})))),
        selected?el('div',{className:'group'},el('h2',{textContent:selected.title}),el('div',{className:'alec-news-meta'},'v'+selected.version,' · '+date(selected),' · '+selected.items.length+' melhorias'),el('ul',{className:'alec-news-list','aria-label':'Melhorias da versão'},selected.items.map(it=>el('li',{className:'alec-news-item'},el('span',{className:'alec-news-kind',textContent:alecNewsKind[it.kind]||'Melhoria'}),el('h3',{textContent:it.title}),el('p',{textContent:it.text}))))):null)
    ];
  }
