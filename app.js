// =========================================================
// NAFA TECH CRM — dashboard.html logic
// =========================================================
const sb = window.supabase.createClient(window.NAFA_CONFIG.SUPABASE_URL, window.NAFA_CONFIG.SUPABASE_ANON_KEY);

let SERVICE_TYPES = [];
let LANDING_PAGES = [];

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
    ['antrian','selesai','aftersales','pengaturan'].forEach(t=>{
      document.getElementById('tab-'+t).classList.toggle('hidden', t !== btn.dataset.tab);
    });
    if(btn.dataset.tab === 'selesai') loadCompleted();
    if(btn.dataset.tab === 'aftersales') loadAfterSales();
    if(btn.dataset.tab === 'pengaturan') loadSettings();
  });
});

// ---------- load reference data (service types & LPs) ----------
async function loadReferenceData(){
  const [st, lp] = await Promise.all([
    sb.from('service_types').select('*').order('created_at'),
    sb.from('landing_pages').select('*').order('created_at')
  ]);
  SERVICE_TYPES = st.data || [];
  LANDING_PAGES = lp.data || [];

  const fService = document.getElementById('f_service');
  fService.innerHTML = SERVICE_TYPES.filter(s=>s.active).map(s=>`<option value="${s.id}" data-hours="${s.default_hours}">${s.name}</option>`).join('');
  const fLp = document.getElementById('f_lp');
  fLp.innerHTML = LANDING_PAGES.filter(l=>l.active).map(l=>`<option value="${l.id}">${l.name}</option>`).join('');

  fService.addEventListener('change', () => {
    const opt = fService.selectedOptions[0];
    if(opt) document.getElementById('f_hours').value = opt.dataset.hours;
  });
  if(fService.selectedOptions[0]) document.getElementById('f_hours').value = fService.selectedOptions[0].dataset.hours;
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
        </div>
        <div class="ticket-actions">
          <button class="btn btn-primary btn-sm" onclick="completeOrder('${current.id}')">Tandai selesai</button>
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

  if(!customer_name || !service_type_id){ toast('Nama customer & jenis layanan wajib diisi.'); return; }

  const { error } = await sb.from('orders').insert({
    customer_name, contact, service_type_id, landing_page_id, estimated_hours, status:'waiting'
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
      <td>${o.payment_status !== 'paid' ? `<button class="btn btn-ghost btn-sm" onclick="generateInvoice('${o.id}')">Buat tagihan</button>` : ''}</td>
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
}

document.getElementById('addServiceBtn').addEventListener('click', async () => {
  const name = document.getElementById('new_service_name').value.trim();
  const default_hours = Number(document.getElementById('new_service_hours').value) || 4;
  const default_price = Number(document.getElementById('new_service_price').value) || 0;
  if(!name){ toast('Isi nama layanan.'); return; }
  const { error } = await sb.from('service_types').insert({ name, default_hours, default_price });
  if(error){ toast('Gagal menambah: ' + error.message); return; }
  document.getElementById('new_service_name').value = '';
  document.getElementById('new_service_hours').value = 4;
  document.getElementById('new_service_price').value = 500000;
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

  // auto-refresh antrian tiap 15 detik supaya order baru dari LP langsung kelihatan
  setInterval(() => {
    if(!document.getElementById('tab-antrian').classList.contains('hidden')) loadOrders();
  }, 15000);
})();
