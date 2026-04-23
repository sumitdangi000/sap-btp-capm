using { cuid, managed } from '@sap/cds/common';
namespace workspace;

entity Departments : cuid {
  name      : String(100);
  employees : Association to many Employees on employees.department = $self;
}

entity Employees : cuid {
  name       : String(100) @mandatory;
  email      : String(200) @mandatory;
  department : Association to Departments;
  isAdmin    : Boolean default false;
}

entity Rooms : cuid {
  name     : String(100) @mandatory;
  type     : String(20) enum { Meeting; Training; Booth };
  capacity : Integer @mandatory;
  bookings : Association to many Bookings on bookings.room = $self;
}

entity Bookings : cuid, managed {
  room      : Association to Rooms @mandatory;
  bookedBy  : String(200);       
  startTime : DateTime @mandatory;
  endTime   : DateTime @mandatory;
  members   : Composition of many BookingMembers on members.booking = $self;
}

entity BookingMembers : cuid {
  booking  : Association to Bookings;
  employee : Association to Employees @mandatory;
}
