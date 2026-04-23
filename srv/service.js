
const cds = require('@sap/cds');
// const { AlertNotificationClient, OAuthAuthentication, RegionUtils } = require('@sap_oss/alert-notification-client');
// const xsenv = require('@sap/xsenv');
const sendMail = async ({ to, subject, html }) => {
  const { MailClient } = require('@sap-cloud-sdk/mail-client');
  await new MailClient().sendMail({ to, subject, html });
  console.log(`[EMAIL] → ${to} | ${subject}`);
};

const buildEmailHtml = ({ roomName, bookedBy, startTime, endTime, durationMins, memberNames }) => `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0d0d10;font-family:'Helvetica Neue',sans-serif;">
<div style="max-width:520px;margin:32px auto;background:#16161a;border:1px solid #2a2a35;border-radius:14px;overflow:hidden;">
  <div style="background:#6366f1;padding:22px 28px;">
    <h2 style="margin:0;color:#fff;font-size:1rem;font-weight:600;">✔ Booking Confirmed</h2>
  </div>
  <div style="padding:24px 28px;">
    <table style="width:100%;font-size:.86rem;border-collapse:collapse;">
      <tr><td style="color:#6b6b80;padding:5px 0;width:90px;">Room</td>      <td style="color:#f0f0f4;font-weight:600;">${roomName}</td></tr>
      <tr><td style="color:#6b6b80;padding:5px 0;">Booked by</td> <td style="color:#f0f0f4;">${bookedBy}</td></tr>
      <tr><td style="color:#6b6b80;padding:5px 0;">Date</td>      <td style="color:#f0f0f4;">${new Date(startTime).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td></tr>
      <tr><td style="color:#6b6b80;padding:5px 0;">Time</td>      <td style="color:#f0f0f4;">${new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} → ${new Date(endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} (${durationMins} min)</td></tr>
      ${memberNames?.length > 1 ? `<tr><td style="color:#6b6b80;padding:5px 0;">Members</td><td style="color:#f0f0f4;">${memberNames.join(', ')}</td></tr>` : ''}
    </table>
    <p style="margin-top:20px;font-size:.75rem;color:#44445a;">Automated confirmation from WorkSpace Booking System.</p>
  </div>
</div>
</body></html>`;

const extractId = (params) => {
  if (!params) return null;
  const first = Array.isArray(params) ? params[0] : params;
  if (first && typeof first === 'object') {
    return first.ID ?? first.id ?? Object.values(first)[0] ?? null;
  }
  return first ?? null;
};

module.exports = cds.service.impl(async function () {
  const { Bookings, Employees, Rooms, BookingMembers } = this.entities;

  this.on('me', async (req) => {
    const email = req.user.attr?.email
    if (!email) return req.error(400, 'User email not available in token.')

    const emp = await SELECT.one.from(Employees)
      .where({ email })
      .columns('ID', 'name', 'email', 'isAdmin');

    if (!emp) return req.error(404, `No employee found for '${email}'.`);

    return { id: emp.ID, name: emp.name, email: emp.email, isAdmin: emp.isAdmin || false };
  });

  // BEFORE CREATE BOOKINGS 
  this.before('CREATE', 'Bookings', async (req) => {
    const { startTime, endTime, room_ID } = req.data;
    const email = req.user.attr?.email || 'sumit.d@laderatechnology.com';
    if (!email) return req.error(400, 'User email not available in token.');

    const creator = await SELECT.one.from(Employees)
      .where({ email })
      .columns('ID', 'name', 'email');
    if (!creator) return req.error(403, `No employee record for '${email}'.`);

    req.data.bookedBy = creator.name;

    if (new Date(startTime).getTime() <= Date.now()) {
      return req.error(400, 'Please choose a future start time.');
    }

    if (new Date(startTime) >= new Date(endTime)) {
      return req.error(400, 'End time must be after start time.');
    }

    const creatorBookerConflict = await SELECT.one.from(Bookings).where({
      bookedBy: creator.name,
      startTime: { '<': endTime },
      endTime: { '>': startTime }
    });
    if (creatorBookerConflict) {
      return req.error(400, `${creator.name}, you already have a booking during this time slot.`);
    }

    const creatorMemberConflict = await SELECT.one.from(BookingMembers).where({
      employee_ID: creator.ID,
      'booking.startTime': { '<': endTime },
      'booking.endTime': { '>': startTime }
    });
    if (creatorMemberConflict) {
      return req.error(400, `${creator.name}, you are already a member of another booking during this time slot.`);
    }

    const incomingIds = (req.data.members || [])
      .map(m => m.employee_ID)
      .filter(Boolean);

    for (const memberId of incomingIds) {
      const memberEmp = await SELECT.one.from(Employees)
        .where({ ID: memberId })
        .columns('ID', 'name');
      if (!memberEmp) continue;

      const asBooker = await SELECT.one.from(Bookings).where({
        bookedBy: memberEmp.name,
        startTime: { '<': endTime },
        endTime: { '>': startTime }
      });
      if (asBooker) {
        return req.error(400, `${memberEmp.name} already has a booking during this time slot.`);
      }

      const asMember = await SELECT.one.from(BookingMembers).where({
        employee_ID: memberId,
        'booking.startTime': { '<': endTime },
        'booking.endTime': { '>': startTime }
      });
      if (asMember) {
        return req.error(400, `${memberEmp.name} is already in another booking during this time slot.`);
      }
    }

    const roomConflict = await SELECT.one.from(Bookings).where({
      room_ID,
      startTime: { '<': endTime },
      endTime: { '>': startTime }
    });
    if (roomConflict) {
      return req.error(400, 'This room is already reserved for the selected time slot.');
    }

    if (incomingIds.length > 0) {
      const room = await SELECT.one.from(Rooms).where({ ID: room_ID });
      if (room && incomingIds.length > room.capacity) {
        return req.error(400, `Member count (${incomingIds.length}) exceeds room capacity of ${room.capacity}.`);
      }
    }
  });

  this.after('CREATE', 'Bookings', async (data) => {
    try {
      const booking = await SELECT.one.from(Bookings).where({ ID: data.ID });
      const room = await SELECT.one.from(Rooms).where({ ID: booking.room_ID });
      const memberRows = await SELECT.from(BookingMembers).where({ booking_ID: data.ID });
      const memberEmps = memberRows.length
        ? await SELECT.from(Employees)
          .where({ ID: { in: memberRows.map(m => m.employee_ID) } })
          .columns('name', 'email')
        : [];

      const durationMins = Math.round(
        (new Date(booking.endTime) - new Date(booking.startTime)) / 60000
      );
      const creatorEmp = await SELECT.one.from(Employees)
        .where({ name: booking.bookedBy })
        .columns('email');

      const html = buildEmailHtml({
        roomName: room?.name || booking.room_ID,
        bookedBy: booking.bookedBy,
        startTime: booking.startTime,
        endTime: booking.endTime,
        durationMins,
        memberNames: memberEmps.map(e => e.name)
      });

      if (creatorEmp?.email) {
        await sendMail({ to: creatorEmp.email, subject: `✔ Booking Confirmed – ${room?.name}`, html });
      }
      for (const emp of memberEmps) {
        if (emp.email && emp.email !== creatorEmp?.email) {
          await sendMail({ to: emp.email, subject: `You've been added to a booking – ${room?.name}`, html });
        }
      }
    } catch (err) {
      console.error('[EMAIL ERROR]', err);
    }
  });

  this.before('UPDATE', 'Bookings', async (req) => {
    const email = req.user.attr?.email;
    if (!email) return req.error(400, 'User email not available in token.');

    const editor = await SELECT.one.from(Employees).where({ email }).columns('isAdmin');
    if (!editor?.isAdmin) return req.error(403, 'Only admins can edit bookings.');

    const bookingId = extractId(req.params);
    if (!bookingId) return req.error(400, 'Could not determine booking ID.');

    const existing = await SELECT.one.from(Bookings).where({ ID: bookingId });
    if (!existing) return req.error(404, 'Booking not found.');

    const newStart = req.data.startTime || existing.startTime;
    const newEnd = req.data.endTime || existing.endTime;

    if (new Date(newStart) >= new Date(newEnd)) {
      return req.error(400, 'End time must be after start time.');
    }

    const roomConflict = await SELECT.one.from(Bookings).where({
      ID: { '!=': bookingId },
      room_ID: existing.room_ID,
      startTime: { '<': newEnd },
      endTime: { '>': newStart }
    });
    if (roomConflict) {
      return req.error(400, 'This room is already booked for the new time slot.');
    }

    const creatorConflict = await SELECT.one.from(Bookings).where({
      ID: { '!=': bookingId },
      bookedBy: existing.bookedBy,
      startTime: { '<': newEnd },
      endTime: { '>': newStart }
    });
    if (creatorConflict) {
      return req.error(400, `${existing.bookedBy} already has another booking in the new time slot.`);
    }

    const memberRows = await SELECT.from(BookingMembers).where({ booking_ID: bookingId });
    for (const mr of memberRows) {
      const memberEmp = await SELECT.one.from(Employees).where({ ID: mr.employee_ID }).columns('name');

      const asBooker = await SELECT.one.from(Bookings).where({
        ID: { '!=': bookingId },
        bookedBy: memberEmp?.name,
        startTime: { '<': newEnd },
        endTime: { '>': newStart }
      });
      if (asBooker) {
        return req.error(400, `${memberEmp?.name || 'A member'} already has a booking in the new time slot.`);
      }

      const asMember = await SELECT.one.from(BookingMembers).where({
        employee_ID: mr.employee_ID,
        'booking.ID': { '!=': bookingId },
        'booking.startTime': { '<': newEnd },
        'booking.endTime': { '>': newStart }
      });
      if (asMember) {
        return req.error(400, `${memberEmp?.name || 'A member'} is already in another booking in the new time slot.`);
      }
    }
  });


  this.before('DELETE', 'Bookings', async (req) => {
    const bookingId = extractId(req.params);
    if (!bookingId) return req.error(400, 'Could not determine booking ID.');

    const email = req.user.attr?.email;
    if (!email) return req.error(400, 'User email not available in token.');

    const emp = await SELECT.one.from(Employees).where({ email }).columns('name', 'isAdmin');
    if (!emp) return req.error(403, 'Unauthorized.');

    const booking = await SELECT.one.from(Bookings).where({ ID: bookingId });
    if (!booking) return req.error(404, 'Booking not found.');

    if (booking.bookedBy !== emp.name && !emp.isAdmin) {
      return req.error(403, 'You can only cancel your own bookings.');
    }
  });

// this.before('READ', 'Bookings', async (req) => {
//   const userId = req.user.id
//   if (!userId) return req.reject(401)

//   const employee = await SELECT.one.from('workspace.Employees').where({ email: userId })

//   if (employee?.isAdmin) return

//   req.query.where({
//     or: [
//       { createdBy: userId },
//       {
//         members: {
//           employee: {
//             email: userId
//           }
//         }
//       }
//     ]
//   })
// })
  //alert-notification for New booking
  
});