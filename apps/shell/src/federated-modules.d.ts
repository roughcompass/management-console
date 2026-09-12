// Named apart from remotes.ts on purpose: a sibling `remotes.d.ts` would be
// treated as that module's declaration output and silently dropped.
/** Federated modules resolved by @module-federation/vite at build time. */
declare module 'payments_dash/PaymentsDash' {
  const component: import('react').ComponentType
  export default component
}
declare module 'payments_dash/PaymentsDashNext' {
  const component: import('react').ComponentType
  export default component
}
declare module 'limits_panel/LimitsPanel' {
  const component: import('react').ComponentType
  export default component
}
