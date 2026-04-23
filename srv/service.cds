using workspace from '../db/schema';

@requires:'authenticated-user'
service MyService{
  function me() returns {
    id     : String;
    name   : String;
    email  : String;
    isAdmin: Boolean;
  };
  entity Employees as projection on workspace.Employees;
  entity Departments as projection on workspace.Departments;
  entity Rooms as projection on workspace.Rooms;

  @restrict: [
    {
      grant: ['CREATE','UPDATE','DELETE'],
      where: 'createdBy = $user.id'
    },
    {
      grant: ['READ'],
      to: 'authenticated-user'
    },
    {
      grant: ['*'],
      to   : 'admin'
    }
  ]
  entity Bookings as projection on workspace.Bookings;

  entity BookingMembers as projection on workspace.BookingMembers;
}
