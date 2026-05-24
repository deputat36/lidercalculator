(function(){
  function e(id){return document.getElementById(id)}
  function h(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
  function money(v){return Math.round(n(v)).toLocaleString('ru-RU')+' ₽'}
  function dt(v){try{return v?new Date(v).toLocaleString('ru-RU'):'—'}catch(x){return v||'—'}}
  function d(v){try{return v?new Date(v).toLocaleDateString('ru-RU'):'—'}catch(x){return v||'—'}}
  function toast(t){try{if(typeof window.toast==='function')window.toast(t);else console.log(t)}catch(x){}}
  async function needLogin(){if(!window.db||!window.db.auth)throw new Error('Supabase ещё не готов');var q=await window.db.auth.getSession();if(!q.data||!q.data.session)throw new Error('Сначала войдите в CRM')}
  function css(){
    if(e('productionBriefCss'))return;
    var s=document.createElement('style');
    s.id='productionBriefCss';
    s.textContent='.production-brief-actions{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.production-brief-actions button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900;cursor:pointer}.production-brief-actions .primary{background:#111827;color:#fff}.production-brief-modal{position:fixed;inset:0;background:rgba(17,24,39,.55);z-index:95;display:flex;align-items:center;justify-content:center;padding:14px}.production-brief-modal.hidden{display:none}.production-brief-card{width:min(920px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.28)}.production-brief-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}.production-brief-head h2{margin:0}.production-brief-close{border:0;background:#f3f4f6;border-radius:999px;width:38px;height:38px;font-size:24px;cursor:pointer}.production-brief-text{white-space:pre-wrap;background:#f9fafb;border:1px solid var(--line);border-radius:14px;padding:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.5;overflow:auto}.production-brief-print{font-family:Arial,sans-serif;padding:24px}.production-brief-print h1{margin:0 0 12px}.production-brief-print pre{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px;line-height:1.45}@media print{body>*:not(.production-brief-print-root){display:none!important}.production-brief-print-root{display:block!important}}@media(max-width:560px){.production-brief-actions button{flex:1}}';
    document.head.appendChild(s);
  }
  async function fetchData(jobId){
    await needLogin();
    var jr=await window.db.from('leader_production_jobs').select('*').eq('id',jobId).single();
    if(jr.error)throw new Error(jr.error.message);
    var job=jr.data;
    var ir=await window.db.from('leader_production_job_items').select('*').eq('job_id',jobId).order('created_at',{ascending:true});
    var items=ir.error?[]:(ir.data||[]);
    var order=null;
    if(job.order_id){
      var or=await window.db.from('leader_orders').select('*').eq('id',job.order_id).single();
      if(!or.error)order=or.data;
    }
    return {job:job,items:items,order:order};
  }
  function line(label,value){value=value==null||value===''?'—':value;return label+': '+value}
  function buildText(data){
    var job=data.job||{}, order=data.order||{}, items=data.items||[];
    var number=order.order_number||String(job.order_id||job.id||'').slice(0,8);
    var lines=[];
    lines.push('ТЕХНИЧЕСКОЕ ЗАДАНИЕ В ПРОИЗВОДСТВО');
    lines.push('РА «Лидер»');
    lines.push('');
    lines.push(line('Заказ', number));
    lines.push(line('Название', job.title||order.project_name));
    lines.push(line('Клиент', order.client_name));
    lines.push(line('Телефон клиента', order.client_phone));
    lines.push(line('Подрядчик', job.contractor_name||order.contractor_name));
    lines.push(line('Срок готовности', job.deadline?dt(job.deadline):(order.deadline?d(order.deadline):'—')));
    lines.push(line('Приоритет', job.priority||order.priority));
    lines.push(line('Статус макета', job.layout_status||order.layout_status));
    lines.push(line('Ссылка на макет', order.layout_link));
    lines.push('');
    lines.push('СОСТАВ РАБОТ:');
    if(items.length){
      items.forEach(function(x,i){
        var size=(n(x.width)>0||n(x.height)>0)?(' | размер: '+(x.width||'—')+' × '+(x.height||'—')):'';
        var cost=' | подрядчику: '+money(n(x.contractor_price)*n(x.qty));
        lines.push((i+1)+'. '+(x.name||'Позиция')+' — '+(x.qty||1)+' '+(x.unit||'шт')+size+cost);
        if(x.comment)lines.push('   Комментарий: '+x.comment);
      });
    }else{
      lines.push('Позиции не указаны.');
    }
    lines.push('');
    lines.push(line('Сумма подрядчику', money(job.contractor_cost)));
    lines.push(line('Сумма клиенту', money(job.client_total)));
    lines.push('');
    lines.push('ТЕХНИЧЕСКИЕ КОММЕНТАРИИ:');
    lines.push(job.technical_task||order.production_comment||'—');
    lines.push('');
    lines.push('КОММЕНТАРИЙ ПОДРЯДЧИКУ:');
    lines.push(job.contractor_comment||order.public_comment||'—');
    lines.push('');
    lines.push('ВНУТРЕННИЙ КОММЕНТАРИЙ:');
    lines.push(job.internal_comment||order.internal_comment||'—');
    lines.push('');
    lines.push('После готовности сообщите, пожалуйста, стоимость, фактический срок и приложите фото результата.');
    return lines.join('\n');
  }
  async function copyText(text){
    if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(text);return true}
    var ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return true;
  }
  function ensureModal(){
    css();
    if(e('productionBriefModal'))return;
    document.body.insertAdjacentHTML('beforeend','<div id="productionBriefModal" class="production-brief-modal hidden"><div class="production-brief-card"><div class="production-brief-head"><div><h2>ТЗ подрядчику</h2><div class="production-meta">Проверьте текст перед отправкой.</div></div><button id="productionBriefClose" class="production-brief-close" type="button">×</button></div><div class="production-brief-actions"><button id="productionBriefCopy" class="primary" type="button">Скопировать</button><button id="productionBriefPrint" type="button">Печать</button><button id="productionBriefMax" type="button">Открыть MAX</button></div><pre id="productionBriefText" class="production-brief-text"></pre></div></div>');
    e('productionBriefClose').onclick=function(){e('productionBriefModal').classList.add('hidden')};
    e('productionBriefModal').addEventListener('click',function(ev){if(ev.target===e('productionBriefModal'))e('productionBriefModal').classList.add('hidden')});
  }
  function printText(text){
    var old=e('productionBriefPrintRoot');
    if(old)old.remove();
    var root=document.createElement('div');
    root.id='productionBriefPrintRoot';
    root.className='production-brief-print-root production-brief-print';
    root.style.display='none';
    root.innerHTML='<h1>Техническое задание</h1><pre>'+h(text)+'</pre>';
    document.body.appendChild(root);
    window.print();
    setTimeout(function(){root.remove()},1000);
  }
  async function showBrief(jobId){
    ensureModal();
    var modal=e('productionBriefModal');
    var out=e('productionBriefText');
    out.textContent='Формирую техническое задание...';
    modal.classList.remove('hidden');
    try{
      var data=await fetchData(jobId);
      var text=buildText(data);
      out.textContent=text;
      e('productionBriefCopy').onclick=function(){copyText(text).then(function(){toast('ТЗ скопировано')}).catch(function(err){alert(err.message||err)})};
      e('productionBriefPrint').onclick=function(){printText(text)};
      e('productionBriefMax').onclick=function(){copyText(text).catch(function(){});window.open('https://web.max.ru/','_blank','noopener');toast('ТЗ скопировано, MAX открыт')};
    }catch(err){
      out.textContent='Не удалось сформировать ТЗ: '+(err.message||err);
    }
  }
  function enhance(){
    css();
    document.querySelectorAll('[data-production-job]').forEach(function(card){
      var detail=card.querySelector('.production-detail');
      if(!detail||detail.dataset.briefReady)return;
      detail.dataset.briefReady='1';
      var actions=detail.querySelector('.production-actions');
      if(!actions)return;
      var copy=document.createElement('button');
      copy.type='button';
      copy.textContent='Скопировать ТЗ';
      copy.onclick=function(){showBrief(card.dataset.productionJob).then(function(){var b=e('productionBriefCopy');if(b)b.click()})};
      var preview=document.createElement('button');
      preview.type='button';
      preview.textContent='Показать ТЗ';
      preview.onclick=function(){showBrief(card.dataset.productionJob)};
      var print=document.createElement('button');
      print.type='button';
      print.textContent='Печать ТЗ';
      print.onclick=function(){showBrief(card.dataset.productionJob).then(function(){setTimeout(function(){var b=e('productionBriefPrint');if(b)b.click()},250)})};
      actions.appendChild(copy);
      actions.appendChild(preview);
      actions.appendChild(print);
    });
  }
  function observe(){
    var box=e('productionList');
    if(box&&!box.dataset.briefObserver){
      if(window.MutationObserver){var mo=new MutationObserver(function(){enhance()});mo.observe(box,{childList:true,subtree:true})}
      box.dataset.briefObserver='1';
    }
    enhance();
  }
  window.LeaderV2ProductionBrief={show:showBrief,enhance:enhance};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(observe,1400)});else setTimeout(observe,1000);
})();
