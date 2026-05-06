import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as schemaIndex from '@/lib/db/schema';
import { scriptTagRelations } from '@/lib/db/schema/script-tag-relations';
import { seedScriptTags, buildInitialScriptTags } from '@/lib/db/seed-script-tags';

describe('schemas import smoke (batch2)', () => {
  it('schema barrel re-exports the 4 new script tables', () => {
    expect(schemaIndex).toHaveProperty('scripts');
    expect(schemaIndex).toHaveProperty('scriptTags');
    expect(schemaIndex).toHaveProperty('scriptTagRelations');
    expect(schemaIndex).toHaveProperty('scriptCopyLogs');
  });

  it('script-tag-relations module exports the table object', () => {
    expect(scriptTagRelations).toBeDefined();
    expect(typeof scriptTagRelations).toBe('object');
  });

  it('seedScriptTags is importable as a function (not executed)', () => {
    expect(typeof seedScriptTags).toBe('function');
    // companion helper used by the seed should also be importable
    expect(typeof buildInitialScriptTags).toBe('function');
  });

  it('drizzle 0001 migration SQL file exists', () => {
    const drizzleDir = path.resolve(__dirname, '../../drizzle');
    const files = fs.readdirSync(drizzleDir);
    const match = files.find((f) => /^0001_.*\.sql$/.test(f));
    expect(match, 'expected a drizzle/0001_*.sql migration file').toBeTruthy();
    const sqlPath = path.join(drizzleDir, match as string);
    expect(fs.existsSync(sqlPath)).toBe(true);
  });

  it('drizzle 0001 migration SQL contains required statements', () => {
    const drizzleDir = path.resolve(__dirname, '../../drizzle');
    const files = fs.readdirSync(drizzleDir);
    const match = files.find((f) => /^0001_.*\.sql$/.test(f)) as string;
    const sql = fs.readFileSync(path.join(drizzleDir, match), 'utf8');

    expect(/CREATE\s+EXTENSION/i.test(sql)).toBe(true);
    expect(/CREATE\s+TABLE\s+"scripts"/i.test(sql)).toBe(true);
    expect(/"script_tags"/i.test(sql)).toBe(true);
    expect(/"script_tag_relations"/i.test(sql)).toBe(true);
    expect(/"script_copy_logs"/i.test(sql)).toBe(true);
  });
});
