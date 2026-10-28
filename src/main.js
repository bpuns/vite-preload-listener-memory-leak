const out = document.getElementById('out')

function mountLeak() {
  // A DOM node that is detached on unmount.
  const el = document.createElement('div')
  el.innerHTML = Array.from({ length: 100 }, (_, i) => `<span>${i}</span>`).join('')
  document.body.appendChild(el)

  // Business data holding a reference to that DOM node.
  const config = { designDom: el }

  // Referencing `config` from an inner function forces V8 to allocate it in the
  // closure context of `mountLeak`. Without this, `config` would stay on the
  // stack and the leak below would not be observable.
  // (In a real app this role is played by the component's render function.)
  const render = () => config.designDom
  render()

  // The leak: this dynamic import is defined in the same function scope.
  // Vite wraps it in __vitePreload(), which attaches `load` / `error`
  // listeners to the generated <link> and never removes them. The <link> lives
  // in document.head forever, so those closures keep this whole scope alive,
  // including `config` and the detached DOM node it points at.
  const load = () => import('./panel.js')
  load()

  // Used by the reproduction steps to check whether the node was collected.
  window.__probe = new WeakRef(el)

  return () => el.remove()
}

let unmountFn = null

document.getElementById('mount').onclick = () => {
  if (unmountFn) unmountFn()
  unmountFn = mountLeak()
  out.textContent = 'mounted'
}

document.getElementById('unmount').onclick = () => {
  if (unmountFn) {
    unmountFn()
    unmountFn = null
  }
  out.textContent = 'unmounted - node removed from the document'
}