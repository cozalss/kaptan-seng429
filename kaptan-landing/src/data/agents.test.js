import { describe, expect, it } from 'vitest';
import { AGENTS, agentCategory, findAgent } from './agents.js';

describe('AGENTS', () => {
  it('lists the eight pipeline stages in the brief order', () => {
    expect(AGENTS.map((agent) => agent.name)).toEqual([
      'Sınıflandırıcı',
      'Okuyucu',
      'Önemlilik',
      'Kanıt',
      'Şüpheci',
      'Uyum',
      'Kural Motoru',
      'Risk Kapısı',
    ]);
  });

  it('has six LLM agents followed by two deterministic stages', () => {
    expect(AGENTS.map((agent) => agent.kind)).toEqual(['llm', 'llm', 'llm', 'llm', 'llm', 'llm', 'rule', 'rule']);
    expect(AGENTS[2].category).toBe('LLM ajanı · 03');
    expect(AGENTS[6].category).toBe('Deterministik · 07');
    expect(AGENTS[0].kindLabel).toBe('LLM ajanı');
    expect(AGENTS[7].kindLabel).toBe('Deterministik');
  });

  it('gives every agent a unique id, a numbered image set and the full copy', () => {
    expect(new Set(AGENTS.map((agent) => agent.id)).size).toBe(8);
    AGENTS.forEach((agent, index) => {
      expect(agent.image).toBe(`/images/ajan-${index + 1}.jpg`);
      expect(agent.number).toBe(String(index + 1).padStart(2, '0'));
      expect(agent.meta).toMatch(/^Girdi: .+ · Çıktı: .+/);
      expect(agent.description.length).toBeGreaterThan(60);
      expect(agent.notDoes.length).toBeGreaterThan(5);
      expect(Object.isFrozen(agent)).toBe(true);
    });
  });

  it('makes no performance promises', () => {
    AGENTS.forEach((agent) => expect(`${agent.description} ${agent.meta}`).not.toMatch(/garanti|kazandır|en iyi/i));
  });
});

describe('agentCategory', () => {
  it('rejects unknown kinds and bad indices', () => {
    expect(() => agentCategory('x', 0)).toThrow(RangeError);
    expect(() => agentCategory('llm', -1)).toThrow(RangeError);
    expect(() => agentCategory('llm', 1.5)).toThrow(RangeError);
  });
});

describe('findAgent', () => {
  it('finds by id and returns null for unknown ids', () => {
    expect(findAgent('kanit').name).toBe('Kanıt');
    expect(findAgent('nope')).toBeNull();
    expect(findAgent('a', [{ id: 'a' }])).toEqual({ id: 'a' });
  });
});
