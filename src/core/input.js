// Keyboard input mapped to abstract actions. Edge states (pressed/released) last one frame.

export const KEYMAP = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  attack: ['KeyJ', 'KeyZ'],
  item: ['KeyK', 'KeyX'],
  shield: ['KeyL', 'KeyC'],
  dodge: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE', 'Enter'],
  cycle: ['KeyQ', 'Tab'],
  lock: ['KeyR'],
  eat: ['KeyF'],
  map: ['KeyM'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'KeyE', 'KeyJ', 'KeyZ', 'Space'],
  cancel: ['Escape', 'Backspace', 'KeyK', 'KeyX'],
};

export class Input {
  constructor(target) {
    this.down = new Set();
    this.justDown = new Set();
    this.justUp = new Set();
    this.typed = [];
    this.listeners = [];
    if (target) this.attach(target);
  }

  attach(target) {
    const kd = (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) { this.down.add(e.code); this.justDown.add(e.code); }
      if (e.key.length === 1 || e.key === 'Backspace') this.typed.push(e.key);
      for (const l of this.listeners) l(e);
    };
    const ku = (e) => { this.down.delete(e.code); this.justUp.add(e.code); };
    const blur = () => this.clear();
    target.addEventListener('keydown', kd);
    target.addEventListener('keyup', ku);
    target.addEventListener('blur', blur);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    }
  }

  onKey(fn) { this.listeners.push(fn); }

  clear() {
    for (const c of this.down) this.justUp.add(c);
    this.down.clear();
  }

  // Test hooks
  press(code) { this.down.add(code); this.justDown.add(code); }
  release(code) { this.down.delete(code); this.justUp.add(code); }

  held(action) { return KEYMAP[action].some((c) => this.down.has(c)); }
  pressed(action) { return KEYMAP[action].some((c) => this.justDown.has(c)); }
  released(action) { return KEYMAP[action].some((c) => this.justUp.has(c)); }
  keyPressed(code) { return this.justDown.has(code); }

  axis() {
    const x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    const y = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
    return [x, y];
  }

  endFrame() {
    this.justDown.clear();
    this.justUp.clear();
    this.typed.length = 0;
  }
}
