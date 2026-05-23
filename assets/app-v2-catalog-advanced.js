(function(){
  function e(id){return document.getElementById(id)}
  function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
  function h(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
  function st(){try{return window.eval('state')}catch(x){return null}}
  var current=null;
  function mode(item){return item&&item.settings&&item.settings.calc_ui?item.settings.calc_ui:((item&&item.unit)==='м²'?'area':'fixed')}
  function css(){
    if(e('catalogAdvancedCss'))return;
    var s=document.createElement('style');
    s.id='catalogAdvancedCss';
    s.textContent='.catalog-advanced-box{display:none;margin-top:10px;padding:10px;border:1px dashed var(--line);border-radius:12px;background:#fff}.catalog-advanced-box.show{display:block}.catalog-advanced-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.catalog-advanced-grid label{font-size:12px;font-weight:800;color:#374151}.catalog-advanced-grid input,.catalog-advanced-grid select{margin-top:4px}.catalog-advanced-hint{margin-top:8px;color:var(--muted);font-size:12px;line-height:1.4}@media(max-width:900px){.catalog-advanced-grid{grid-template-columns:1fr}}';
    document.head.appendChild(s);
  }
  function after(ref){var box=e('catalogAdvancedBox');if(box)return box;var area=e('catalogAreaBox')||ref;box=document.createElement('div');box.id='catalogAdvancedBox';box.className='catalog-advanced-box';box.innerHTML='<div id="catalogAdvancedInner"></div><div id="catalogAdvancedHint" class="catalog-advanced-hint"></div>';area.insertAdjacentElement('afterend',box);return box}
  async function getItem(){
    var sel=e('catalogItem');
    if(!sel||!sel.value||!window.db)return null;
    var r=await window.db.from('leader_catalog').select('id,name,unit,item_type,category,contractor_price,default_client_price,min_client_price,markup_percent,calculation_mode,settings').eq('id',sel.value).maybeSingle();
    if(r.error)return null;
    return r.data||null;
  }
  function opt(arr,val){return (arr||[]).map(function(x){return '<option '+(x===val?'selected':'')+'>'+h(x)+'</option>'}).join('')}
  function render(item){
    css();
    var box=after(e('catalogAreaBox')||e('catalogCalcBox'));
    var inner=e('catalogAdvancedInner'),hint=e('catalogAdvancedHint');
    if(!item){box.classList.remove('show');inner.innerHTML='';return}
    var m=mode(item),s=item.settings||{};
    current=item;
    if(m==='area'||m==='fixed'){box.classList.remove('show');inner.innerHTML='';return}
    box.classList.add('show');
    if(m==='sign_piece'){
      inner.innerHTML='<div class="catalog-advanced-grid"><label>'+h(s.length_label||'Длина, м')+'<input id="advLength" type="number" min="0" step="0.01" placeholder="0.3"></label><label>'+h(s.width_label||'Ширина, м')+'<input id="advWidth" type="number" min="0" step="0.01" placeholder="0.2"></label><label>'+h(s.material_label||'Материал')+'<select id="advMaterial">'+opt(s.options||[],s.default_material)+'</select></label></div>';
      hint.textContent='Размер и материал будут добавлены в комментарий позиции и сохранены в заказе.';
    } else if(m==='mounting'){
      inner.innerHTML='<div class="catalog-advanced-grid"><label>'+h(s.height_label||'Высота, м')+'<input id="advHeight" type="number" min="0" step="0.1" placeholder="2.5"></label><label>'+h(s.complexity_label||'Сложность')+'<select id="advComplexity">'+opt(s.complexity_options||['простая','средняя','сложная'],'простая')+'</select></label><label>'+h(s.travel_label||'Выезд')+'<input id="advTravel" placeholder="город / район / адрес"></label></div>';
      hint.textContent='Данные помогут понять сложность монтажа и выезда.';
    } else if(m==='design'){
      inner.innerHTML='<div class="catalog-advanced-grid"><label>'+h(s.complexity_label||'Сложность')+'<select id="advComplexity">'+opt(s.complexity_options||['простой','средний','сложный'],'простой')+'</select></label><label>'+h(s.variants_label||'Вариантов')+'<input id="advVariants" type="number" min="1" step="1" value="1"></label><label>'+h(s.urgent_label||'Срочно')+'<select id="advUrgent"><option>нет</option><option>да</option></select></label></div>';
      hint.textContent='Параметры дизайна будут записаны в комментарий к позиции.';
    } else if(m==='placement'){
      inner.innerHTML='<div class="catalog-advanced-grid"><label>'+h(s.platform_label||'Площадка')+'<select id="advPlatform">'+opt(s.platform_options||['ВК','Telegram'],'ВК')+'</select></label><label>'+h(s.days_label||'Срок, дней')+'<input id="advDays" type="number" min="1" step="1" value="1"></label><label>'+h(s.content_label||'Контент')+'<select id="advContent"><option>не нужен</option><option>текст</option><option>текст + изображение</option></select></label></div>';
      hint.textContent='Площадка и срок будут сохранены для контроля размещения.';
    } else {box.classList.remove('show')}
    bindInputs();
  }
  function data(){
    var item=current||{};var m=mode(item);var d={calc_ui:m};
    if(m==='sign_piece'){d.length=n(e('advLength')&&e('advLength').value);d.width=n(e('advWidth')&&e('advWidth').value);d.material=e('advMaterial')&&e('advMaterial').value||''}
    if(m==='mounting'){d.height=n(e('advHeight')&&e('advHeight').value);d.complexity=e('advComplexity')&&e('advComplexity').value||'';d.travel=e('advTravel')&&e('advTravel').value||''}
    if(m==='design'){d.complexity=e('advComplexity')&&e('advComplexity').value||'';d.variants=n(e('advVariants')&&e('advVariants').value)||1;d.urgent=e('advUrgent')&&e('advUrgent').value||'нет'}
    if(m==='placement'){d.platform=e('advPlatform')&&e('advPlatform').value||'';d.days=n(e('advDays')&&e('advDays').value)||1;d.content=e('advContent')&&e('advContent').value||''}
    return d;
  }
  function appendComment(){
    if(!current)return;
    var m=mode(current),d=data(),parts=[];
    if(m==='sign_piece')parts.push('Размер: '+(d.length||'—')+' × '+(d.width||'—')+' м','Материал: '+(d.material||'—'));
    if(m==='mounting')parts.push('Высота: '+(d.height||'—')+' м','Сложность: '+(d.complexity||'—'),'Выезд: '+(d.travel||'—'));
    if(m==='design')parts.push('Сложность: '+(d.complexity||'—'),'Вариантов: '+d.variants,'Срочно: '+d.urgent);
    if(m==='placement')parts.push('Площадка: '+(d.platform||'—'),'Срок: '+d.days+' дн.','Контент: '+d.content);
    var c=e('itemComment');
    if(c&&parts.length){var base=(c.value||'').split(' Доп. параметры:')[0];c.value=base+' Доп. параметры: '+parts.join(', ')+'.'}
  }
  function bindInputs(){['advLength','advWidth','advMaterial','advHeight','advComplexity','advTravel','advVariants','advUrgent','advPlatform','advDays','advContent'].forEach(function(id){var x=e(id);if(x&&!x.dataset.adv){x.dataset.adv='1';x.addEventListener('input',appendComment);x.addEventListener('change',appendComment)}});appendComment()}
  function watch(){var sel=e('catalogItem');if(!sel||sel.dataset.advWatch)return;sel.dataset.advWatch='1';sel.addEventListener('change',function(){setTimeout(function(){getItem().then(render)},120)});}
  function saveToLastRow(){var s=st();if(!s||!Array.isArray(s.rows)||!s.rows.length||!current)return;var row=s.rows[s.rows.length-1];row.data=Object.assign({},row.data||{},data());try{if(window.LeaderV2CalcEditor&&window.LeaderV2CalcEditor.render)window.LeaderV2CalcEditor.render()}catch(x){}}
  function bindAdd(){var b=e('addItemBtn');if(!b||b.dataset.advAdd)return;b.dataset.advAdd='1';b.addEventListener('click',function(){setTimeout(saveToLastRow,220)},true)}
  function boot(){css();watch();bindAdd();var sel=e('catalogItem');if(sel&&sel.value)getItem().then(render)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,1300)});else setTimeout(boot,1000);
  document.addEventListener('click',function(ev){if(ev.target&&ev.target.dataset&&ev.target.dataset.page==='calc')setTimeout(boot,500)},true);
})();
