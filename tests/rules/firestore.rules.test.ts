import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const rules = readFileSync('firestore.rules', 'utf8');
// The owner uid lives in the rules file; tests use whatever value is committed there
const ownerUid = rules.match(/function ownerUid\(\) \{\s*return '([^']+)';/)?.[1] ?? 'owner-uid-not-found';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-comnotes',
    firestore: { rules },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'notes/n1'), { title: 't', content: '' });
    await setDoc(doc(ctx.firestore(), 'pin/default'), { value: '123456' });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('firestore.rules', () => {
  test('AC-6/AC-7: unauthenticated read of a note is denied', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'notes/n1')));
  });

  test('AC-6/AC-7: unauthenticated write of a note is denied', async () => {
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'notes/n2'), { title: 'x' }));
  });

  test('AC-6/AC-7: another signed-in user cannot read or write notes', async () => {
    const db = env.authenticatedContext('someone-else').firestore();
    await assertFails(getDoc(doc(db, 'notes/n1')));
    await assertFails(setDoc(doc(db, 'notes/n2'), { title: 'x' }));
  });

  test('AC-6/AC-7: the owner can read and write notes', async () => {
    const db = env.authenticatedContext(ownerUid).firestore();
    await assertSucceeds(getDoc(doc(db, 'notes/n1')));
    await assertSucceeds(setDoc(doc(db, 'notes/n2'), { title: 'x' }));
  });

  test('AC-6/AC-7: the owner cannot read the old pin document', async () => {
    await assertFails(getDoc(doc(env.authenticatedContext(ownerUid).firestore(), 'pin/default')));
  });
});
