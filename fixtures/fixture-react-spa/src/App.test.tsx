import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the application heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('fixture-react-spa')
  })

  it('renders the counter with its initial state', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /count is/i }).textContent).toBe('Count is 0')
  })
})
