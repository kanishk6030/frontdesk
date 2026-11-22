import { createDatabase } from '../src/db.js';
import { createTicketService } from '../src/tickets.js';
import { makeCalendar } from '../src/calendar.js';
import argon2 from 'argon2';
import { DateTime } from 'luxon';
const db = createDatabase(process.env.MIGRATION_DATABASE_URL);
try {
  const passwords = {
    AGENT: process.env.DEMO_AGENT_PASSWORD,
    CUSTOMER: process.env.DEMO_CUSTOMER_PASSWORD,
  };
  if (Object.values(passwords).some((v) => !v || v.length < 12))
    throw new Error('Provide demo passwords of at least 12 characters.');
  const definitions = [
    ['agent.ava', 'Ava Sharma', 'AGENT'],
    ['agent.ravi', 'Ravi Mehta', 'AGENT'],
    ['customer.maya', 'Maya Rao', 'CUSTOMER'],
    ['customer.arun', 'Arun Patel', 'CUSTOMER'],
  ];
  const accounts = [];
  for (const [username, displayName, role] of definitions) {
    let user = await db.user.findUnique({ where: { username } });
    if (!user)
      user = await db.user.create({
        data: {
          username,
          displayName,
          role,
          passwordHash: await argon2.hash(passwords[role], { type: argon2.argon2id }),
        },
      });
    accounts.push(user);
  }
  if (await db.ticket.count({ where: { subject: { startsWith: '[DEMO]' } } })) {
    console.log('Demo users ready; existing demo tickets preserved.');
  } else {
    let time = DateTime.now()
      .setZone('Asia/Kolkata')
      .minus({ days: 14 })
      .startOf('week')
      .set({ hour: 9, minute: 30 })
      .toJSDate();
    const calendar = makeCalendar(JSON.parse(process.env.FRONTDESK_HOLIDAYS || '[]'));
    const svc = createTicketService({ db, calendar, clock: async () => time, fixture: true });
    const create = (subject, priority = 'MEDIUM') =>
      svc.create(accounts[2], {
        subject: '[DEMO] ' + subject,
        description:
          'Synthetic demonstration ticket. This is sample customer data, not a real support request.',
        priority,
      });
    let result = await create('Checkout stops after selecting delivery', 'HIGH');
    time = new Date(time.getTime() + 4 * 3600000);
    await svc.command(result.ticket.id, accounts[0], 'claim', { expected_version: 1 });
    time = new Date();
    await create('Where can I download last month’s invoice?', 'LOW');
    result = await create('Orders are taking longer to appear');
    result = await svc.command(result.ticket.id, accounts[0], 'claim', { expected_version: 1 });
    await svc.command(result.ticket.id, accounts[0], 'replies', {
      expected_version: result.ticket.version,
      body: 'Could you share the order number so I can look into this?',
      action: 'wait',
    });
    result = await create('Update the billing address');
    result = await svc.command(result.ticket.id, accounts[1], 'claim', { expected_version: 1 });
    await svc.command(result.ticket.id, accounts[1], 'replies', {
      expected_version: result.ticket.version,
      body: 'The billing address has been updated. Please check the next invoice.',
      action: 'resolve',
    });
    result = await create('Product images appear out of order');
    result = await svc.command(result.ticket.id, accounts[0], 'claim', { expected_version: 1 });
    await svc.command(result.ticket.id, accounts[0], 'notes', {
      expected_version: result.ticket.version,
      body: 'Checking the recent catalog update. This internal note is visible only to the team.',
    });
    console.log(
      'Created four demo accounts and five clearly marked synthetic tickets. Passwords remain in the operator environment.',
    );
  }
} finally {
  await db.$disconnect();
}
