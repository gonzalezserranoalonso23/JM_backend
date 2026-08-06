import globals from 'globals'
import neostandard from 'neostandard'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'

/** @type {import('eslint').Linter.Config[]} */
export default [
  // 1. Aplica todas las reglas oficiales de Standard JS (Sin puntos y comas)
  ...neostandard({
    globals: {
      ...globals.node // Mantiene habilitado process, __dirname, etc.
    }
  }),

  // 2. Ignorar carpetas (Reemplaza al viejo .eslintignore)
  {
    ignores: ['node_modules/', 'dist/', '.env']
  },

  // 3. Integra Prettier al final para evitar conflictos de reglas
  eslintPluginPrettierRecommended
]
