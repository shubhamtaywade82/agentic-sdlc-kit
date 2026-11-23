import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Counter from './Counter'

describe('Counter', () => {
  it('renders the initial count of 0', () => {
    render(<Counter />)
    expect(screen.getByRole('button', { name: /count is/i }).textContent).toBe('Count is 0')
  })

  it('increments the count on click', () => {
    render(<Counter />)
    const button = screen.getByRole('button', { name: /count is/i })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button.textContent).toBe('Count is 2')
  })
})
