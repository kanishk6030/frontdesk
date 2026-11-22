import { expect, test } from 'vitest';
import { queryKey } from './api.js';
test('T-UI privacy: query keys distinguish identities and audiences', () => {
  expect(queryKey({ id: 'one', role: 'AGENT' }, 'ticket', 'x')).not.toEqual(
    queryKey({ id: 'one', role: 'CUSTOMER' }, 'ticket', 'x'),
  );
  expect(queryKey({ id: 'one', role: 'AGENT' }, 'ticket', 'x')).not.toEqual(
    queryKey({ id: 'two', role: 'AGENT' }, 'ticket', 'x'),
  );
});
