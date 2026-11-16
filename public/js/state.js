export const state = { user: null };
export const isAdmin = () => state.user && state.user.rol === 'admin';
export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };
