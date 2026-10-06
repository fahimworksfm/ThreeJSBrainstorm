// The new interface: mounts the Svelte HUD and phone, and moves the game's own menu panels (journal, badges,
// settings, the neighborhood picker...) into the phone's apps, so their buttons keep working as they are.
import { mount } from 'svelte';
import { gsap } from 'gsap';
import Hud from './Hud.svelte';
import Phone from './Phone.svelte';
import { phone, widgets, markers, resumed, patch } from './store.js';
import './tokens.css';

/** Which game panels go into which slot in the phone (by element id, or a selector). */
const ADOPT = {
  picker: ['#picker'],
  journal: ['#journal', '#reset'],
  progress: ['[data-pane="journal"] .sub', '[data-pane="journal"] .start-row', '#restorefile'],
  errands: ['#errands'],
  delivery: ['#deliverybtn'],
  badges: ['#badges'],
  almanac: ['#almanac'],
  styles: ['#styles'],
  quick: ['#radiobtn', '#sharebtn'],
  settings: ['#settings'],
  controls: ['[data-pane="controls"] .touch-only', '[data-pane="controls"] .keys'],
};

/**
 * hooks: { resume(), app(id), travel(), photo() }: what the phone's buttons do in the game.
 * Returns the controls main.js uses.
 */
export function startUI(hooks) {
  // the game can hitch for a frame or two while a neighborhood loads: menus still finish on time
  gsap.ticker.lagSmoothing(0);
  document.body.classList.add('ui2');
  const hudRoot = document.createElement('div');
  hudRoot.id = 'ui-hud';
  document.getElementById('hud').append(hudRoot);
  mount(Hud, { target: hudRoot });

  const phoneRoot = document.createElement('div');
  phoneRoot.id = 'ui-phone';
  document.body.append(phoneRoot);
  mount(Phone, {
    target: phoneRoot,
    props: {
      onResume: () => hooks.resume(),
      onClose: () => close(),
      onApp: (id) => hooks.app?.(id),
      onTravel: () => hooks.travel(),
      onPhoto: () => hooks.photo(),
    },
  });

  // the old menu panels, moved into the apps
  for (const [slot, sels] of Object.entries(ADOPT)) {
    const box = phoneRoot.querySelector(`[data-adopt="${slot}"]`);
    for (const sel of sels) for (const el of document.querySelectorAll(sel)) box?.append(el);
  }
  // the title card keeps only the logo, the blurb and Start; the rest is in the phone now
  for (const el of document.querySelectorAll('#overlay .tabs, #overlay .pane')) el.remove();

  function open(app = 'home', mode) {
    phone.update((p) => ({ ...p, open: true, app, mode: mode ?? p.mode }));
    document.body.classList.add('phone-open');
    hooks.app?.(app);
  }
  function close() {
    phone.update((p) => ({ ...p, open: false }));
    document.body.classList.remove('phone-open');
  }
  /** Back to walking (from the title or the pause menu). */
  function walk() {
    close();
    resumed.update((n) => n + 1);
  }
  return {
    open,
    close,
    walk,
    get isOpen() {
      let v = false;
      phone.subscribe((p) => (v = p.open))();
      return v;
    },
    setMode: (mode) => phone.update((p) => ({ ...p, mode })),
    widgets: (part) => patch(widgets, part),
    markers: (list) => markers.set(list),
  };
}
