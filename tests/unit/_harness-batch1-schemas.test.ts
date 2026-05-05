import { describe, expect, it } from 'vitest';
import { scripts } from '@/lib/db/schema/scripts';
import { scriptTags } from '@/lib/db/schema/script-tags';
import { scriptCopyLogs } from '@/lib/db/schema/script-copy-logs';

describe('schemas import smoke (batch1)', () => {
  it('exports scripts table', () => {
    expect(scripts).toBeDefined();
  });

  it('exports scriptTags table', () => {
    expect(scriptTags).toBeDefined();
  });

  it('exports scriptCopyLogs table', () => {
    expect(scriptCopyLogs).toBeDefined();
  });
});
