(function(){
  function el(id){return document.getElementById(id)}
  function n(v){v=String(v||'').replace(',','.').replace(/\s+/g,'');var x=parseFloat(v);return isNaN(x)?0:x}
  function rub(v){v=parseFloat(v||0)||0;return Math.round(v).toLocaleString('ru-RU')+' ₽'}
  function toast(s){var t=el('toast'); if(!t){console.log(s);return} t.textContent=s;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2200)}
  function setVal(id,v){if(el(id)){el(id).value=v;el(id).dispatchEvent(new Event('input',{bubbles:true}))}}
  function clickText(txt){var buttons=[].slice.call(document.querySelectorAll('button'));var b=buttons.find(function(x){return (x.textContent||'').trim()===txt}); if(b) b.click();}
  function currentTotals(){
    return {
      total: el('sumTotal') ? el('sumTotal').textContent : '0 ₽',
      cost: el('sumCost') ? el('sumCost').textContent : '0 ₽',
      debt: el('sumDebt') ? el('sumDebt').textContent : '0 ₽',
      profit: el('sumProfit') ? el('sumProfit').textContent : '0 ₽'
    };
  }
  function addQuickBox(){
    var calc=document.getElementById('calc'); if(!calc || document.getElementById('quickToolsBox')) return;
    var box=document.createElement('div'); box.id='quickToolsBox'; box.className='qt-card no-print';
    box.innerHTML='<div class="qt-title">Быстрые инструменты</div><div class="qt-grid"><div style="grid-column:span 2"><label>Ширина</label><input id="qtW" class="qt-input" placeholder="200"></div><div style="grid-column:span 2"><label>Высота</label><input id="qtH" class="qt-input" placeholder="100"></div><div style="grid-column:span 2"><label>Единицы</label><select id="qtUnit" class="qt-input"><option value="cm">см</option><option value="mm">мм</option><option value="m">м</option></select></div><div style="grid-column:span 2"><label>Количество</label><input id="qtQty" class="qt-input" value="1"></div><div style="grid-column:span 4"><label>&nbsp;</label><button id="qtApplySize" class="primary">Подставить размер</button></div></div><div class="qt-sep"></div><div class="qt-row"><span class="qt-status">Шаблоны:</span><button class="qt-chip" data-template="banner2x1">Баннер 2×1</button><button class="qt-chip" data-template="banner3x1">Баннер 3×1</button><button class="qt-chip" data-template="perfo1x1">Перфоплёнка 1×1</button><button class="qt-chip" data-template="pvc30x20">Табличка 30×20</button><button class="qt-chip" data-template="worktime">Режим работы</button><button class="qt-chip" data-template="design">Дизайн</button><button class="qt-chip" data-template="mount">Монтаж</button></div>';
    calc.insertBefore(box, calc.firstChild);
    document.getElementById('qtApplySize').onclick=applyQuickSize;
    box.querySelectorAll('[data-template]').forEach(function(btn){btn.onclick=function(){applyTemplate(btn.dataset.template)}});
  }
  function applyQuickSize(){
    var w=n(el('qtW').value), h=n(el('qtH').value), q=n(el('qtQty').value||1), u=el('qtUnit').value;
    if(u==='cm'){w=w/100;h=h/100}else if(u==='mm'){w=w/1000;h=h/1000}
    if(w>0) setVal('w', String(w).replace('.',','));
    if(h>0) setVal('h', String(h).replace('.',','));
    if(q>0) setVal('qty', q);
    toast('Размер подставлен');
  }
  function selectItemByText(text){
    var sel=el('itm'); if(!sel) return false;
    for(var i=0;i<sel.options.length;i++) if((sel.options[i].text||'').toLowerCase().includes(text.toLowerCase())){sel.selectedIndex=i;sel.dispatchEvent(new Event('change',{bubbles:true}));return true}
    return false;
  }
  function selectCategoryContaining(text){
    var sel=el('cat'); if(!sel) return false;
    for(var i=0;i<sel.options.length;i++) if((sel.options[i].text||'').toLowerCase().includes(text.toLowerCase())){sel.selectedIndex=i;sel.dispatchEvent(new Event('change',{bubbles:true}));return true}
    return false;
  }
  function applyTemplate(name){
    if(name==='banner2x1'){selectCategoryContaining('Широкоформат');selectItemByText('Баннер');setVal('w','2');setVal('h','1');setVal('qty','1'); if(el('hem'))el('hem').checked=true;if(el('luv'))el('luv').checked=true;toast('Шаблон баннера 2×1 подставлен');return}
    if(name==='banner3x1'){selectCategoryContaining('Широкоформат');selectItemByText('Баннер');setVal('w','3');setVal('h','1');setVal('qty','1'); if(el('hem'))el('hem').checked=true;if(el('luv'))el('luv').checked=true;toast('Шаблон баннера 3×1 подставлен');return}
    if(name==='perfo1x1'){selectCategoryContaining('Широкоформат');selectItemByText('Перфор');setVal('w','1');setVal('h','1');setVal('qty','1');toast('Шаблон перфоплёнки подставлен');return}
    if(name==='pvc30x20'){selectCategoryContaining('Пленка');selectItemByText('ПВХ');setVal('w','0,3');setVal('h','0,2');setVal('qty','1');toast('Шаблон таблички подставлен');return}
    if(name==='worktime'){selectCategoryContaining('Пленка');selectItemByText('Самоклеящаяся');setVal('w','0,3');setVal('h','0,4');setVal('qty','1');toast('Шаблон режима работы подставлен');return}
    if(name==='design'){if(window.manual) window.manual('Дизайн');return}
    if(name==='mount'){if(window.manual) window.manual('Монтаж');return}
  }
  function addBottomPanel(){
    var calc=document.getElementById('calc'); if(!calc || document.getElementById('qtBottom')) return;
    var p=document.createElement('div');p.id='qtBottom';p.className='qt-bottom no-print';
    p.innerHTML='<div><div class="qt-muted">Итого клиенту</div><b id="qtTotal">0 ₽</b><div class="qt-muted">Маржа: <span id="qtProfit">0 ₽</span> • Остаток: <span id="qtDebt">0 ₽</span></div></div><div class="qt-actions"><button onclick="printDoc(\'client\')">КП</button><button onclick="copyMax()">MAX</button><button onclick="saveProject()">Сохранить</button><button onclick="createOrder()">Заказ</button></div>';
    calc.appendChild(p);
  }
  function updateBottom(){var t=currentTotals(); if(el('qtTotal')) el('qtTotal').textContent=t.total; if(el('qtProfit')) el('qtProfit').textContent=t.profit; if(el('qtDebt')) el('qtDebt').textContent=t.debt;}
  function wrapRenderRows(){var old=window.renderRows;if(typeof old==='function'&&!old._qt){var f=function(){old();updateBottom()};f._qt=true;window.renderRows=f}}
  document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){addQuickBox();addBottomPanel();wrapRenderRows();updateBottom()},500);setInterval(updateBottom,1200)});
})();
