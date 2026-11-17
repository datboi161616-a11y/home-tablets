// Shown for screens that exist in the design but aren't built yet.
export function mount(el, { name, homeRoute = 'home' }) {
  el.innerHTML = `
    <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px">
      <div class="display" style="font-size:48px;font-weight:500;text-transform:capitalize">${name}</div>
      <div class="muted" style="font-size:20px">This screen is coming soon.</div>
      <a href="#/${homeRoute}" class="pill" style="background:var(--ink);color:#fff">Back home</a>
    </div>`;
}
