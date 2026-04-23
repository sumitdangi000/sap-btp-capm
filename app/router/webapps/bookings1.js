
document.addEventListener('DOMContentLoaded', async () => {

  const BASE_URL = '/odata/v4/my';

  const bookingsBody  = document.getElementById('bookingsBody');
  const statusFilter  = document.getElementById('statusFilter');
  const cancelModal   = document.getElementById('cancelModal');
  const cancelId      = document.getElementById('cancelId');
  const cancelDismiss = document.getElementById('cancelDismiss');
  const cancelConfirm = document.getElementById('cancelConfirm');
  const adminNavLink  = document.getElementById('adminNavLink');
  const userAvatar    = document.getElementById('userAvatar');
  const userGreet     = document.getElementById('userGreet');
  const roleChip      = document.getElementById('roleChip');
  const tabBtns       = document.querySelectorAll('.tab-btn');

  let allBookings     = [];
  let currentUserName = null;   
  let currentUserId   = null;   
  let activeTab       = 'created';

  const fmt     = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const fmtDate = iso => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });

  const getStatus = (start, end) => {
    const now = Date.now();
    if (now < new Date(start).getTime()) return 'upcoming';
    if (now > new Date(end).getTime())   return 'past';
    return 'ongoing';
  };

  const openModal  = m => { m.classList.remove('hidden'); m.classList.add('open'); };
  const closeModal = m => { m.classList.add('hidden');    m.classList.remove('open'); };

  const load = async () => {
    try {
      const [resB, resUser] = await Promise.all([
        fetch(`${BASE_URL}/Bookings?$expand=room,members($expand=employee)`),
        fetch(`${BASE_URL}/me`)
      ]);

      allBookings = (await resB.json()).value || [];

      if (resUser.ok) {
        const u = await resUser.json();
        currentUserName = u.name || null;
        currentUserId   = u.id   || null;   

        const initials = (u.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
        userAvatar.textContent = initials;
        userGreet.textContent  = `Hi, ${(u.name || '').split(' ')[0] || 'You'}`;

        if (u.isAdmin) {
          roleChip.textContent   = 'Admin';
          roleChip.className     = 'role-chip admin';
          if (adminNavLink) adminNavLink.style.display = '';
        }
      }

      updateStats();
      render();
    } catch (err) {
      console.error(err);
      bookingsBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red);padding:32px;">Failed to load bookings.</td></tr>`;
    }
  };

  const updateStats = () => {
    const mine = allBookings.filter(b => b.bookedBy === currentUserName);
    const asMember = allBookings.filter(b =>
      b.bookedBy !== currentUserName &&
      (b.members || []).some(m =>
        m.employee_ID === currentUserId ||
        m.employee?.name === currentUserName
      )
    );

    const now = new Date();
    document.getElementById('statMine').textContent     = mine.length;
    document.getElementById('statUpcoming').textContent = mine.filter(b => new Date(b.startTime) > now).length;
    document.getElementById('statMember').textContent   = asMember.length;
  };

  const render = () => {
    const tStat = statusFilter.value;
    let filtered;

    if (activeTab === 'created') {
      // Show bookings where I am the creator (bookedBy = my name)
      filtered = allBookings.filter(b => b.bookedBy === currentUserName);
    } else {
      // Show bookings where I'm a member but not the creator
      filtered = allBookings.filter(b =>
        b.bookedBy !== currentUserName &&
        (b.members || []).some(m =>
          m.employee_ID === currentUserId ||
          m.employee?.name === currentUserName
        )
      );
    }

    if (tStat) filtered = filtered.filter(b => getStatus(b.startTime, b.endTime) === tStat);
    filtered.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    if (!filtered.length) {
      bookingsBody.innerHTML = `
        <tr><td colspan="7">
          <div style="text-align:center;padding:44px;color:var(--txt3)">
            <p>No bookings here yet.</p>
          </div>
        </td></tr>`;
      return;
    }

    bookingsBody.innerHTML = filtered.map(b => {
      const room    = b.room || {};
      const status  = getStatus(b.startTime, b.endTime);
      const members = (b.members || []).map(m => m.employee?.name || m.employee_ID).join(', ') || '—';
      const isPast  = status === 'past';

      return `<tr>
        <td><strong>${room.name || b.room_ID}</strong></td>
        <td><span class="tag ${room.type || ''}">${room.type || '—'}</span></td>
        <td class="dim">${fmtDate(b.startTime)}</td>
        <td class="dim">${fmt(b.startTime)} → ${fmt(b.endTime)}</td>
        <td class="dim" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${members}">${members}</td>
        <td><span class="stag ${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></td>
        <td>
          ${activeTab === 'created' && !isPast
            ? `<button class="abtn cancel2" onclick="openCancel('${b.ID}')">✕ Cancel</button>`
            : `<span style="color:var(--txt3);font-size:.75rem;">${isPast ? 'Ended' : 'View only'}</span>`}
        </td>
      </tr>`;
    }).join('');
  };

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      tabBtns.forEach(b => {
        const isActive = b === btn;
        b.style.color       = isActive ? 'var(--accent, #6366f1)' : 'var(--txt2, #7070a0)';
        b.style.fontWeight  = isActive ? '600' : '500';
        b.style.borderBottom= isActive ? '2px solid var(--accent, #6366f1)' : '2px solid transparent';
      });
      render();
    });
  });

  statusFilter.addEventListener('change', render);

  // Cancel
  window.openCancel = (id) => {
    cancelId.value = id;
    openModal(cancelModal);
  };

  cancelDismiss.addEventListener('click', () => closeModal(cancelModal));

  cancelConfirm.addEventListener('click', async () => {
    const id = cancelId.value;
    cancelConfirm.textContent = 'Cancelling…';
    cancelConfirm.disabled    = true;

    try {
      const res = await fetch(`${BASE_URL}/Bookings(${id})`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        allBookings = allBookings.filter(b => b.ID !== id);
        closeModal(cancelModal);
        updateStats();
        render();
      } else {
        const err = await res.json();
        alert(err.error?.message || 'Cancellation failed.');
      }
    } catch {
      alert('Connection error.');
    } finally {
      cancelConfirm.textContent = 'Yes, Cancel';
      cancelConfirm.disabled    = false;
    }
  });

  cancelModal.addEventListener('click', e => { if (e.target === cancelModal) closeModal(cancelModal); });

  await load();
});