document.addEventListener('DOMContentLoaded', async () => {

  const BASE_URL = '/odata/v4/my';

  const bookingsBody  = document.getElementById('bookingsBody');
  const searchFilter  = document.getElementById('searchFilter');
  const typeFilter    = document.getElementById('typeFilter');
  const statusFilter  = document.getElementById('statusFilter');
  const editModal     = document.getElementById('editModal');
  const editId        = document.getElementById('editId');
  const editStart     = document.getElementById('editStart');
  const editEnd       = document.getElementById('editEnd');
  const editCancel    = document.getElementById('editCancel');
  const editSave      = document.getElementById('editSave');
  const deleteModal   = document.getElementById('deleteModal');
  const deleteId      = document.getElementById('deleteId');
  const deleteCancel  = document.getElementById('deleteCancel');
  const deleteConfirm = document.getElementById('deleteConfirm');
  const userAvatar    = document.getElementById('userAvatar');
  const userGreet     = document.getElementById('userGreet');

  let allBookings = [];

  const fmt     = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const fmtDate = iso => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  const toLocal = iso => {
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const getStatus = (start, end) => {
    const now = Date.now();
    if (now < new Date(start).getTime()) return 'upcoming';
    if (now > new Date(end).getTime())   return 'past';
    return 'ongoing';
  };
  const isPast = b => getStatus(b.startTime, b.endTime) === 'past';

  const openModal  = m => { m.classList.remove('hidden'); m.classList.add('open'); };
  const closeModal = m => { m.classList.add('hidden');    m.classList.remove('open'); };

  const load = async () => {
    try {
      const [resB, resUser] = await Promise.all([
        fetch(`${BASE_URL}/Bookings?$expand=room,members($expand=employee)`),
        fetch(`${BASE_URL}/me`)
      ]);

      const raw = await resB.json();
      allBookings = raw.value || [];

      if (resUser.ok) {
        const u = await resUser.json();
        if (u.name) {
          userAvatar.textContent = u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
          userGreet.textContent  = `Hi, ${u.name.split(' ')[0]}`;
        }
      }

      updateStats();
      render();
    } catch (err) {
      console.error(err);
      bookingsBody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red);padding:32px;">Failed to load bookings.</td></tr>`;
    }
  };

  const updateStats = () => {
    const now      = new Date();
    const todayStr = now.toDateString();
    document.getElementById('statTotal').textContent    = allBookings.length;
    document.getElementById('statUpcoming').textContent = allBookings.filter(b => new Date(b.startTime) > now).length;
    document.getElementById('statToday').textContent    = allBookings.filter(b => new Date(b.startTime).toDateString() === todayStr).length;
    const activeRooms = new Set(
      allBookings.filter(b => getStatus(b.startTime, b.endTime) !== 'past').map(b => b.room_ID)
    );
    document.getElementById('statRooms').textContent = activeRooms.size;
  };

  const render = () => {
    const q     = searchFilter.value.toLowerCase();
    const tType = typeFilter.value;
    const tStat = statusFilter.value;

    const filtered = allBookings.filter(b => {
      const room   = b.room || {};
      const status = getStatus(b.startTime, b.endTime);
      return (
        (!q     || b.bookedBy?.toLowerCase().includes(q) || room.name?.toLowerCase().includes(q)) &&
        (!tType || room.type === tType) &&
        (!tStat || status === tStat)
      );
    }).sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    if (!filtered.length) {
      bookingsBody.innerHTML = `
        <tr><td colspan="8">
          <div class="empty-state" style="text-align:center;padding:44px;color:var(--txt3)">
            <p>No bookings found</p>
          </div>
        </td></tr>`;
      return;
    }

    bookingsBody.innerHTML = filtered.map(b => {
      const room    = b.room || {};
      const status  = getStatus(b.startTime, b.endTime);
      const members = (b.members || []).map(m => m.employee?.name || m.employee_ID).join(', ') || '—';

      return `<tr>
        <td><strong>${room.name || b.room_ID}</strong></td>
        <td><span class="tag ${room.type || ''}">${room.type || '—'}</span></td>
        <td class="dim">${b.bookedBy || '—'}</td>
        <td class="dim" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${members}">${members}</td>
        <td class="dim">${fmtDate(b.startTime)}</td>
        <td class="dim">${fmt(b.startTime)} → ${fmt(b.endTime)}</td>
        <td><span class="stag ${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="abtn edit"  onclick="openEdit('${b.ID}')">✎ Edit</button>
            <button class="abtn del"   onclick="openDel('${b.ID}')">✕ Delete</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  };

  // Filters
  searchFilter.addEventListener('input', render);
  typeFilter.addEventListener('change', render);
  statusFilter.addEventListener('change', render);

  // Edit
  window.openEdit = (id) => {
  const b = allBookings.find(x => x.ID === id);
  if (!b) return;

  if (isPast(b)) {
    alert("Past bookings cannot be edited.");
    return;
  }

  editId.value = id;
  editStart.value = toLocal(b.startTime);
  editEnd.value = toLocal(b.endTime);
  openModal(editModal);
};

editCancel.addEventListener('click', () => closeModal(editModal));

editSave.addEventListener('click', async () => {
  const id = editId.value;

  const b = allBookings.find(x => x.ID === id);
  if (b && isPast(b)) {
    alert("Past bookings cannot be edited.");
    return;
  }

  const body = {
    startTime: new Date(editStart.value).toISOString(),
    endTime: new Date(editEnd.value).toISOString()
  };

  editSave.textContent = 'Saving…';
  editSave.disabled = true;

  try {
    const res = await fetch(`${BASE_URL}/Bookings(${id})`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const idx = allBookings.findIndex(b => b.ID === id);
      if (idx !== -1) {
        allBookings[idx].startTime = body.startTime;
        allBookings[idx].endTime = body.endTime;
      }

      closeModal(editModal);
      updateStats();
      render();
    } else {
      const err = await res.json();
      alert(`Failed: ${err.error?.message || 'Unknown error'}`);
    }

  } catch {
    alert('Connection error.');
  } finally {
    editSave.textContent = 'Save Changes';
    editSave.disabled = false;
  }
});


// Delete

window.openDel = (id) => {
  const b = allBookings.find(x => x.ID === id);
  if (!b) return;

  if (isPast(b)) {
    alert("Past bookings cannot be deleted.");
    return;
  }

  deleteId.value = id;
  openModal(deleteModal);
};

deleteCancel.addEventListener('click', () => closeModal(deleteModal));

deleteConfirm.addEventListener('click', async () => {
  const id = deleteId.value;

  const b = allBookings.find(x => x.ID === id);
  if (b && isPast(b)) {
    alert("Past bookings cannot be deleted.");
    return;
  }

  deleteConfirm.textContent = 'Deleting…';
  deleteConfirm.disabled = true;

  try {
    const res = await fetch(`${BASE_URL}/Bookings(${id})`, {
      method: 'DELETE'
    });

    if (res.ok || res.status === 204) {
      allBookings = allBookings.filter(b => b.ID !== id);
      closeModal(deleteModal);
      updateStats();
      render();
    } else {
      alert('Delete failed.');
    }

  } catch {
    alert('Connection error.');
  } finally {
    deleteConfirm.textContent = 'Delete';
    deleteConfirm.disabled = false;
  }
});


// Close modal on outside click
[editModal, deleteModal].forEach(m => {
  m.addEventListener('click', e => {
    if (e.target === m) closeModal(m);
  });
});

await load();
});