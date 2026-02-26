import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConvStore, StrategyAPI, NotesStore, SourcesAPI } from '../api';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn(key => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn(key => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });


describe('ConvStore', () => {
  let store;

  beforeEach(() => {
    localStorageMock.clear();
    store = new ConvStore('test-user');
  });

  it('creates a conversation', () => {
    const conv = store.create('Test Chat');
    expect(conv.id).toBeTruthy();
    expect(conv.title).toBe('Test Chat');
    expect(conv.created_at).toBeTruthy();
  });

  it('lists conversations', () => {
    store.create('Chat 1');
    store.create('Chat 2');
    const list = store.list();
    expect(list.length).toBe(2);
  });

  it('removes a conversation', () => {
    const conv = store.create('To Delete');
    store.remove(conv.id);
    const list = store.list();
    expect(list.find(c => c.id === conv.id)).toBeUndefined();
  });

  it('saves and retrieves messages', () => {
    const conv = store.create('Test');
    const msgs = [{ role: 'user', text: 'Hello' }, { role: 'ai', text: 'Hi' }];
    store.saveMsgs(conv.id, msgs);
    const retrieved = store.msgs(conv.id);
    expect(retrieved).toEqual(msgs);
  });

  it('sets and gets active conversation', () => {
    expect(store.activeId()).toBeNull();
    store.setActive('conv-123');
    expect(store.activeId()).toBe('conv-123');
    store.setActive(null);
    expect(store.activeId()).toBeNull();
  });

  it('returns empty list on invalid JSON', () => {
    localStorageMock.getItem.mockReturnValueOnce('invalid-json');
    expect(store.list()).toEqual([]);
  });
});


describe('NotesStore', () => {
  let store;

  beforeEach(() => {
    localStorageMock.clear();
    store = new NotesStore('test-user');
  });

  it('creates a note', () => {
    const note = store.create('Test Note', 'Content here', 'manual');
    expect(note.id).toBeTruthy();
    expect(note.title).toBe('Test Note');
    expect(note.content).toBe('Content here');
    expect(note.source).toBe('manual');
    expect(note.pinned).toBe(false);
  });

  it('lists notes sorted by updated_at', () => {
    store.create('Note 1', 'A', 'manual');
    store.create('Note 2', 'B', 'ai_chat');
    const list = store.list();
    expect(list.length).toBe(2);
    // Most recently created should be first
    expect(list[0].title).toBe('Note 2');
  });

  it('removes a note', () => {
    const note = store.create('To Remove', 'content', 'manual');
    store.remove(note.id);
    expect(store.list().length).toBe(0);
  });

  it('saves/updates a note', () => {
    const note = store.create('Original', 'old content', 'manual');
    note.title = 'Updated';
    note.content = 'new content';
    store.save(note);
    const list = store.list();
    const found = list.find(n => n.id === note.id);
    expect(found.title).toBe('Updated');
    expect(found.content).toBe('new content');
  });
});


describe('SourcesAPI', () => {
  it('is an object with expected methods', () => {
    expect(SourcesAPI).toBeDefined();
    expect(typeof SourcesAPI.list).toBe('function');
    expect(typeof SourcesAPI.count).toBe('function');
    expect(typeof SourcesAPI.create).toBe('function');
    expect(typeof SourcesAPI.update).toBe('function');
    expect(typeof SourcesAPI.remove).toBe('function');
  });
});
