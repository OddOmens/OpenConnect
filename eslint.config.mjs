import nextVitals from 'eslint-config-next/core-web-vitals'

const config = [
  ...nextVitals,
  {
    rules: {
      // These only matter when building with the React Compiler, which this project doesn't use.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // Sign-in and sign-out deliberately do a full page load so no signed-in state lingers.
      '@next/next/no-location-assign-relative-destination': 'off',
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'data/**', 'tailscale/**'] },
]

export default config
