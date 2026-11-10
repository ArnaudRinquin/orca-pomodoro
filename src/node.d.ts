declare module 'node:child_process' {
  export function execFile(file: string, args: readonly string[], callback: (error: Error | null) => void): unknown
}

declare const process: { readonly platform: string }
