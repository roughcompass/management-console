// @vitest-environment node
import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import { rules } from '../src/eslint/index.js'

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

describe('eslint rules', () => {
  it('reports a duplicate explicit key without touching the build', () => {
    tester.run('no-duplicate-explicit-key', rules['no-duplicate-explicit-key'] as never, {
      valid: [
        `function Form() {
           return <div><button data-de-provenance-key="save">A</button><button data-de-provenance-key="send">B</button></div>
         }`,
        // The same key in two components is legal: keys are unique per component.
        `function One() { return <button data-de-provenance-key="go">A</button> }
         function Two() { return <button data-de-provenance-key="go">B</button> }`,
      ],
      invalid: [
        {
          code: `function Form() {
                   return <div><button data-de-provenance-key="go">A</button><button data-de-provenance-key="go">B</button></div>
                 }`,
          errors: [{ messageId: 'duplicate' }],
        },
      ],
    })
  })

  it('reports a repeated render with no instance key', () => {
    tester.run('repeated-instance-needs-key', rules['repeated-instance-needs-key'] as never, {
      valid: [
        `function Rows({ rows }) {
           return <ul>{rows.map((row) => <li key={row.id} data-de-instance-key={row.id}>{row.label}</li>)}</ul>
         }`,
        `function Static() { return <ul><li>only</li></ul> }`,
      ],
      invalid: [
        {
          code: `function Rows({ rows }) {
                   return <ul>{rows.map((row) => <li key={row.id}>{row.label}</li>)}</ul>
                 }`,
          errors: [{ messageId: 'missing' }],
        },
      ],
    })
  })

  it('reports a hand-authored provenance id', () => {
    tester.run('no-generated-attribute', rules['no-generated-attribute'] as never, {
      valid: [`function A() { return <div data-de-provenance-key="pinned" /> }`],
      invalid: [
        {
          code: `function A() { return <div data-de-provenance-id="prv_01ABC" /> }`,
          errors: [{ messageId: 'authored' }],
        },
      ],
    })
  })
})
