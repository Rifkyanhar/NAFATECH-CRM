// =========================================================
// NAFA TECH CRM — dashboard.html logic
// =========================================================
const sb = window.supabase.createClient(window.NAFA_CONFIG.SUPABASE_URL, window.NAFA_CONFIG.SUPABASE_ANON_KEY);

let SERVICE_TYPES = [];
let LANDING_PAGES = [];
let SERVICE_TIERS = []; // semua tier, difilter per service saat dipakai

// >>> Sesuaikan kalau alamat website utama Anda berubah <<<
const SITE_BASE_URL = "https://rifkyanhar.github.io/Etalasedigital";
const FEEDBACK_MIN_HOURS = 72; // jam tunggu sebelum tombol "Kirim Link Feedback" aktif

// ---------- helpers ----------
function fmtDateTime(iso){
  if(!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}
function fmtDuration(startIso, endIso){
  if(!startIso || !endIso) return "-";
  const ms = new Date(endIso) - new Date(startIso);
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `${h}j ${m}m`;
}
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=> el.style.display = 'none', 2600);
}
function serviceName(id){ const s = SERVICE_TYPES.find(x=>x.id===id); return s ? s.name : '-'; }
function lpName(id){ const l = LANDING_PAGES.find(x=>x.id===id); return l ? l.name : '-'; }

// Rapikan nomor kontak pelanggan jadi format internasional (62xxxxxxxxxx)
// supaya bisa dipakai buka link wa.me. Kembalikan null kalau bukan nomor HP
// yang valid (misalnya kontaknya berupa alamat email).
function normalizePhone(raw){
  if(!raw) return null;
  let s = raw.trim().replace(/[^0-9+]/g, '');
  if(s.startsWith('+')) s = s.slice(1);
  if(s.startsWith('0')) s = '62' + s.slice(1);
  if(!/^62\d{8,13}$/.test(s)) return null;
  return s;
}

// Tombol/label "Kirim Link Feedback" untuk baris order yang sudah selesai.
// - Belum 72 jam -> tampilkan hitung mundur (info saja, tidak bisa diklik)
// - Sudah 72 jam & belum pernah dikirim -> tombol aktif
// - Sudah pernah dikirim -> badge "Feedback terkirim"
function feedbackButtonHTML(o){
  if(!o.completed_at) return '';
  if(o.feedback_requested_at){
    return `<span class="badge done" style="margin-left:6px; white-space:nowrap;">Feedback terkirim</span>`;
  }
  const hoursPassed = (Date.now() - new Date(o.completed_at).getTime()) / 3600000;
  if(hoursPassed < FEEDBACK_MIN_HOURS){
    const hoursLeft = Math.ceil(FEEDBACK_MIN_HOURS - hoursPassed);
    return `<span class="text-dim" style="font-size:.75rem; margin-left:6px; white-space:nowrap;">Feedback: ${hoursLeft}j lagi</span>`;
  }
  return `<button class="btn btn-ghost btn-sm" style="margin-left:6px;" onclick="sendFeedbackLink('${o.id}')">Kirim Link Feedback</button>`;
}

// ---------- auth guard ----------
async function checkAuth(){
  const { data } = await sb.auth.getSession();
  if(!data.session){ window.location.href = "index.html"; return false; }
  return true;
}
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.href = "index.html";
});

// ---------- tab navigation ----------
document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item[data-tab]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    ['antrian','selesai','pelanggan','aftersales','pengaturan'].forEach(t=>{
      document.getElementById('tab-'+t).classList.toggle('hidden', t !== btn.dataset.tab);
    });
    if(btn.dataset.tab === 'selesai') loadCompleted();
    if(btn.dataset.tab === 'pelanggan') loadPelanggan();
    if(btn.dataset.tab === 'aftersales') loadAfterSales();
    if(btn.dataset.tab === 'pengaturan') loadSettings();
  });
});

// ---------- load reference data (service types & LPs) ----------
async function loadReferenceData(){
  const [st, lp, tiers] = await Promise.all([
    sb.from('service_types').select('*').order('created_at'),
    sb.from('landing_pages').select('*').order('created_at'),
    sb.from('service_tiers').select('*').order('created_at')
  ]);
  SERVICE_TYPES = st.data || [];
  LANDING_PAGES = lp.data || [];
  SERVICE_TIERS = tiers.data || [];

  const fService = document.getElementById('f_service');
  fService.innerHTML = SERVICE_TYPES.filter(s=>s.active).map(s=>`<option value="${s.id}" data-hours="${s.default_hours}">${s.name}</option>`).join('');
  const fLp = document.getElementById('f_lp');
  fLp.innerHTML = LANDING_PAGES.filter(l=>l.active).map(l=>`<option value="${l.id}">${l.name}</option>`).join('');

  function refreshTierOptions(){
    const serviceId = fService.value;
    const tiers = SERVICE_TIERS.filter(t => t.service_type_id === serviceId && t.active);
    const tierWrap = document.getElementById('f_tier_wrap');
    const fTier = document.getElementById('f_tier');
    if(tiers.length > 0){
      tierWrap.style.display = '';
      fTier.innerHTML = '<option value="">(tanpa paket, pakai estimasi default)</option>' +
        tiers.map(t => `<option value="${t.id}" data-hours="${t.estimated_hours}">${t.tier_name} — ${fmtRupiah(t.price)}</option>`).join('');
    } else {
      tierWrap.style.display = 'none';
      fTier.innerHTML = '';
    }
  }

  fService.addEventListener('change', () => {
    const opt = fService.selectedOptions[0];
    if(opt) document.getElementById('f_hours').value = opt.dataset.hours;
    refreshTierOptions();
  });
  document.getElementById('f_tier').addEventListener('change', () => {
    const opt = document.getElementById('f_tier').selectedOptions[0];
    if(opt && opt.dataset.hours) document.getElementById('f_hours').value = opt.dataset.hours;
  });
  if(fService.selectedOptions[0]) document.getElementById('f_hours').value = fService.selectedOptions[0].dataset.hours;
  refreshTierOptions();
}

// ---------- ANTRIAN ----------
async function loadOrders(){
  const { data, error } = await sb.from('orders')
    .select('*')
    .in('status', ['waiting','in_progress'])
    .order('created_at', { ascending: true });
  if(error){ toast('Gagal memuat antrian: ' + error.message); return; }

  const current = data.find(o => o.status === 'in_progress');
  const waiting = data.filter(o => o.status === 'waiting');

  // current ticket
  const currentBox = document.getElementById('currentTicket');
  if(!current){
    currentBox.innerHTML = '<p class="text-dim">Tidak ada order yang sedang dikerjakan.</p>';
  } else {
    const deadline = new Date(new Date(current.started_at).getTime() + current.estimated_hours * 3600000);
    currentBox.innerHTML = `
      <div class="ticket current">
        <div class="ticket-number">#${current.queue_number}</div>
        <div class="ticket-body">
          <div class="title">${current.customer_name} — ${serviceName(current.service_type_id)}</div>
          <div class="meta">Sumber: ${lpName(current.landing_page_id)} · Kontak: ${current.contact || '-'}</div>
          <div class="meta">Mulai: ${fmtDateTime(current.started_at)} · Target selesai: ${fmtDateTime(deadline.toISOString())}</div>
          <div class="meta">Harga: ${fmtRupiah(current.price)} · Pembayaran: <span class="badge ${paymentBadgeClass(current.payment_status)}">${paymentLabel(current.payment_status)}</span></div>
        </div>
        <div class="ticket-actions">
          ${current.payment_status !== 'paid' ? `<button class="btn btn-ghost btn-sm" onclick="generateInvoice('${current.id}')">Buat tagihan</button>` : ''}
          <button class="btn btn-primary btn-sm" onclick="completeOrder('${current.id}')">Tandai selesai</button>
          <button class="btn btn-danger btn-sm" onclick="deleteOrder('${current.id}', '${current.queue_number}')">🗑 Hapus</button>
        </div>
      </div>`;
  }

  // waiting list
  document.getElementById('waitingCount').textContent = `(${waiting.length})`;
  const waitBox = document.getElementById('waitingList');
  if(waiting.length === 0){
    waitBox.innerHTML = '<p class="text-dim">Tidak ada order menunggu.</p>';
  } else {
    waitBox.innerHTML = waiting.map((o,idx) => `
      <div class="ticket">
        <div class="ticket-number">#${o.queue_number}</div>
        <div class="ticket-body">
          <div class="title">${o.customer_name} — ${serviceName(o.service_type_id)}</div>
          <div class="meta">Masuk: ${fmtDateTime(o.created_at)} · Sumber: ${lpName(o.landing_page_id)} · Estimasi: ${o.estimated_hours} jam</div>
        </div>
        <div class="ticket-actions">
          ${idx===0 && !current ? `<button class="btn btn-primary btn-sm" onclick="startOrder('${o.id}')">Mulai kerjakan</button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteOrder('${o.id}', '${o.queue_number}')">🗑 Hapus</button>
        </div>
      </div>`).join('');
  }
}

async function startOrder(id){
  const { error } = await sb.from('orders').update({ status:'in_progress', started_at: new Date().toISOString() }).eq('id', id);
  if(error){ toast('Gagal memulai order: ' + error.message); return; }
  toast('Order dimulai.');
  loadOrders();
}

async function completeOrder(id){
  const { error } = await sb.from('orders').update({ status:'done', completed_at: new Date().toISOString() }).eq('id', id);
  if(error){ toast('Gagal menyelesaikan order: ' + error.message); return; }
  toast('Order ditandai selesai. Melanjutkan ke antrian berikutnya...');
  await autoStartNext();
  loadOrders();
}

// Hapus order — dipakai untuk bersihkan data testing/salah input.
// Selalu minta konfirmasi dulu karena tindakan ini tidak bisa dibatalkan.
async function deleteOrder(id, queueNumber){
  const confirmed = window.confirm(`Yakin ingin menghapus order #${queueNumber}?\n\nTindakan ini TIDAK BISA dibatalkan — data order akan hilang permanen.`);
  if(!confirmed) return;
  const { error } = await sb.from('orders').delete().eq('id', id);
  if(error){ toast('Gagal menghapus order: ' + error.message); return; }
  toast(`Order #${queueNumber} berhasil dihapus.`);
  loadOrders();
  if(!document.getElementById('tab-selesai').classList.contains('hidden')) loadCompleted();
}
window.deleteOrder = deleteOrder;

async function autoStartNext(){
  const { data } = await sb.from('orders').select('*').eq('status','in_progress').limit(1);
  if(data && data.length > 0) return; // masih ada yang jalan
  const { data: nextUp } = await sb.from('orders').select('*').eq('status','waiting').order('created_at', { ascending:true }).limit(1);
  if(nextUp && nextUp.length > 0){
    await sb.from('orders').update({ status:'in_progress', started_at: new Date().toISOString() }).eq('id', nextUp[0].id);
  }
}

document.getElementById('addOrderBtn').addEventListener('click', async () => {
  const customer_name = document.getElementById('f_customer').value.trim();
  const contact = document.getElementById('f_contact').value.trim();
  const service_type_id = document.getElementById('f_service').value;
  const landing_page_id = document.getElementById('f_lp').value;
  const estimated_hours = Number(document.getElementById('f_hours').value) || 4;
  const tier_id = document.getElementById('f_tier').value || null;

  if(!customer_name || !service_type_id){ toast('Nama customer & jenis layanan wajib diisi.'); return; }

  const { error } = await sb.from('orders').insert({
    customer_name, contact, service_type_id, landing_page_id, estimated_hours, tier_id, status:'waiting'
  });
  if(error){ toast('Gagal menambah order: ' + error.message); return; }

  document.getElementById('f_customer').value = '';
  document.getElementById('f_contact').value = '';
  toast('Order ditambahkan ke antrian.');
  await autoStartNext();
  loadOrders();
});

// ---------- SELESAI ----------
async function loadCompleted(){
  const { data, error } = await sb.from('orders').select('*').eq('status','done').order('completed_at', { ascending:false });
  const tbody = document.getElementById('completedBody');
  if(error){ tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Gagal memuat: ${error.message}</td></tr>`; return; }
  if(!data || data.length === 0){ tbody.innerHTML = '<tr class="empty-row"><td colspan="10">Belum ada pekerjaan selesai.</td></tr>'; return; }
  tbody.innerHTML = data.map(o => `
    <tr>
      <td class="mono">#${o.queue_number}</td>
      <td>${o.customer_name}</td>
      <td>${serviceName(o.service_type_id)}</td>
      <td>${lpName(o.landing_page_id)}</td>
      <td>${fmtDateTime(o.created_at)}</td>
      <td>${fmtDateTime(o.completed_at)}</td>
      <td>${fmtDuration(o.started_at, o.completed_at)}</td>
      <td>${fmtRupiah(o.price)}</td>
      <td><span class="badge ${paymentBadgeClass(o.payment_status)}">${paymentLabel(o.payment_status)}</span></td>
      <td style="display:flex; flex-wrap:wrap; align-items:center; gap:4px;">
        ${o.payment_status !== 'paid' ? `<button class="btn btn-ghost btn-sm" onclick="generateInvoice('${o.id}')">Buat tagihan</button>` : ''}
        ${feedbackButtonHTML(o)}
        <button class="btn btn-danger btn-sm" onclick="deleteOrder('${o.id}', '${o.queue_number}')">🗑 Hapus</button>
      </td>
    </tr>`).join('');
}

function fmtRupiah(v){
  if(v === null || v === undefined || v === '') return '-';
  return 'Rp' + Number(v).toLocaleString('id-ID');
}
function paymentLabel(s){
  return { unpaid:'Belum ditagih', pending:'Menunggu bayar', paid:'Lunas', failed:'Gagal', expired:'Kedaluwarsa' }[s] || s;
}
function paymentBadgeClass(s){
  return { paid:'done', pending:'in_progress', unpaid:'waiting', failed:'open', expired:'open' }[s] || 'waiting';
}

// Panggil Edge Function 'create-payment' untuk membuat link pembayaran Snap Midtrans.
// Admin lalu mengirim link ini manual ke customer (WA/email).
async function generateInvoice(orderId){
  const order = (await sb.from('orders').select('price').eq('id', orderId).single()).data;
  const currentPrice = order ? order.price : 0;
  const input = window.prompt('Konfirmasi/ubah harga untuk tagihan ini (Rp):', currentPrice || 0);
  if(input === null) return; // dibatalkan admin
  const newPrice = Number(input);
  if(!newPrice || newPrice <= 0){ toast('Harga tidak valid.'); return; }
  if(newPrice !== currentPrice){
    await sb.from('orders').update({ price: newPrice }).eq('id', orderId);
  }

  toast('Membuat tagihan...');
  try{
    const res = await fetch(`${window.NAFA_CONFIG.SUPABASE_URL}/functions/v1/create-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.NAFA_CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': window.NAFA_CONFIG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ order_id: orderId })
    });
    const result = await res.json();
    if(!res.ok || result.error){ toast('Gagal membuat tagihan: ' + (result.error || res.statusText)); return; }

    await navigator.clipboard.writeText(result.redirect_url).catch(()=>{});
    toast('Link pembayaran dibuat & disalin ke clipboard. Kirim ke customer.');
    window.open(result.redirect_url, '_blank');
    loadCompleted();
  }catch(e){
    toast('Gagal menghubungi server pembayaran: ' + e.message);
  }
}
window.generateInvoice = generateInvoice;

// Kirim link halaman feedback.html ke WhatsApp pelanggan, lalu tandai order
// ini supaya tidak diminta feedback dua kali. Tombol pemanggilnya hanya
// muncul di UI setelah 72 jam sejak order ditandai selesai (lihat
// feedbackButtonHTML di atas).
async function sendFeedbackLink(orderId){
  const { data: order, error } = await sb.from('orders').select('*').eq('id', orderId).single();
  if(error || !order){ toast('Order tidak ditemukan.'); return; }

  const phone = normalizePhone(order.contact);
  if(!phone){
    toast('Nomor WhatsApp pelanggan tidak valid (mungkin berupa email). Kirim link feedback secara manual.');
    return;
  }

  const feedbackUrl = `${SITE_BASE_URL}/feedback.html?order=${order.queue_number}&layanan=${encodeURIComponent(serviceName(order.service_type_id))}`;
  const text = encodeURIComponent(
    `Halo ${order.customer_name}, terima kasih sudah menggunakan layanan NAFA Tech untuk order #${order.queue_number}. ` +
    `Kalau ada waktu, boleh bantu beri penilaian singkat di sini? ${feedbackUrl}`
  );
  window.open(`https://wa.me/${phone}?text=${text}`, '_blank');

  const { error: updErr } = await sb.from('orders').update({ feedback_requested_at: new Date().toISOString() }).eq('id', orderId);
  if(updErr){ toast('Link terkirim, tapi gagal menandai status di database: ' + updErr.message); }
  else{ toast('Link feedback dikirim & ditandai terkirim.'); }
  loadCompleted();
}
window.sendFeedbackLink = sendFeedbackLink;

// ---------- PELANGGAN & CHAT (lintas produk) ----------
const PRODUCT_LABELS = {
  'absensi-guru': 'Absensi Guru',
  'adi': 'ADI (Absensi Instansi)',
  'meja-pintar': 'Meja Pintar (QR Resto)'
};
function productLabel(key){ return PRODUCT_LABELS[key] || key; }

let CHAT_THREADS = [];      // hasil pengelompokan support_chats per (product_key, customer_id)
let ACTIVE_THREAD = null;   // {product_key, customer_id} yang sedang dibuka admin
let chatRealtimeChannel = null;

async function loadPelanggan(){
  await Promise.all([loadSubscriptions(), loadChatThreads()]);
}

// ---- Langganan ----
async function loadSubscriptions(){
  const { data, error } = await sb.from('product_subscriptions').select('*').order('created_at', { ascending:false });
  const tbody = document.getElementById('subsBody');
  if(error){ tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Gagal memuat: ${error.message}</td></tr>`; return; }
  document.getElementById('subsCount').textContent = `(${(data||[]).length})`;
  if(!data || data.length === 0){ tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Belum ada pelanggan berlangganan.</td></tr>'; return; }

  tbody.innerHTML = data.map(s => {
    let sisa = '-';
    if(s.active && s.subscribed_at){
      const expiry = new Date(new Date(s.subscribed_at).getTime() + 30*24*3600000);
      const days = Math.ceil((expiry.getTime() - Date.now())/86400000);
      sisa = fmtDateTime(expiry.toISOString()) + (days>=0 ? ` (${days}h lagi)` : ' (berakhir)');
    }
    return `
    <tr>
      <td>${productLabel(s.product_key)}</td>
      <td>${s.customer_name || s.customer_id}<div class="text-dim" style="font-size:.75rem">${s.customer_id}</div></td>
      <td>${s.subscribed_at ? fmtDateTime(s.subscribed_at) : '-'}</td>
      <td>${sisa}</td>
      <td><span class="badge ${s.active ? 'done' : 'waiting'}">${s.active ? 'Aktif' : 'Nonaktif'}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="toggleSubscription('${s.id}', ${s.active})">${s.active ? 'Nonaktifkan' : 'Aktifkan lagi'}</button></td>
    </tr>`;
  }).join('');
}

async function toggleSubscription(id, active){
  const patch = active ? { active:false } : { active:true, subscribed_at: new Date().toISOString() };
  const { error } = await sb.from('product_subscriptions').update(patch).eq('id', id);
  if(error){ toast('Gagal mengubah status: ' + error.message); return; }
  toast(active ? 'Langganan dinonaktifkan.' : 'Langganan diaktifkan ulang (masa 30 hari mulai dari sekarang).');
  loadSubscriptions();
}
window.toggleSubscription = toggleSubscription;

document.getElementById('activateSubBtn').addEventListener('click', async () => {
  const product_key = document.getElementById('ns_product').value;
  const customer_id = document.getElementById('ns_customer_id').value.trim();
  const customer_name = document.getElementById('ns_customer_name').value.trim();
  if(!customer_id){ toast('Isi ID Pelanggan terlebih dahulu.'); return; }

  const { error } = await sb.from('product_subscriptions')
    .upsert({ product_key, customer_id, customer_name, active:true, subscribed_at: new Date().toISOString() }, { onConflict: 'product_key,customer_id' });
  if(error){ toast('Gagal mengaktifkan langganan: ' + error.message); return; }

  document.getElementById('ns_customer_id').value = '';
  document.getElementById('ns_customer_name').value = '';
  toast('Langganan diaktifkan.');
  loadSubscriptions();
});

// ---- Chat ----
async function loadChatThreads(){
  const { data, error } = await sb.from('support_chats').select('*').order('created_at', { ascending:true });
  if(error){ document.getElementById('chatThreadList').innerHTML = `<div class="empty-row" style="padding:16px;">Gagal memuat: ${error.message}</div>`; return; }

  const map = {};
  (data||[]).forEach(m => {
    const key = m.product_key + '::' + m.customer_id;
    if(!map[key]) map[key] = { product_key:m.product_key, customer_id:m.customer_id, customer_name:m.customer_name, messages:[] };
    map[key].messages.push(m);
    if(m.customer_name) map[key].customer_name = m.customer_name;
  });
  CHAT_THREADS = Object.values(map).sort((a,b) => {
    const la = a.messages[a.messages.length-1].created_at;
    const lb = b.messages[b.messages.length-1].created_at;
    return new Date(lb) - new Date(la);
  });

  renderChatThreadList();
  updateChatNavBadge();
  setupChatRealtime();
}

function renderChatThreadList(){
  const list = document.getElementById('chatThreadList');
  const totalUnread = CHAT_THREADS.reduce((a,t)=> a + t.messages.filter(m=>m.sender==='customer' && !m.read_by_admin).length, 0);
  document.getElementById('chatCount').textContent = `(${CHAT_THREADS.length} percakapan${totalUnread ? ', '+totalUnread+' belum dibaca' : ''})`;

  if(CHAT_THREADS.length === 0){ list.innerHTML = '<div class="empty-row" style="padding:16px;">Belum ada chat masuk.</div>'; return; }

  list.innerHTML = CHAT_THREADS.map(t => {
    const last = t.messages[t.messages.length-1];
    const unread = t.messages.filter(m=>m.sender==='customer' && !m.read_by_admin).length;
    const isActive = ACTIVE_THREAD && ACTIVE_THREAD.product_key===t.product_key && ACTIVE_THREAD.customer_id===t.customer_id;
    return `
    <button class="chat-thread-item ${isActive?'active':''}" onclick="openChatThread('${t.product_key}','${t.customer_id}')">
      <div class="tname">${t.customer_name || t.customer_id} ${unread ? '<span class="tdot"></span>' : ''}</div>
      <div class="tproduct">${productLabel(t.product_key)}</div>
      <div class="tpreview">${last.sender==='admin'?'Anda: ':''}${last.message}</div>
    </button>`;
  }).join('');
}

async function openChatThread(product_key, customer_id){
  ACTIVE_THREAD = { product_key, customer_id };
  const thread = CHAT_THREADS.find(t => t.product_key===product_key && t.customer_id===customer_id);
  renderChatThreadList();
  renderChatDetail(thread);

  // Tandai pesan dari customer di thread ini sudah dibaca admin
  const unreadIds = thread.messages.filter(m=>m.sender==='customer' && !m.read_by_admin).map(m=>m.id);
  if(unreadIds.length){
    await sb.from('support_chats').update({ read_by_admin:true }).in('id', unreadIds);
    thread.messages.forEach(m=>{ if(unreadIds.includes(m.id)) m.read_by_admin = true; });
    renderChatThreadList();
    updateChatNavBadge();
  }
}
window.openChatThread = openChatThread;

function renderChatDetail(thread){
  const box = document.getElementById('chatThreadDetail');
  if(!thread){ box.innerHTML = '<p class="text-dim" style="padding:20px;">Pilih salah satu percakapan di kiri untuk membaca & membalas.</p>'; return; }

  box.innerHTML = `
    <div class="chat-detail-head">
      <div class="dname">${thread.customer_name || thread.customer_id}</div>
      <div class="dproduct">${productLabel(thread.product_key)}</div>
    </div>
    <div class="chat-detail-body" id="chatDetailBody">
      ${thread.messages.map(m => `
        <div class="chat-msg ${m.sender}">${m.message}<span class="mtime">${fmtDateTime(m.created_at)}</span></div>
      `).join('')}
    </div>
    <div class="chat-detail-input">
      <input type="text" id="chatReplyInput" placeholder="Balas pesan...">
      <button class="btn btn-primary btn-sm" id="chatReplyBtn">Kirim</button>
    </div>`;
  const bodyEl = document.getElementById('chatDetailBody');
  bodyEl.scrollTop = bodyEl.scrollHeight;
  document.getElementById('chatReplyBtn').addEventListener('click', sendAdminReply);
  document.getElementById('chatReplyInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendAdminReply(); });
}

async function sendAdminReply(){
  if(!ACTIVE_THREAD) return;
  const input = document.getElementById('chatReplyInput');
  const message = input.value.trim();
  if(!message) return;
  input.value = '';
  const { error } = await sb.from('support_chats').insert({
    product_key: ACTIVE_THREAD.product_key, customer_id: ACTIVE_THREAD.customer_id,
    sender:'admin', message, read_by_admin:true
  });
  if(error){ toast('Gagal mengirim balasan: ' + error.message); return; }
}

function updateChatNavBadge(){
  const totalUnread = CHAT_THREADS.reduce((a,t)=> a + t.messages.filter(m=>m.sender==='customer' && !m.read_by_admin).length, 0);
  const badge = document.getElementById('chatNavBadge');
  if(totalUnread > 0){ badge.textContent = totalUnread; badge.classList.remove('hidden'); }
  else { badge.classList.add('hidden'); }
}

function setupChatRealtime(){
  if(chatRealtimeChannel) return; // sudah aktif, tidak perlu subscribe dobel
  chatRealtimeChannel = sb.channel('admin_support_chats')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'support_chats' }, payload => {
      const m = payload.new;
      let thread = CHAT_THREADS.find(t => t.product_key===m.product_key && t.customer_id===m.customer_id);
      if(!thread){
        thread = { product_key:m.product_key, customer_id:m.customer_id, customer_name:m.customer_name, messages:[] };
        CHAT_THREADS.unshift(thread);
      }
      thread.messages.push(m);
      CHAT_THREADS.sort((a,b)=> new Date(b.messages[b.messages.length-1].created_at) - new Date(a.messages[a.messages.length-1].created_at));

      renderChatThreadList();
      updateChatNavBadge();
      if(ACTIVE_THREAD && ACTIVE_THREAD.product_key===m.product_key && ACTIVE_THREAD.customer_id===m.customer_id){
        renderChatDetail(thread);
        if(m.sender==='customer'){
          sb.from('support_chats').update({ read_by_admin:true }).eq('id', m.id).then(()=>{ m.read_by_admin=true; updateChatNavBadge(); });
        }
      }
    })
    .subscribe();
}


// ---------- AFTER SALES ----------
async function loadAfterSales(){
  const { data: completedOrders } = await sb.from('orders').select('*').eq('status','done').order('completed_at', { ascending:false });
  const orderSelect = document.getElementById('as_order');
  orderSelect.innerHTML = (completedOrders||[]).map(o => `<option value="${o.id}">#${o.queue_number} — ${o.customer_name} (${serviceName(o.service_type_id)})</option>`).join('');

  const { data, error } = await sb.from('after_sales').select('*, orders(customer_name, queue_number)').order('reported_at', { ascending:false });
  const tbody = document.getElementById('afterSalesBody');
  if(error){ tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Gagal memuat: ${error.message}</td></tr>`; return; }
  if(!data || data.length === 0){ tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Belum ada tiket after-sales.</td></tr>'; return; }

  tbody.innerHTML = data.map(t => `
    <tr>
      <td>${t.orders ? '#'+t.orders.queue_number+' '+t.orders.customer_name : '-'}</td>
      <td>${t.issue_type}${t.description ? '<div class="text-dim" style="font-size:.78rem">'+t.description+'</div>' : ''}</td>
      <td>${fmtDateTime(t.reported_at)}</td>
      <td><span class="badge ${t.status}">${t.status === 'resolved' ? 'Selesai' : (t.status === 'in_progress' ? 'Diproses' : 'Terbuka')}</span></td>
      <td>${fmtDateTime(t.resolved_at)}</td>
      <td>${t.status !== 'resolved' ? `<button class="btn btn-ghost btn-sm" onclick="resolveTicket('${t.id}')">Tandai selesai</button>` : ''}</td>
    </tr>`).join('');
}

document.getElementById('addAfterSalesBtn').addEventListener('click', async () => {
  const order_id = document.getElementById('as_order').value;
  const issue_type = document.getElementById('as_issue').value.trim();
  const description = document.getElementById('as_desc').value.trim();
  if(!order_id || !issue_type){ toast('Pilih order & isi jenis trouble.'); return; }

  const { error } = await sb.from('after_sales').insert({ order_id, issue_type, description, status:'open' });
  if(error){ toast('Gagal membuat tiket: ' + error.message); return; }
  document.getElementById('as_issue').value = '';
  document.getElementById('as_desc').value = '';
  toast('Tiket after-sales dibuat.');
  loadAfterSales();
});

async function resolveTicket(id){
  const { error } = await sb.from('after_sales').update({ status:'resolved', resolved_at: new Date().toISOString() }).eq('id', id);
  if(error){ toast('Gagal update tiket: ' + error.message); return; }
  toast('Tiket ditandai selesai.');
  loadAfterSales();
}

// ---------- PENGATURAN ----------
async function loadSettings(){
  await loadReferenceData();

  document.getElementById('serviceTypeBody').innerHTML = SERVICE_TYPES.map(s => `
    <tr>
      <td>${s.name}</td>
      <td>${s.default_hours} jam</td>
      <td>${fmtRupiah(s.default_price)}</td>
      <td><span class="badge ${s.active ? 'done' : 'waiting'}">${s.active ? 'Aktif' : 'Nonaktif'}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="toggleServiceType('${s.id}', ${s.active})">${s.active ? 'Nonaktifkan' : 'Aktifkan'}</button></td>
    </tr>`).join('');

  document.getElementById('lpBody').innerHTML = LANDING_PAGES.map(l => `
    <tr>
      <td>${l.name}</td>
      <td>${l.url ? `<a href="${l.url}" target="_blank">${l.url}</a>` : '-'}</td>
      <td><span class="badge ${l.active ? 'done' : 'waiting'}">${l.active ? 'Aktif' : 'Nonaktif'}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="toggleLp('${l.id}', ${l.active})">${l.active ? 'Nonaktifkan' : 'Aktifkan'}</button></td>
    </tr>`).join('');

  // dropdown pilih layanan untuk kelola tier
  const tierSelect = document.getElementById('tier_service_select');
  const prevSelected = tierSelect.value;
  tierSelect.innerHTML = SERVICE_TYPES.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  if(prevSelected) tierSelect.value = prevSelected;
  renderTierTable();
}

function renderTierTable(){
  const serviceId = document.getElementById('tier_service_select').value;
  const tiers = SERVICE_TIERS.filter(t => t.service_type_id === serviceId);
  const tbody = document.getElementById('tierBody');
  if(tiers.length === 0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Belum ada paket untuk layanan ini.</td></tr>';
    return;
  }
  tbody.innerHTML = tiers.map(t => `
    <tr>
      <td>${t.tier_name}</td>
      <td>${t.estimated_hours} jam</td>
      <td>${fmtRupiah(t.price)}</td>
      <td><span class="badge ${t.active ? 'done' : 'waiting'}">${t.active ? 'Aktif' : 'Nonaktif'}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="toggleTier('${t.id}', ${t.active})">${t.active ? 'Nonaktifkan' : 'Aktifkan'}</button></td>
    </tr>`).join('');
}
document.getElementById('tier_service_select').addEventListener('change', renderTierTable);

document.getElementById('addTierBtn').addEventListener('click', async () => {
  const service_type_id = document.getElementById('tier_service_select').value;
  const tier_name = document.getElementById('new_tier_name').value.trim();
  const estimated_hours = Number(document.getElementById('new_tier_hours').value) || 4;
  const price = Number(document.getElementById('new_tier_price').value) || 0;
  if(!service_type_id){ toast('Pilih jenis layanan dulu.'); return; }
  if(!tier_name){ toast('Isi nama paket.'); return; }
  if(!price || price <= 0){ toast('Isi harga paket.'); return; }

  const { error } = await sb.from('service_tiers').insert({ service_type_id, tier_name, estimated_hours, price });
  if(error){ toast('Gagal menambah paket: ' + error.message); return; }
  document.getElementById('new_tier_name').value = '';
  document.getElementById('new_tier_hours').value = '';
  document.getElementById('new_tier_price').value = '';
  toast('Paket ditambahkan.');
  await loadReferenceData();
  renderTierTable();
});

async function toggleTier(id, active){
  await sb.from('service_tiers').update({ active: !active }).eq('id', id);
  await loadReferenceData();
  renderTierTable();
}
window.toggleTier = toggleTier;

document.getElementById('addServiceBtn').addEventListener('click', async () => {
  const name = document.getElementById('new_service_name').value.trim();
  const default_hours = Number(document.getElementById('new_service_hours').value) || 4;
  const default_price = Number(document.getElementById('new_service_price').value) || 0;
  if(!name){ toast('Isi nama layanan.'); return; }
  const { error } = await sb.from('service_types').insert({ name, default_hours, default_price });
  if(error){ toast('Gagal menambah: ' + error.message); return; }
  document.getElementById('new_service_name').value = '';
  document.getElementById('new_service_hours').value = '';
  document.getElementById('new_service_price').value = '';
  toast('Jenis layanan ditambahkan.');
  loadSettings();
});

document.getElementById('addLpBtn').addEventListener('click', async () => {
  const name = document.getElementById('new_lp_name').value.trim();
  const url = document.getElementById('new_lp_url').value.trim();
  if(!name){ toast('Isi nama landing page.'); return; }
  const { error } = await sb.from('landing_pages').insert({ name, url });
  if(error){ toast('Gagal menambah: ' + error.message); return; }
  document.getElementById('new_lp_name').value = '';
  document.getElementById('new_lp_url').value = '';
  toast('Landing page ditambahkan.');
  loadSettings();
});

async function toggleServiceType(id, active){
  await sb.from('service_types').update({ active: !active }).eq('id', id);
  loadSettings();
}
async function toggleLp(id, active){
  await sb.from('landing_pages').update({ active: !active }).eq('id', id);
  loadSettings();
}

// expose functions used via inline onclick
window.startOrder = startOrder;
window.completeOrder = completeOrder;
window.resolveTicket = resolveTicket;
window.toggleServiceType = toggleServiceType;
window.toggleLp = toggleLp;

// ---------- init ----------
(async function init(){
  const ok = await checkAuth();
  if(!ok) return;
  await loadReferenceData();
  await loadOrders();
  await loadChatThreads(); // supaya badge notifikasi chat langsung kelihatan sejak awal buka dashboard

  // auto-refresh antrian tiap 15 detik supaya order baru dari LP langsung kelihatan
  setInterval(() => {
    if(!document.getElementById('tab-antrian').classList.contains('hidden')) loadOrders();
  }, 15000);
})();
