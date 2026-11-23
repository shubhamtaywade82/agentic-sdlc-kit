import { useState } from 'react'

function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      Count is {count}
    </button>
  )
}

export default Counter
