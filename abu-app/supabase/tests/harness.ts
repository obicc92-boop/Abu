/**
 * Runs the migrations in an in-process Postgres (PGlite) with just enough of
 * Supabase to test the security rules: the anon and authenticated roles,
 * auth.users and auth.uid(). No Docker or Supabase account needed.
 *
 * Run with `npm run test:db`.
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');

/** The pieces of Supabase the migrations rely on. */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

type Row = Record<string, unknown>;

/** A query runner bound to one person (or to nobody, signed out). */
export interface Session {
  rows<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Row>(sql: string, params?: unknown[]): Promise<T>;
  /** Rows changed by an insert, update or delete (0 when the rules hide the rows). */
  changed(sql: string, params?: unknown[]): Promise<number>;
}

export class TestDb {
  private readonly pg: PGlite;

  constructor(pg: PGlite) {
    this.pg = pg;
  }

  static async create(): Promise<TestDb> {
    const pg = new PGlite();
    await pg.exec(SUPABASE_STUB);
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      await pg.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
    }
    return new TestDb(pg);
  }

  /** Signs up a person (as Supabase Auth would) and returns their id. */
  async signUp(email: string, fullName: string): Promise<string> {
    const res = await this.pg.query<{ id: string }>(
      'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
      [email, JSON.stringify({ full_name: fullName })],
    );
    return res.rows[0].id;
  }

  /** Runs queries as a signed-in person, or signed out when `userId` is null. */
  as(userId: string | null): Session {
    const run = async <T>(sql: string, params: unknown[] = []) => {
      await this.pg.exec(`set role ${userId ? 'authenticated' : 'anon'}`);
      await this.pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
      try {
        return await this.pg.query<T>(sql, params);
      } finally {
        await this.pg.exec('reset role');
        await this.pg.query(`select set_config('request.jwt.claim.sub', '', false)`);
      }
    };
    return {
      rows: async <T>(sql: string, params?: unknown[]) => (await run<T>(sql, params)).rows,
      one: async <T>(sql: string, params?: unknown[]) => {
        const rows = (await run<T>(sql, params)).rows;
        if (rows.length !== 1) throw new Error(`Expected one row, got ${rows.length}`);
        return rows[0];
      },
      changed: async (sql: string, params?: unknown[]) => (await run(sql, params)).affectedRows ?? 0,
    };
  }

  /** Runs SQL as the database owner, bypassing the rules (test setup only). */
  async admin<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pg.query<T>(sql, params)).rows;
  }
}
