/**
 * The local-note sweep.
 *
 * Notes were localStorage-only for the product's whole life, so every note
 * anyone wrote lives in one browser under stairs_notes_<userId>. The old lift
 * ran inside the Notes view, needing the right browser AND someone opening that
 * view. This runs at login, so it needs only the right browser — and it must
 * never drop a note it failed to upload.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// fetch is stubbed rather than the module mocked: syncLocalNotes calls NotesAPI
// through the module's own binding, so replacing the export would not affect it
// — and this exercises the real request path anyway.
const { findLocalNotes, countLocalNotes, syncLocalNotes, api } = await import('../api');

const listNotes = vi.fn();   // resolves to the array the server returns
const createNote = vi.fn();  // receives the POST body

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

const stubFetch = () => vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
  const method = opts.method || 'GET';
  if (url.endsWith('/api/v1/notes') && method === 'GET') return ok(await listNotes());
  if (url.endsWith('/api/v1/notes') && method === 'POST') return ok(await createNote(JSON.parse(opts.body)));
  throw new Error(`unexpected request: ${method} ${url}`);
}));

const note = (title, content = 'body') => ({
  id: `n_${title}`, title, content, source: 'manual', pinned: false,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
});

beforeEach(() => {
  localStorage.clear();
  api.token = 'test-token';
  listNotes.mockReset().mockResolvedValue([]);
  createNote.mockReset().mockResolvedValue({});
  stubFetch();
});
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

describe('finding local notes', () => {
  it('finds notes under any user key, not just the current one', () => {
    // The store is keyed by `user.id || user.email`, so someone who used the app
    // before an id was available has notes filed under their address.
    localStorage.setItem('stairs_notes_abc-123', JSON.stringify([note('by id')]));
    localStorage.setItem('stairs_notes_sam@acme.test', JSON.stringify([note('by email')]));
    expect(countLocalNotes()).toBe(2);
    expect(findLocalNotes().map(g => g.key).sort()).toEqual(
      ['stairs_notes_abc-123', 'stairs_notes_sam@acme.test']);
  });

  it('ignores unrelated and empty keys', () => {
    localStorage.setItem('stairs_token', 'xyz');
    localStorage.setItem('stairs_manifest_1', JSON.stringify({ a: 1 }));
    localStorage.setItem('stairs_notes_empty', JSON.stringify([]));
    expect(countLocalNotes()).toBe(0);
  });

  it('survives an unparseable key rather than throwing', () => {
    localStorage.setItem('stairs_notes_broken', 'not json{{');
    localStorage.setItem('stairs_notes_ok', JSON.stringify([note('fine')]));
    expect(countLocalNotes()).toBe(1);
  });
});

describe('syncing at login', () => {
  it('does nothing when there is nothing local', async () => {
    expect(await syncLocalNotes()).toEqual({ found: 0, uploaded: 0, failed: 0, alreadyOnServer: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uploads local notes and clears the key', async () => {
    localStorage.setItem('stairs_notes_abc', JSON.stringify([note('one'), note('two')]));
    const r = await syncLocalNotes();
    expect(r).toMatchObject({ found: 2, uploaded: 2, failed: 0 });
    expect(createNote).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('stairs_notes_abc')).toBeNull();
  });

  it('does not re-upload a note the server already has', async () => {
    listNotes.mockResolvedValue([{ title: 'one', content: 'body' }]);
    localStorage.setItem('stairs_notes_abc', JSON.stringify([note('one'), note('two')]));
    const r = await syncLocalNotes();
    expect(r).toMatchObject({ uploaded: 1, alreadyOnServer: 1 });
    expect(createNote).toHaveBeenCalledTimes(1);
  });

  it('keeps the local copy when an upload fails', async () => {
    createNote.mockRejectedValue(new Error('offline'));
    localStorage.setItem('stairs_notes_abc', JSON.stringify([note('one')]));
    const r = await syncLocalNotes();
    expect(r).toMatchObject({ uploaded: 0, failed: 1 });
    // Never clear what wasn't saved.
    expect(JSON.parse(localStorage.getItem('stairs_notes_abc'))).toHaveLength(1);
  });

  it('keeps the whole key when only some of it uploaded', async () => {
    createNote.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('offline'));
    localStorage.setItem('stairs_notes_abc', JSON.stringify([note('one'), note('two')]));
    const r = await syncLocalNotes();
    expect(r).toMatchObject({ uploaded: 1, failed: 1 });
    expect(localStorage.getItem('stairs_notes_abc')).not.toBeNull();
  });

  it('a partial failure is picked up on the next login', async () => {
    createNote.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('offline'));
    localStorage.setItem('stairs_notes_abc', JSON.stringify([note('one'), note('two')]));
    await syncLocalNotes();
    // Second attempt: the server now has the first one, the second succeeds.
    listNotes.mockResolvedValue([{ title: 'one', content: 'body' }]);
    createNote.mockReset().mockResolvedValue({});
    const r = await syncLocalNotes();
    expect(r).toMatchObject({ uploaded: 1, alreadyOnServer: 1, failed: 0 });
    expect(localStorage.getItem('stairs_notes_abc')).toBeNull();
  });

  it('defers, keeping everything, when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));
    localStorage.setItem('stairs_notes_abc', JSON.stringify([note('one')]));
    const r = await syncLocalNotes();
    expect(r).toMatchObject({ found: 1, uploaded: 0, deferred: true });
    expect(createNote).not.toHaveBeenCalled();
    expect(localStorage.getItem('stairs_notes_abc')).not.toBeNull();
  });

  it('gives an untitled note a title rather than failing on it', async () => {
    localStorage.setItem('stairs_notes_abc', JSON.stringify([{ ...note(''), title: '' }]));
    await syncLocalNotes();
    expect(createNote.mock.calls[0][0].title).toBe('Untitled note');
  });

  it('carries source and pinned across', async () => {
    localStorage.setItem('stairs_notes_abc', JSON.stringify([
      { ...note('kept'), source: 'ai_chat', pinned: true },
    ]));
    await syncLocalNotes();
    expect(createNote.mock.calls[0][0]).toMatchObject({ source: 'ai_chat', pinned: true });
  });
});
