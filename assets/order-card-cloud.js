// Cloud helpers for order card. This file is intentionally small and separate.
(function(){
  function getDb(){ return window.db || null; }
  function read(key, fallback){ try { return JSON.parse(localStorage.getItem('lc_'+key)) || fallback; } catch(e){ return fallback; } }
  function write(key, value){ localStorage.setItem('lc_'+key, JSON.stringify(value)); }
  function orderKey(order, index){ return String(order.cloud_id || order.local_id || index); }
  async function isSignedIn(){
    const db = getDb();
    if (!db) return false;
    const { data } = await db.auth.getUser();
    return !!(data && data.user);
  }

  window.LeaderCloudOrderCard = {
    async syncLocalOrderExtras(order, index){
      const db = getDb();
      if (!db || !order || !order.cloud_id || !(await isSignedIn())) return;
      const key = orderKey(order, index);
      const payments = read('order_payments_' + key, []);
      const comments = read('order_comments_' + key, []);
      const history = read('order_history_' + key, []);

      const sent = read('order_card_sent_' + key, { payments: 0, comments: 0, history: 0 });

      const newPayments = payments.slice(sent.payments || 0).reverse();
      for (const p of newPayments) {
        await db.from('leader_payments').insert({
          order_id: order.cloud_id,
          amount: Number(p.amount || 0),
          method: p.method || '',
          payment_status: p.status || 'Проведён',
          comment: p.comment || ''
        });
      }

      const newComments = comments.slice(sent.comments || 0).reverse();
      for (const c of newComments) {
        await db.from('leader_order_comments').insert({
          order_id: order.cloud_id,
          comment_type: c.type || 'internal',
          body: c.body || ''
        });
      }

      const newHistory = history.slice(sent.history || 0).reverse();
      for (const h of newHistory) {
        await db.rpc('leader_add_status_history', {
          p_order_id: order.cloud_id,
          p_old_status: h.old_status || '',
          p_new_status: h.new_status || '',
          p_comment: h.comment || ''
        });
      }

      write('order_card_sent_' + key, {
        payments: payments.length,
        comments: comments.length,
        history: history.length
      });
    },

    async syncAllOrderExtras(){
      const orders = read('orders', []);
      for (let i = 0; i < orders.length; i++) {
        await this.syncLocalOrderExtras(orders[i], i);
      }
      return true;
    }
  };
})();
