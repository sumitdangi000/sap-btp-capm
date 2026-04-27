'use strict';
document.addEventListener('DOMContentLoaded', async () => {
  $(document).ready(function() {
  $('#startTime').datetimepicker({
    format: 'Y-m-d H:i', 
    displayFormat:'d,m-Y H:i',
    step: 15,            
    minDate: 0,          
    theme: 'light',  
    closeOnDateSelect: false,    
    onSelectTime: function(current_time, $input) {
        $input.datetimepicker('hide');
        $input[0].dispatchEvent(new Event('change'));
    }
  });
});

  const API = '/odata/v4/my';
  const get = id => document.getElementById(id);

  const s1 = get('s1');
  const s2 = get('s2');
  const s3 = get('s3');
  const sSubmit = get('sSubmit');
  const startInput = get('startTime');
  const btnCheck = get('btnCheckAvail');
  const btnBack1 = get('btnBack1');
  const slotPill = get('slotPill');
  const fpSpinner = get('fpSpinner');
  const fpSvg = get('fpSvg');
  const memberChips = get('memberChips');
  const memberSel = get('memberSel');
  const btnAddMember = get('btnAddMember');
  const capVal = get('capVal');
  const capFill = get('capFill');
  const capCount = get('capCount');
  const bookingForm = get('bookingForm');
  const submitBtn = get('submitBtn');
  const msgBox = get('msgBox');
  const modal = get('modal');
  const modalBody = get('modalBody');
  const modalCancel = get('modalCancel');
  const modalConfirm = get('modalConfirm');
  const adminLink = get('adminLink');
  const navAvatar = get('navAvatar');
  const navName = get('navName');
  const navRole = get('navRole');
  const customPill = get('customPill');
  const customMinsIn = get('customMins');


  let allRooms = [];
  let allEmployees = [];
  let takenIds = new Set();
  let currentUser = null;      
  let selRoom = null;
  let selType = 'Meeting';
  let duration = 30;        
  let members = [];        
  let pendingData = null;

  const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const fmtDate = iso => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  const endISO = startISO => new Date(new Date(startISO).getTime() + duration * 60000).toISOString();

  const showMsg = (html, type) => {
    msgBox.innerHTML = `<div class="msg ${type === 'ok' ? 'ok' : 'err'}">${html}</div>`;
  };

  document.querySelectorAll('.pill').forEach(p => {
    p.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(x => x.classList.remove('sel'));
      p.classList.add('sel');
      if (p.id === 'customPill') {
        customMinsIn.classList.remove('hidden');
        duration = parseInt(customMinsIn.value) || 0;
      } else {
        customMinsIn.classList.add('hidden');
        duration = parseInt(p.dataset.mins);
      }
    });
  });
  customMinsIn.addEventListener('input', () => {
    if (customPill.classList.contains('sel'))
      duration = parseInt(customMinsIn.value) || 0;
  });

  const init = async () => {
    try {
      const [rMe, rRooms, rEmps] = await Promise.all([
        fetch(`${API}/me`),
        fetch(`${API}/Rooms`),
        fetch(`${API}/Employees?$expand=department`)
      ]);

      allRooms = (await rRooms.json()).value || [];
      allEmployees = (await rEmps.json()).value || [];

      if (rMe.ok) {
        currentUser = await rMe.json();
        // currentUser = { id, name, email, isAdmin }
      }

      if (currentUser) {
        const initials = currentUser.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        navAvatar.textContent = initials;
        navName.textContent = `Hi, ${currentUser.name.split(' ')[0]}`;
        if (currentUser.isAdmin) {
          navRole.textContent = 'Admin';
          navRole.className = 'role-tag admin';
          adminLink.style.display = '';
        }
      }
    } catch (err) {
      console.error(err);
      showMsg('<b>Connection error.</b> Could not load data.', 'err');
    }
  };

  await init();

  btnCheck.addEventListener('click', async () => {
    const raw = startInput.value;
    if (!raw) { showMsg('Please select a date and time.', 'err'); return; }
    if (duration <= 0) { showMsg('Please choose a duration.', 'err'); return; }
    if (new Date(raw) <= new Date()) { showMsg('Please choose a future time.', 'err'); return; }

    msgBox.innerHTML = '';
    await goToStep2(raw);
  });

  btnBack1.addEventListener('click', () => {
    s2.classList.add('hidden');
    s3.classList.add('hidden');
    sSubmit.classList.add('hidden');
    s1.classList.remove('hidden');
    selRoom = null; members = [];
    msgBox.innerHTML = '';
  });

  const goToStep2 = async (rawStart) => {
    const start    = new Date(rawStart);
    const end      = new Date(start.getTime() + duration * 60000);
    const startISO = start.toISOString();
    const endISO   = end.toISOString();

    slotPill.innerHTML = `
      <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      <b>${fmtDate(startISO)}</b> &nbsp;·&nbsp; ${fmtTime(startISO)} – ${fmtTime(endISO)} &nbsp;·&nbsp; ${duration} min
    `;

    s1.classList.add('hidden');
    s2.classList.remove('hidden');
    s3.classList.add('hidden');
    sSubmit.classList.add('hidden');
    selRoom = null; members = [];
    // roomBanner.classList.add('hidden');

    fpSpinner.classList.remove('hidden');
    fpSvg.classList.add('hidden');
    await fetchTaken(startISO, endISO);
    fpSpinner.classList.add('hidden');
    fpSvg.classList.remove('hidden');

    drawPlan(selType);
  };

  const fetchTaken = async (startISO, endISO) => {
    try {
      const filter = `startTime lt ${endISO} and endTime gt ${startISO}`;
      const res = await fetch(`${API}/Bookings?$filter=${encodeURIComponent(filter)}&$select=room_ID`);
      const data = await res.json();
      takenIds = new Set((data.value || []).map(b => b.room_ID));
    } catch {
      takenIds = new Set();
    }
  };

  document.querySelectorAll('.ttab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ttab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selType = tab.dataset.type;
      selRoom = null; members = [];
      // roomBanner.classList.add('hidden');
      s3.classList.add('hidden');
      sSubmit.classList.add('hidden');
      drawPlan(selType);
    });
  });

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const mk = tag => document.createElementNS(SVG_NS, tag);

  const drawPlan = (type) => {
    const svg = fpSvg;
    svg.innerHTML = '';
    const rooms = allRooms.filter(r => r.type === type);

    if (!rooms.length) {
      const t = mk('text');
      t.setAttribute('x', '280'); t.setAttribute('y', '120');
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-family', 'Inter,sans-serif');
      t.setAttribute('font-size', '13');
      t.setAttribute('fill', '#44445a');
      t.textContent = `No ${type} rooms configured.`;
      svg.appendChild(t);
      return;
    }

    // Office boundry
    const outline = mk('rect');
    outline.setAttribute('x', '8'); outline.setAttribute('y', '8');
    outline.setAttribute('width', '544'); outline.setAttribute('height', '284');
    outline.setAttribute('rx', '8'); outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', '#2a2a38'); outline.setAttribute('stroke-width', '1.5');
    svg.appendChild(outline);

    // Floor
    const floorLabel = mk('text');
    floorLabel.setAttribute('x', '24'); floorLabel.setAttribute('y', '24');
    floorLabel.setAttribute('font-family', 'Inter,sans-serif');
    floorLabel.setAttribute('font-size', '9');
    floorLabel.setAttribute('font-weight', '700');
    floorLabel.setAttribute('fill', '#44445a');
    floorLabel.setAttribute('letter-spacing', '1.2');
    floorLabel.textContent = type === 'Meeting' ? 'MEETING ROOMS' : type === 'Training' ? 'TRAINING ROOM' : 'PHONE BOOTHS';
    svg.appendChild(floorLabel);

    const layout = computeLayout(type, rooms);

    if (layout.corridor) {
      const c = layout.corridor;
      const cr = mk('rect');
      cr.setAttribute('x', c.x); cr.setAttribute('y', c.y);
      cr.setAttribute('width', c.w); cr.setAttribute('height', c.h);
      cr.setAttribute('fill', 'transparent'); cr.setAttribute('rx', '0');
      svg.appendChild(cr);

      const cl = mk('text');
      cl.setAttribute('x', String(c.x + c.w / 2)); cl.setAttribute('y', String(c.y + c.h / 2 + 4));
      cl.setAttribute('text-anchor', 'middle');
      cl.setAttribute('font-family', 'Inter,sans-serif'); cl.setAttribute('font-size', '8');
      cl.setAttribute('fill', '#44445a'); cl.setAttribute('letter-spacing', '1.5');
      cl.textContent = '';
      svg.appendChild(cl);
    }

    layout.rooms.forEach(({ room, x, y, w, h }) => {
      const taken = takenIds.has(room.ID);
      const isSelected = selRoom?.ID === room.ID;

      // Colours
      const fillClr = isSelected ? 'rgba(255,200,30,.25)'
        : taken ? 'rgba(239,68,68,.14)'
          : 'rgba(34,197,94,.13)';
      const strokeClr = isSelected ? 'rgba(255, 200, 30, .7)'
        : taken ? 'rgba(239,68,68,.5)'
          : 'rgba(34,197,94,.45)';
      const labelClr = taken ? '#44445a' : 'rgba(38, 43, 86, 0.97)';
      const subClr = taken ? '#44445a' : '#7070a0';
      const strokeW = isSelected ? '2' : '1.5';

      const g = mk('g');
      g.classList.add('room-g');
      if (taken) g.classList.add('taken');

      const rect = mk('rect');
      rect.classList.add('room-rect');
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', w); rect.setAttribute('height', h);
      rect.setAttribute('rx', '8');
      rect.setAttribute('fill', fillClr);
      rect.setAttribute('stroke', strokeClr);
      rect.setAttribute('stroke-width', strokeW);
      g.appendChild(rect);

      const cx = String(Number(x) + Number(w) / 2);
      const nameEl = mk('text');
      nameEl.setAttribute('x', cx); nameEl.setAttribute('y', String(Number(y) + Number(h) / 2 - 9));
      nameEl.setAttribute('text-anchor', 'middle');
      nameEl.setAttribute('font-family', 'Inter,sans-serif');
      nameEl.setAttribute('font-size', '11'); nameEl.setAttribute('font-weight', '600');
      nameEl.setAttribute('fill', labelClr);
      nameEl.textContent = room.name;
      g.appendChild(nameEl);

      // Capacity
      const capEl = mk('text');
      capEl.setAttribute('x', cx); capEl.setAttribute('y', String(Number(y) + Number(h) / 2 + 7));
      capEl.setAttribute('text-anchor', 'middle');
      capEl.setAttribute('font-family', 'JetBrains Mono,monospace');
      capEl.setAttribute('font-size', '9.5');
      capEl.setAttribute('fill', subClr);
      capEl.textContent = `${room.capacity} ${room.capacity === 1 ? 'seat' : 'seats'}`;
      g.appendChild(capEl);

      // Status
      const iconEl = mk('text');
      iconEl.setAttribute('x', cx); iconEl.setAttribute('y', String(Number(y) + Number(h) / 2 + 25));
      iconEl.setAttribute('text-anchor', 'middle'); iconEl.setAttribute('font-size', '12');
      iconEl.textContent = taken ? '🔒' : isSelected ? '✓' : '';
      g.appendChild(iconEl);

      if (!taken) {
        const door = mk('line');
        door.setAttribute('x1', x); door.setAttribute('y1', String(Number(y) + Number(h) - 14));
        door.setAttribute('x2', String(Number(x) + 16)); door.setAttribute('y2', String(Number(y) + Number(h) - 14));
        door.setAttribute('stroke', strokeClr); door.setAttribute('stroke-width', '1');
        g.appendChild(door);
      }

      if (!taken) {
        g.style.cursor = 'pointer';
        g.addEventListener('click', () => onPickRoom(room));
      }

      svg.appendChild(g);
    });
  };

  const computeLayout = (type, rooms) => {

  if (type === 'Booth') {
  const bw = 96, bh = 86, gap = 12;

  const cols = 3; // fixed
  const rows = Math.ceil(rooms.length / cols);

  const totalW = cols * bw + (cols - 1) * gap;
  const sx = Math.max(20, (560 - totalW) / 2);

  const startY = 60;
  const rowGap = 100; 

  return {
    corridor: { x: 20, y: 218, w: 0, h: 0 },
    rooms: rooms.map((room, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);

      return {
        room,
        x: sx + col * (bw + gap),
        y: startY + row * rowGap,
        w: bw,
        h: bh
      };
    })
  };
}

    if (type === 'Training') {
      return {
        corridor: { x: 20, y: 255, w: 0, h: 0 },
        rooms: [{ room: rooms[0], x: 195, y: 30, w: 180, h: 240 }]
      };
    }

    const count = rooms.length;
    const cols = Math.ceil(count / 2);
    const bw = Math.min(128, Math.floor(500 / cols) - 12);
    const bh = 100;
    const totalW = cols * bw + (cols - 1) * 10;
    const sx = Math.max(20, (560 - totalW) / 2);
    const rowGap = 110;
    const row1Y = 60;
    const row2Y = row1Y + rowGap;

    return {
      corridor: { x: 20, y: 148, w: 0, h: 0 },
      rooms: rooms.map((room, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
          room,
          x: sx + col * (bw + 10),
          y: row === 0 ? row1Y : row2Y,
          w: bw, h: bh
        };
      })
    };
  };

  const onPickRoom = (room) => {
    selRoom = room;
    drawPlan(selType);   

    if (selType === 'Meeting') {
      members = currentUser ? [{ ...currentUser, _you: true }] : [];
      renderChips();
      rebuildMemberSel();
      capVal.textContent = room.capacity;
      updateCap(room.capacity);
      s3.classList.remove('hidden');
    } else {
      members = currentUser ? [{ ...currentUser }] : [];
      s3.classList.add('hidden');
    }

    sSubmit.classList.remove('hidden');
    setTimeout(() => sSubmit.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  };

// Members rendering
  const renderChips = () => {
    memberChips.innerHTML = '';
    members.forEach((m, i) => {
      const chip = document.createElement('div');
      chip.className = 'chip' + (i === 0 ? ' you' : '');
      chip.innerHTML = `${m.name}${i === 0 ? ' <em style="opacity:.55;font-style:normal;font-size:.88em">(you)</em>' : ''}
        ${i > 0 ? `<button class="chip-rm" data-id="${m.id || m.ID}">×</button>` : ''}`;
      memberChips.appendChild(chip);
    });
    memberChips.querySelectorAll('.chip-rm').forEach(btn =>
      btn.addEventListener('click', () => {
        members = members.filter(m => (m.id || m.ID) !== btn.dataset.id);
        rebuildMemberSel(); renderChips(); updateCap(selRoom?.capacity);
      })
    );
    updateCap(selRoom?.capacity);
  };

  const rebuildMemberSel = () => {
    const ids = new Set(members.map(m => m.id || m.ID));
    memberSel.innerHTML = '<option value="">Add a colleague…</option>';
    allEmployees.filter(e => !ids.has(e.ID)).forEach(e => {
      const o = document.createElement('option');
      o.value = e.ID; o.textContent = e.name;
      memberSel.appendChild(o);
    });
  };

  btnAddMember.addEventListener('click', () => {
    const id = memberSel.value;
    if (!id) return;
    if (members.length >= (selRoom?.capacity || 99)) {
      showMsg(`Room capacity (${selRoom?.capacity}) reached.`, 'err'); return;
    }
    const emp = allEmployees.find(e => e.ID === id);
    if (emp && !members.find(m => (m.id || m.ID) === id)) {
      members.push({ id: emp.ID, ID: emp.ID, name: emp.name, email: emp.email });
      rebuildMemberSel(); renderChips();
    }
  });

  const updateCap = (cap) => {
    if (!cap) return;
    const pct = Math.min((members.length / cap) * 100, 100);
    capCount.textContent = `${members.length} / ${cap}`;
    capFill.style.width = pct + '%';
    capFill.classList.toggle('full', members.length >= cap);
  };

// Submit
  bookingForm.addEventListener('submit', e => {
    e.preventDefault();
    msgBox.innerHTML = '';

    if (!selRoom) { showMsg('Please select a room from the floor plan.', 'err'); return; }
    if (duration <= 0) { showMsg('Please choose a duration.', 'err'); return; }

    const raw   = startInput.value;
    const start = new Date(raw);
    const end   = new Date(start.getTime() + duration * 60000);
    const startISO = start.toISOString();
    const endISO   = end.toISOString();

    modalBody.innerHTML = `
      <b>Room:</b> ${selRoom.name}<br>
      <b>Type:</b> ${selType}<br>
      <b>Date:</b> ${fmtDate(startISO)}<br>
      <b>Time:</b> ${fmtTime(startISO)} → ${fmtTime(endISO)}<br>
      <b>Duration:</b> ${duration} min<br>
      ${members.length > 1 ? `<b>Members:</b> ${members.map(m => m.name).join(', ')}<br>` : ''}
    `;

    pendingData = {
      room_ID:   selRoom.ID,
      startTime: startISO,   
      endTime:   endISO,
      members:   members.map(m => ({ employee_ID: m.id || m.ID }))
    };

    modal.classList.remove('hidden');
  });

  modalCancel.addEventListener('click', () => { modal.classList.add('hidden'); pendingData = null; });
  modal.addEventListener('click', e => { if (e.target === modal) { modal.classList.add('hidden'); pendingData = null; } });

  // Confirm booking
  modalConfirm.addEventListener('click', async () => {
    if (!pendingData) return;
    modal.classList.add('hidden');

    submitBtn.classList.add('loading');

    try {
      const res = await fetch(`${API}/Bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingData)
      });

      if (res.ok) {
        showMsg(`
          <b>✔ Booking Confirmed</b><br>
          <span style="font-size:.78rem;line-height:1.75">
            <b>Room:</b> ${selRoom.name}<br>
            <b>Time:</b> ${fmtDate(pendingData.startTime)} · ${fmtTime(pendingData.startTime)} – ${fmtTime(pendingData.endTime)}<br>
            <b>Members:</b> ${members.map(m => m.name).join(', ')}<br>
            <span style="color:var(--txt3)">📧 Confirmation sent to your email.</span>
          </span>
        `, 'ok');

        // Full reset
        bookingForm.reset();
        s2.classList.add('hidden');
        s3.classList.add('hidden');
        sSubmit.classList.add('hidden');
        s1.classList.remove('hidden');
        selRoom = null; members = [];
        takenIds = new Set();
        document.querySelectorAll('.pill').forEach(p => p.classList.remove('sel'));
        document.querySelector('[data-mins="30"]').classList.add('sel');
        duration = 30;
        customMinsIn.classList.add('hidden');
      } else {
        const r = await res.json();
        showMsg(`<b>Conflict.</b> ${r.error?.message || 'Booking failed.'}`, 'err');
      }
    } catch {
      showMsg('<b>Error.</b> Connection failed.', 'err');
    } finally {
      submitBtn.classList.remove('loading');
      pendingData = null;
    }
  });

});
function logout(event) {
  event.preventDefault();

  fetch('/logout', {
    method: 'POST',
    credentials: 'include'
  })
  .finally(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = './login.html';
  });
}