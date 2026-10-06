// The state the new interface draws from. The game (main.js, hud.js) writes it; the Svelte components in
// this folder read it. Nothing in here knows about three.js.
import { writable, get } from 'svelte/store';

/** The always-on bits of the HUD: where you are, the time, what you're doing. */
export const hud = writable({
  district: '',
  street: '',
  cross: '',
  clock: '',
  temp: null,
  count: 0,
  total: 0,
  hint: '',
  energy: 1,
  ride: 'On foot',
  rideMode: 'walk',
  speed: '',
  prompt: '',
  promptKey: '',
});

/** Messages: [{ id, text, kind }], newest last. */
export const toasts = writable([]);

/** Things to point at: [{ id, kind, label, dist, x, y, on, angle }] in screen pixels (on: inside the view). */
export const markers = writable([]);

/** The walker's phone (the pause menu). mode 'title' before the first walk, then 'pause'. */
export const phone = writable({ open: false, app: 'home', mode: 'title' });

/** Bumped each time you go back to walking (the HUD shows the objective again). */
export const resumed = writable(0);

/** The home screen widgets and the app contents that aren't moved-in DOM: filled in when the phone opens. */
export const widgets = writable({
  train: null, // { name, walk, next }
  moon: null, // { name, lit }
  weather: null, // { temp, label, aqi }
  errands: [], // [{ text, have, need, done }]
  cash: 0,
  metro: false,
  photos: [], // [{ label, stars }]
  place: '',
  borough: '',
  memories: { found: 0, total: 0 },
});

export function patch(store, part) {
  store.update((s) => {
    for (const k in part) if (s[k] !== part[k]) return { ...s, ...part };
    return s;
  });
}

let toastId = 0;
/** Add a message (or keep an identical one up longer); returns its id. */
export function pushToast(text, kind, life) {
  const list = get(toasts);
  const same = list.find((t) => t.text === text && !t.out);
  if (same) {
    clearTimeout(same.timer);
    same.timer = setTimeout(() => dropToast(same.id), life);
    return same.id;
  }
  const t = { id: ++toastId, text, kind };
  t.timer = setTimeout(() => dropToast(t.id), life);
  const live = [...list, t].filter((x) => !x.out);
  // three at most: the oldest goes
  if (live.length > 3) setTimeout(() => dropToast(live[0].id));
  toasts.set([...list, t]);
  return t.id;
}

/** Mark a message as leaving (the component animates it out and then calls removeToast). */
export function dropToast(id) {
  toasts.update((l) => l.map((t) => (t.id === id ? { ...t, out: true } : t)));
}
export function removeToast(id) {
  toasts.update((l) => l.filter((t) => t.id !== id));
}

/** Reduce motion: the OS setting, or the game's own. */
export function calm() {
  return document.documentElement.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}
