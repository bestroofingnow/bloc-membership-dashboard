import { describe, test, expect } from 'vitest';
import { MANAGE_TOOLS, visibleManageTools } from './manage';

describe('visibleManageTools() — which staff tools the Manage hub shows', () => {
  test('an admin sees every tool', () => {
    expect(visibleManageTools('admin').map((t) => t.key)).toEqual(MANAGE_TOOLS.map((t) => t.key));
  });

  test('a chapter director sees all non-admin-only tools', () => {
    const keys = visibleManageTools('chapter_director').map((t) => t.key);
    expect(keys).toContain('pipeline');
    expect(keys).toContain('qr');
    expect(keys).not.toContain('admin');
    expect(keys).not.toContain('taxonomy');
  });

  test('a plain member sees no manage tools', () => {
    expect(visibleManageTools('member')).toEqual([]);
  });
});
