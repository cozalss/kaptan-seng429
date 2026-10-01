import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const AGENTS = [
  { id: 'siniflandirici', number: '01', name: 'Sınıflandırıcı', meta: 'm', image: '/images/ajan-1.jpg', description: 'd', notDoes: 'n' },
  { id: 'kanit', number: '04', name: 'Kanıt', meta: 'm', image: '/images/ajan-4.jpg', description: 'd', notDoes: 'n' },
];

describe('agent detail · live plate', () => {
  let createServiceModal;
  let handles;
  let motionParts;
  let modal;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = '<main id="main"></main><div id="overlays"></div>';
    handles = [];
    vi.doMock('./agent-scenes/index.js', () => ({
      createAgentScene: ({ host, agentId }) => {
        if (agentId !== 'siniflandirici') return null;
        const handle = { host, start: vi.fn(), stop: vi.fn(), destroy: vi.fn() };
        handles.push(handle);
        return handle;
      },
    }));
    ({ createServiceModal } = await import('./service-modal.js'));
    const createMotion = (parts) => {
      motionParts = parts;
      return { open: () => parts.onSceneIn(), close: vi.fn(), destroy: vi.fn() };
    };
    modal = createServiceModal({
      mount: document.getElementById('overlays'),
      agents: AGENTS,
      lockScroll: vi.fn(),
      unlockScroll: vi.fn(),
      syncUrl: false,
      createMotion,
    });
  });

  afterEach(() => {
    modal.destroy();
    vi.doUnmock('./agent-scenes/index.js');
    vi.useRealTimers();
  });

  const host = () => document.querySelector('.service-modal__scene');
  const content = () => document.querySelector('.service-modal__content');

  it('shows the plate for an agent that has one and starts it when the type has set', () => {
    modal.open('siniflandirici');
    expect(host().hidden).toBe(false);
    expect(content().classList.contains('service-modal__content--scene')).toBe(true);
    expect(motionParts.scene).toBe(host());
    expect(handles[0].start).toHaveBeenCalledTimes(1);
  });

  it('shows no frame at all for an agent without a plate', () => {
    modal.open('kanit');
    expect(host().hidden).toBe(true);
    expect(content().classList.contains('service-modal__content--scene')).toBe(false);
  });

  it('swaps the plate when the open page switches agents', () => {
    modal.open('siniflandirici');
    modal.open('kanit');
    expect(handles[0].destroy).toHaveBeenCalled();
    expect(host().hidden).toBe(true);
    modal.open('siniflandirici');
    expect(handles[1].start).toHaveBeenCalledTimes(1); // started at once: the type is already set
  });

  it('stops the plate on close and frees it once the page has turned away', () => {
    modal.open('siniflandirici');
    modal.close();
    expect(handles[0].stop).toHaveBeenCalled();
    expect(handles[0].destroy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(handles[0].destroy).toHaveBeenCalled();
    expect(host().hidden).toBe(true);
  });
});
