// Tiny, isolated DOM for view contract tests; never opens a browser database.
export function createRoot(){
  const nodes=new Map(),lists=new Map();
  function node(dataset={}){
    const classes=new Set(),attributes=new Map(),children=new Map();
    return {dataset,value:'',textContent:'',innerHTML:'',onclick:null,onchange:null,
      classList:{toggle(name,enabled){enabled?classes.add(name):classes.delete(name)},contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name)},
      setAttribute:(name,value)=>attributes.set(name,String(value)),getAttribute:name=>attributes.get(name)??null,
      querySelector(selector){if(!children.has(selector))children.set(selector,node());return children.get(selector)}
    };
  }
  function get(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)}
  const root={querySelector:get,querySelectorAll:selector=>lists.get(selector)||[]};
  return {root,get,setList:(selector,items)=>lists.set(selector,items.map(node)),nodes};
}

export const format={
  esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  num:(value,d=0)=>value==null||value===''?'—':Number(value).toFixed(d),
  money:value=>value==null||value===''?'—':'BRL '+Number(value).toFixed(2),
  pct:value=>value==null||!Number.isFinite(Number(value))?'':Number(value).toFixed(0)+'%',
  date:value=>value?value.split('-').reverse().join('/'):''
};
