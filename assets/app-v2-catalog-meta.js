(function(){
  function e(id){return document.getElementById(id)}
  function num(v){var x=Number(v);return Number.isFinite(x)?x:0}
  function st(){try{return window.eval('state')}catch(x){return null}}
  async function findCatalog(id){
    if(!id||!window.db)return null;
    var r=await window.db.from('leader_catalog').select('id,category,name,unit,item_type,markup_percent,min_client_price,default_client_price,calculation_mode,settings').eq('id',id).maybeSingle();
    if(r.error)return null;
    return r.data||null;
  }
  function areaPayload(item){
    var l=num(e('catalogLength')&&e('catalogLength').value);
    var w=num(e('catalogWidth')&&e('catalogWidth').value);
    var p=num(e('catalogPieces')&&e('catalogPieces').value)||1;
    var q=num(e('itemQty')&&e('itemQty').value)||1;
    var mode=item&&item.settings&&item.settings.calc_ui?item.settings.calc_ui:((item&&item.unit)==='м²'?'area':'fixed');
    var data={calc_ui:mode,catalog_name:item?item.name:null,catalog_unit:item?item.unit:null};
    if(mode==='area'){
      data.length=l;
      data.width=w;
      data.pieces=p;
      data.area=q;
    }
    return data;
  }
  async function apply(id,beforeCount){
    var item=await findCatalog(id);
    if(!item)return;
    var s=st();
    if(!s||!Array.isArray(s.rows)||!s.rows.length)return;
    var row=s.rows[s.rows.length-1];
    if(beforeCount!=null&&s.rows.length<=beforeCount)return;
    row.catalog_id=item.id;
    row.category=item.category;
    row.item_type=item.item_type;
    row.calculation_mode=item.calculation_mode;
    row.min_client_price=item.min_client_price;
    row.default_client_price=item.default_client_price;
    row.markup_percent=item.markup_percent;
    row.data=Object.assign({},row.data||{},areaPayload(item));
    try{if(window.LeaderV2CalcEditor&&window.LeaderV2CalcEditor.render)window.LeaderV2CalcEditor.render()}catch(x){}
  }
  function bind(){
    var b=e('addItemBtn');
    if(!b||b.dataset.catalogMeta)return;
    b.dataset.catalogMeta='1';
    b.addEventListener('click',function(){
      var sel=e('catalogItem');
      var id=sel&&sel.value;
      if(!id)return;
      var s=st();
      var count=s&&Array.isArray(s.rows)?s.rows.length:null;
      setTimeout(function(){apply(id,count)},180);
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(bind,1200)});else setTimeout(bind,800);
  document.addEventListener('click',function(ev){if(ev.target&&ev.target.dataset&&ev.target.dataset.page==='calc')setTimeout(bind,400)},true);
})();
