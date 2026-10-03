(function(){
  // UI navigation only: domain renderers and storage remain in their modules.
  function create({registry,document,history,location,eventTarget,state,entries,onFrame=()=>{},onError=()=>{},extraSectionIds=[],extraNavIds=[],clearBodyClasses=[]}){
    let revision=0,bound=false;
    const views=registry.enabledViews();
    const sectionIds=new Set([...views.map(view=>view.sectionId),...Object.values(entries).map(entry=>entry.sectionId),...extraSectionIds].filter(Boolean));
    const navIds=new Set([...views.map(view=>view.navId),...extraNavIds].filter(Boolean));
    const bodyClasses=new Set([...Object.values(entries).map(entry=>entry.bodyClass),...clearBodyClasses].filter(Boolean));
    const by=id=>document.getElementById(id);

    function definition(id){
      if(id==='presell')id='copy';
      const view=registry.definition(id);
      if(view?.enabled)return view;
      const entry=entries[id];
      if(entry?.sectionId)return {id,activeView:id,sectionId:entry.sectionId,navId:null,title:entry.title||'',subtitle:''};
      return registry.definition(registry.DEFAULT_VIEW_ID);
    }

    function applyFrame(view,entry){
      state.activeView=view.activeView;
      if(!entry.preserveCampaign)state.activeCampaign=null;
      for(const id of sectionIds)by(id)?.classList.toggle('hidden',id!==view.sectionId);
      for(const id of navIds)by(id)?.classList.toggle('active',id===view.navId);
      for(const name of bodyClasses)document.body.classList.toggle(name,name===entry.bodyClass);
      if(by('pageTitle'))by('pageTitle').textContent=view.title;
      if(by('pageSubtitle'))by('pageSubtitle').textContent=view.subtitle;
      document.title=view.title;
      const group=entry.group||by(view.navId)?.closest('[data-sidebar-group]')?.dataset.sidebarGroup;
      by('registerSale')?.classList.toggle('hidden',view.id!=='totals');
      by('correctCampaignDate')?.classList.toggle('hidden',group!=='operation'&&group!=='products');
      if(group)document.defaultView?.HubSidebar?.setOpenGroup(group);
    }

    function open(id,{source='programmatic',updateUrl=true}={}){
      const view=definition(id),entry=entries[view.id];
      if(!entry)throw new Error(`Tela sem adaptador de navegação: ${view.id}`);
      const currentRevision=++revision;
      const isCurrent=()=>revision===currentRevision;
      if(source==='menu')entry.onMenu?.();
      applyFrame(view,entry);
      if(updateUrl)history.replaceState(null,'',registry.urlFor(view.id,location.pathname));
      onFrame(view);
      const finish=()=>{
        if(!isCurrent())return;
        // The campaign diary and Meu Tempo provide their own contextual title.
        if(entry.contextualTitle)document.title=by('pageTitle')?.textContent||view.title;
        onFrame(view);
      };
      const result=entry.render?.({isCurrent});
      if(result&&typeof result.then==='function')return result.then(value=>{finish();return value});
      finish();
      return result;
    }

    function refresh(){
      const current=views.find(view=>view.activeView===state.activeView);
      return open(current?.id||(state.activeView==='presell'?'copy':state.activeView));
    }

    function openRoute(){return open(registry.resolveRoute(location.pathname+location.search).id)}
    function safelyOpen(id,options){
      try{const result=open(id,options);if(result?.catch)result.catch(onError)}catch(error){onError(error)}
    }
    function onPopState(){safelyOpen(registry.resolveRoute(location.pathname+location.search).id,{source:'history'})}

    function bind(){
      if(bound)return;
      bound=true;
      for(const view of views){
        if(view.id==='presell')continue;
        const button=by(view.navId);
        if(button)button.onclick=()=>safelyOpen(view.id,{source:'menu'});
      }
      eventTarget?.addEventListener('popstate',onPopState);
    }

    function dispose(){
      ++revision;
      if(!bound)return;
      bound=false;
      for(const id of navIds)if(by(id))by(id).onclick=null;
      eventTarget?.removeEventListener('popstate',onPopState);
    }

    return Object.freeze({open,refresh,openRoute,bind,dispose});
  }
  window.PanelNavigation=Object.freeze({create});
})();
