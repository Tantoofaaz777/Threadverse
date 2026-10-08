import {
  AO3_RATINGS, AO3_WARNINGS, AO3_CATEGORIES, AO3_TEXT_FIELDS,
  emptyAo3Information, normalizeAo3Information, type Ao3Information,
} from './ao3'

export function mountAo3Editor(
  target: HTMLElement,
  onChange: (information: Ao3Information) => void,
) {
  let information = emptyAo3Information()
  const root = document.createElement('div')
  root.className = 'threadverse-ao3-editor'
  const toggleLabel = document.createElement('label')
  toggleLabel.className = 'threadverse-filter-toggle'
  const toggle = document.createElement('input')
  toggle.type = 'checkbox'
  const track = document.createElement('span')
  track.className = 'threadverse-switch-track'
  track.setAttribute('aria-hidden', 'true')
  toggleLabel.append(toggle, track, document.createTextNode('Include AO3 information in the prompt'))
  root.appendChild(toggleLabel)

  const choices: Array<{ button: HTMLButtonElement; key: 'rating' | 'archiveWarnings' | 'categories'; value: string }> = []
  const inputs = new Map<typeof AO3_TEXT_FIELDS[number][0], HTMLInputElement | HTMLTextAreaElement>()
  for (const [key, label, options] of [
    ['rating', 'Rating', AO3_RATINGS],
    ['archiveWarnings', 'Archive Warnings', AO3_WARNINGS],
    ['categories', 'Category', AO3_CATEGORIES],
  ] as const) {
    const field = document.createElement('fieldset')
    field.className = 'threadverse-ao3-choice-field'
    const legend = document.createElement('legend')
    legend.textContent = label
    const hint = document.createElement('span')
    hint.className = 'threadverse-ao3-choice-hint'
    hint.textContent = key === 'rating' ? 'Choose one' : 'Choose any'
    legend.appendChild(hint)
    const group = document.createElement('div')
    group.className = 'threadverse-ao3-choices'
    for (const value of options) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'threadverse-ao3-choice'
      button.dataset.ao3Choice = key
      button.dataset.value = value
      button.textContent = value
      button.setAttribute('aria-label', value)
      button.addEventListener('click', () => {
        if (key === 'rating') information.rating = information.rating === value ? null : value as Ao3Information['rating']
        else {
          const selected = new Set<string>(information[key])
          if (selected.has(value)) selected.delete(value)
          else selected.add(value)
          information = normalizeAo3Information({ ...information, [key]: [...selected] })
        }
        sync()
        onChange(normalizeAo3Information(information))
      })
      choices.push({ button, key, value })
      group.appendChild(button)
    }
    field.append(legend, group)
    root.appendChild(field)
  }

  for (const [key, label] of AO3_TEXT_FIELDS) {
    const field = document.createElement('label')
    field.className = 'threadverse-ao3-text-field'
    const name = document.createElement('span')
    name.textContent = label
    const input = ['title', 'fandom', 'language'].includes(key)
      ? document.createElement('input') : document.createElement('textarea')
    if (input instanceof HTMLTextAreaElement) input.rows = key === 'summary' ? 3 : 2
    else input.type = 'text'
    input.className = 'threadverse-ao3-text'
    input.placeholder = label === 'Additional Tags' ? 'Slow Burn, Mutual Pining, ...' : `${label}...`
    input.addEventListener('input', () => {
      information[key] = input.value
      onChange(normalizeAo3Information(information))
    })
    inputs.set(key, input)
    field.append(name, input)
    root.appendChild(field)
  }
  toggle.addEventListener('change', () => {
    information.enabled = toggle.checked
    onChange(normalizeAo3Information(information))
  })

  function sync(): void {
    toggle.checked = information.enabled
    for (const { button, key, value } of choices) {
      const selected = key === 'rating' ? information.rating === value : (information[key] as string[]).includes(value)
      button.setAttribute('aria-pressed', String(selected))
    }
    for (const [key, input] of inputs) {
      if (input.value !== information[key]) input.value = information[key]
    }
  }
  target.appendChild(root)
  return {
    update(value: Ao3Information, disabled: boolean) {
      information = normalizeAo3Information(value)
      toggle.disabled = disabled
      for (const { button } of choices) button.disabled = disabled
      for (const input of inputs.values()) input.disabled = disabled
      sync()
    },
    destroy() { root.remove() },
  }
}
