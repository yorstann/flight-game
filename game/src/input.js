// Keyboard + pointer input: arrows steer, Shift/Ctrl throttle, Space advances
// panels, P pauses, M mutes, C toggles the cockpit camera, B drops.
export function createInput() {
  const input = {
    left: false, right: false, up: false, down: false,
    throttleUp: false, throttleDown: false,
  };
  const keys = {};
  function apply(code, down) {
    keys[code] = down;
    input.left = !!keys.ArrowLeft;
    input.right = !!keys.ArrowRight;
    input.up = !!keys.ArrowUp;
    input.down = !!keys.ArrowDown;
    input.throttleUp = !!(keys.ShiftLeft || keys.ShiftRight);
    input.throttleDown = !!(keys.ControlLeft || keys.ControlRight);
  }
  const onKeyDown = (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    apply(e.code, true);
    if (window.__game) window.__game.onKey(e.code, e.key);
  };
  const onKeyUp = (e) => apply(e.code, false);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  return input;
}
