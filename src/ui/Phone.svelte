<script>
  // The pause menu as the walker's phone: a home screen with widgets (the next train, the moon, today's
  // errands) and apps. A frame in the middle of the screen on a computer, a sheet from the bottom on a phone,
  // the city blurred behind it. Most app contents are the game's own panels, moved in (see index.js).
  import { gsap } from 'gsap';
  import { phone, widgets, hud, calm } from './store.js';

  let { onResume, onClose, onApp, onTravel, onPhoto } = $props();

  const APPS = [
    { id: 'maps', name: 'Maps', tint: 'maps' },
    { id: 'notes', name: 'Notes', tint: 'notes' },
    { id: 'wallet', name: 'Wallet', tint: 'wallet' },
    { id: 'photos', name: 'Photos', tint: 'photos' },
    { id: 'weather', name: 'Weather', tint: 'weather' },
    { id: 'settings', name: 'Settings', tint: 'settings' },
  ];
  const TITLES = { maps: 'Maps', notes: 'Notes', wallet: 'Wallet', photos: 'Photos', weather: 'Tonight in New York', settings: 'Settings' };

  let layer = $state();
  let device = $state();
  let screens = {};
  const dur = (d) => (calm() ? 0 : d);

  // open and close: the phone comes up from below with a little spring
  let shown = false;
  $effect(() => {
    const open = $phone.open;
    if (!layer || open === shown) return;
    shown = open;
    gsap.killTweensOf([layer, device]);
    if (open) {
      gsap.set(layer, { autoAlpha: 1 });
      gsap.fromTo(device, { y: 60, autoAlpha: 0, scale: 0.97 }, { y: 0, autoAlpha: 1, scale: 1, duration: dur(0.5), ease: 'back.out(1.3)' });
    } else {
      gsap.to(device, { y: 50, autoAlpha: 0, duration: dur(0.28), ease: 'power2.in' });
      gsap.to(layer, { autoAlpha: 0, duration: dur(0.3), delay: dur(0.05) });
    }
  });

  // switching apps: the new screen slides in from the side it lives on
  let current = 'home';
  $effect(() => {
    const app = $phone.app;
    if (app === current) return;
    const back = app === 'home';
    current = app;
    const el = screens[app];
    onApp?.(app);
    if (el) gsap.fromTo(el, { x: back ? -24 : 32, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: dur(0.32), ease: 'power3.out' });
    el?.querySelector('.app-body')?.scrollTo(0, 0);
  });

  const go = (app) => phone.update((p) => ({ ...p, app }));
  const finish = () => ($phone.mode === 'title' ? onClose?.() : onResume?.());

  function keys(e) {
    if (!$phone.open) return;
    if (e.key === 'Backspace' && $phone.app !== 'home' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) {
      e.preventDefault();
      go('home');
    }
  }
</script>

<svelte:window onkeydown={keys} />

<div class="phone-layer" bind:this={layer} class:open={$phone.open} aria-hidden={!$phone.open}>
  <div class="phone-scrim"></div>
  <div class="device" bind:this={device} role="dialog" aria-label="Phone menu">
    <div class="status">
      <b>{$hud.clock || '9:41'}</b>
      <span class="island"></span>
      <span class="sig"><i></i><i></i><i></i><i></i><span class="batt"><em style="width:{Math.round($hud.energy * 100)}%"></em></span></span>
    </div>

    <div class="screens">
      <section class="screen home" bind:this={screens.home} hidden={$phone.app !== 'home'}>
        <div class="w-hero">
          <div class="w-eyebrow">{$phone.mode === 'title' ? 'New York City · after dark' : 'Paused'}</div>
          <div class="w-place">{$widgets.place || 'New York'}</div>
          <div class="w-sub">{$widgets.borough}{#if $widgets.memories.total} · {$widgets.memories.found} / {$widgets.memories.total} memories{/if}</div>
        </div>

        <div class="widgets">
          <button class="widget w-train" type="button" onclick={() => onTravel?.()}>
            <span class="w-label">🚇 Next train</span>
            {#if $widgets.train}
              <b>{$widgets.train.name}</b>
              <small>{$widgets.train.walk} min walk{#if $widgets.train.next != null} · train in {$widgets.train.next} min{/if}</small>
            {:else}
              <b>No station near</b><small>Ride to another neighborhood</small>
            {/if}
          </button>
          <div class="widget w-moon">
            <span class="w-label">Moon</span>
            <span class="moon-dot" style="--lit:{$widgets.moon?.lit ?? 0.5};--side:{$widgets.moon?.waxing ? 1 : -1}"></span>
            <small>{$widgets.moon?.name ?? ''}</small>
          </div>
          <button class="widget w-errands" type="button" onclick={() => go('wallet')}>
            <span class="w-label">✓ Errands · ${$widgets.cash}</span>
            {#each $widgets.errands.slice(0, 3) as q}
              <div class="w-errand" class:done={q.done}><i></i><span>{q.text}</span></div>
            {/each}
          </button>
        </div>

        <div class="apps">
          {#each APPS as a}
            <button class="app-icon" type="button" onclick={() => go(a.id)}>
              <span class="tile t-{a.tint}">
                {#if a.id === 'maps'}
                  <svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>
                {:else if a.id === 'notes'}
                  <svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 7h4"/></svg>
                {:else if a.id === 'wallet'}
                  <svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.3"/></svg>
                {:else if a.id === 'photos'}
                  <svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
                {:else if a.id === 'weather'}
                  <svg viewBox="0 0 24 24"><path d="M14 3a6 6 0 1 0 7 7 5 5 0 0 1-7-7z"/><path d="M5 20h10a3 3 0 0 0 0-6 4 4 0 0 0-7.6 1A2.5 2.5 0 0 0 5 20z"/></svg>
                {:else}
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>
                {/if}
              </span>
              <span class="app-name">{a.name}</span>
            </button>
          {/each}
        </div>
      </section>

      {#each APPS as a}
        <section class="screen app" bind:this={screens[a.id]} hidden={$phone.app !== a.id} data-app={a.id}>
          <header class="app-head">
            <button class="back" type="button" onclick={() => go('home')} aria-label="Back to home">‹ Home</button>
            <h2>{TITLES[a.id]}</h2>
          </header>
          <div class="app-body">
            {#if a.id === 'maps'}
              <div class="card here-card">
                <small>You're in</small>
                <b>{$widgets.place}</b>
                <span>{$widgets.borough}</span>
              </div>
              <button class="row-btn" type="button" onclick={() => onTravel?.()}>
                <span>🚇</span><span>Subway map<small>{$widgets.metro ? 'Ride anywhere on the map' : 'Find a memory here to earn a MetroCard'}</small></span><em>›</em>
              </button>
              <h3>Neighborhoods</h3>
              <div data-adopt="picker"></div>
            {:else if a.id === 'notes'}
              <div data-adopt="journal"></div>
              <h3>Your progress</h3>
              <div data-adopt="progress"></div>
            {:else if a.id === 'wallet'}
              <div class="metrocard" class:none={!$widgets.metro}>
                <span class="mc-brand">MetroCard</span>
                <span class="mc-stripe"></span>
                <b>{$widgets.metro ? 'Unlimited ride' : 'No card yet'}</b>
                <small>{$widgets.metro ? 'Valid on all lines tonight' : 'Find a memory in this neighborhood'}</small>
              </div>
              <div class="cash"><small>Cash</small><b>${$widgets.cash}</b></div>
              <h3>Today's errands <small>$10 each</small></h3>
              <div data-adopt="errands"></div>
              <h3>Work</h3>
              <div data-adopt="delivery"></div>
              <h3>Badges</h3>
              <div data-adopt="badges"></div>
            {:else if a.id === 'photos'}
              <p class="lede">Three shots in every neighborhood, of things that are really there.</p>
              <div class="shots">
                {#each $widgets.photos as p}
                  <div class="shot" class:done={p.stars === 3}>
                    <span class="stars">{'★'.repeat(p.stars)}{'☆'.repeat(3 - p.stars)}</span>
                    <span>{p.label}</span>
                  </div>
                {/each}
              </div>
              <button class="row-btn" type="button" onclick={() => onPhoto?.()}>
                <span>📷</span><span>Open the camera<small>Photo mode · P</small></span><em>›</em>
              </button>
            {:else if a.id === 'weather'}
              <div data-adopt="almanac"></div>
              <h3>Time of day</h3>
              <div data-adopt="styles"></div>
            {:else}
              <div data-adopt="quick"></div>
              <div data-adopt="settings"></div>
              <h3>Controls</h3>
              <div data-adopt="controls"></div>
            {/if}
          </div>
        </section>
      {/each}
    </div>

    <div class="dock">
      <button class="resume" type="button" onclick={finish}>
        {#if $phone.mode === 'title'}Back{:else}▶ Resume walking{/if}
      </button>
    </div>
    <div class="homebar"></div>
  </div>
</div>
