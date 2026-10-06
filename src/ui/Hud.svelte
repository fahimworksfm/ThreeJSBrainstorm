<script>
  // The in-game HUD: a location and time chip, an objective that shows up when something changes and then
  // fades, energy only while it's moving, a prompt pill, the message stack, and markers that sit on the
  // things you're looking for (or wait at the screen edge, pointing, when they're behind you).
  import { gsap } from 'gsap';
  import { hud, toasts, markers, resumed, removeToast, calm } from './store.js';

  const RIDE_ICON = { walk: '🚶', bike: '🚲', moto: '🏍️', suv: '🚙' };
  const KIND_ICON = { gold: '🏅', money: '$', warn: '!', live: '●', info: '' };

  let streetEl = $state();
  let objEl = $state();
  let energyEl = $state();

  const dur = (d) => (calm() ? 0 : d);

  // a new street: the name slides in
  let lastStreet = '';
  $effect(() => {
    const s = $hud.street;
    if (!streetEl || s === lastStreet) return;
    if (lastStreet) gsap.fromTo(streetEl, { y: 8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: dur(0.35), ease: 'power2.out' });
    lastStreet = s;
  });

  // the objective: up when the count or the target changes, or when you come back from the menu
  let objTimer = 0;
  let lastKey = '';
  function showObjective(ms = 7000) {
    if (!objEl) return;
    gsap.to(objEl, { autoAlpha: 1, y: 0, duration: dur(0.4), ease: 'back.out(1.6)' });
    clearTimeout(objTimer);
    objTimer = setTimeout(() => gsap.to(objEl, { autoAlpha: 0, y: -6, duration: dur(0.6), ease: 'power2.in' }), ms);
  }
  $effect(() => {
    // the target is the memory's name, not the distance that ticks as you walk
    const key = `${$hud.count}/${$hud.total}|${($hud.hint || '').split('·')[0]}`;
    if (key !== lastKey) {
      lastKey = key;
      showObjective();
    }
  });
  $effect(() => {
    if ($resumed) showObjective(6000);
  });

  // energy: only while it's draining or filling back up
  let energyTimer = 0;
  let energyOn = false;
  $effect(() => {
    const e = $hud.energy;
    if (!energyEl) return;
    if (e < 0.995) {
      clearTimeout(energyTimer);
      energyTimer = 0;
      if (!energyOn) {
        energyOn = true;
        gsap.to(energyEl, { autoAlpha: 1, scale: 1, duration: dur(0.25), ease: 'power2.out' });
      }
    } else if (energyOn && !energyTimer) {
      energyTimer = setTimeout(() => {
        energyOn = false;
        energyTimer = 0;
        gsap.to(energyEl, { autoAlpha: 0, scale: 0.92, duration: dur(0.4) });
      }, 1200);
    }
  });

  // messages pop in with a little spring, and slide away when their time is up
  function toastIn(node) {
    gsap.from(node, { y: -14, scale: 0.9, autoAlpha: 0, duration: dur(0.45), ease: 'back.out(2)' });
  }
  $effect(() => {
    for (const t of $toasts) {
      if (!t.out || t.leaving) continue;
      t.leaving = true;
      const node = document.querySelector(`[data-toast="${t.id}"]`);
      if (!node) {
        removeToast(t.id);
        continue;
      }
      gsap.to(node, { autoAlpha: 0, y: -10, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0, duration: dur(0.3), ease: 'power2.in', onComplete: () => removeToast(t.id) });
    }
  });

  const fmtDist = (d) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`);
</script>

<div class="ui-hud">
  <div class="chip loc glass">
    <span class="ride" data-mode={$hud.rideMode} title={$hud.ride}>{RIDE_ICON[$hud.rideMode] ?? '🚶'}</span>
    <div class="where">
      <b bind:this={streetEl}>{$hud.street || $hud.district}</b>
      <small>{$hud.district}{$hud.cross ? ` · ${$hud.cross}` : ''}</small>
    </div>
    <span class="rule"></span>
    <div class="when">
      <b>{$hud.clock}</b>
      <small>{#if $hud.speed}{$hud.speed}{:else if $hud.temp != null}{$hud.temp}°F{:else}NYC{/if}</small>
    </div>
  </div>

  <div class="objective glass" bind:this={objEl}>
    <div class="obj-top">
      <span class="gem"></span>
      <span>Find the memories</span>
      <b>{$hud.count} / {$hud.total}</b>
    </div>
    {#if $hud.total}
      <div class="segs" style="--n:{$hud.total}">
        {#each Array($hud.total) as _, k}<i class:on={k < $hud.count}></i>{/each}
      </div>
    {/if}
    {#if $hud.hint}<div class="obj-hint">{$hud.hint}</div>{/if}
  </div>

  <div class="energy glass" bind:this={energyEl} class:low={$hud.energy < 0.25}>
    <span>⚡</span><i><em style="width:{Math.round($hud.energy * 100)}%"></em></i>
  </div>

  {#if $hud.prompt}
    <div class="prompt glass">
      {#if $hud.promptKey}<kbd>{$hud.promptKey}</kbd>{/if}<span>{$hud.prompt}</span>
    </div>
  {/if}

  <div class="toasts" aria-live="polite">
    {#each $toasts as t (t.id)}
      <div class="toast glass k-{t.kind}" data-toast={t.id} use:toastIn>
        {#if KIND_ICON[t.kind]}<span class="ti">{KIND_ICON[t.kind]}</span>{/if}<span>{t.text}</span>
      </div>
    {/each}
  </div>

  {#each $markers as m (m.id)}
    <div class="marker k-{m.kind}" class:off={!m.on} style="transform:translate({m.x}px,{m.y}px)">
      {#if m.on}
        <span class="pin"></span>
        <small>{fmtDist(m.dist)}</small>
      {:else}
        <span class="arrow" style="transform:rotate({m.angle}rad)"></span>
        <small>{fmtDist(m.dist)}</small>
      {/if}
    </div>
  {/each}
</div>
