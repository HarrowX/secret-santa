const configured = import.meta.env.VITE_DOMAIN

export const domain = (configured || window.location.hostname)
  .replace(/^https?:\/\//, '')
  .replace(/\/.*$/, '')
  .replace(/:\d+$/, '')
