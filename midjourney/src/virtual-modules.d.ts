/** Virtual module provided by egaki's Vite plugin at runtime. */
declare module 'virtual:egaki-mdx' {
  export const projectRoot: string
  export const compositionWidth: number
  export const compositionHeight: number
}

/** Augment Window for egaki SDK (used by egaki/video transitively). */
interface Window {
  egakiSDK?: any
}
