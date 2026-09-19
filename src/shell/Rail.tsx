/** Side / bottom rail placeholder for tools & village actions. */
export function Rail() {
  const items = ['Look', 'Build', 'Tend', 'Map']

  return (
    <nav className="rail" aria-label="Village tools">
      {items.map((label) => (
        <button key={label} type="button" className="rail-item" disabled>
          {label}
        </button>
      ))}
    </nav>
  )
}
