import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mocks for firebase/firestore used in src/lib/crmSync.ts
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    doc: vi.fn((...args) => ({ _refArgs: args })),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn() })),
    collection: vi.fn(() => ({})),
    getDocs: vi.fn(),
    deleteDoc: vi.fn(),
  };
});

import { normalizePhone, saveLeadWithSync } from '@/lib/crmSync';
import * as firestore from 'firebase/firestore';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('crmSync', () => {
  it('normalizePhone should strip chars and add 55 prefix', () => {
    expect(normalizePhone('+55 (17) 99999-9999')).toBe('5517999999999');
    expect(normalizePhone('17 99999-9999')).toBe('5517999999999');
    expect(normalizePhone('5517999999999')).toBe('5517999999999');
  });

  it('saveLeadWithSync updates lead and updates conversation name when conversation exists', async () => {
    // Arrange: mock getDoc to return existing conversation with old name
    (firestore.getDoc as unknown as vi.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({ nome: 'Old Name' }),
    });
    (firestore.setDoc as unknown as vi.Mock).mockResolvedValue(undefined);
    (firestore.updateDoc as unknown as vi.Mock).mockResolvedValue(undefined);

    const lead = { nome: 'New Name', telefone: '+55 (17) 99999-0000' };

    // Act
    const res = await saveLeadWithSync(undefined as any, lead, {});

    // Assert
    expect(res.status).toBe('ok');
    expect(res.action).toBe('lead-updated-only');
    expect(firestore.setDoc).toHaveBeenCalled(); // lead set
    expect(firestore.updateDoc).toHaveBeenCalled(); // convo nome updated
    const updateArgs = (firestore.updateDoc as unknown as vi.Mock).mock.calls[0][1];
    expect(updateArgs).toHaveProperty('nome', 'New Name');
  });
});
