import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './ui/input-group'

/** Password field with a show/hide toggle; `id` reaches the input so a surrounding Field label points at it. */
export function PasswordInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const label = visible ? t('connection.password.hide') : t('connection.password.show')
  return <InputGroup className="password-input">
    <InputGroupInput {...props} type={visible ? 'text' : 'password'} />
    <InputGroupAddon align="inline-end">
      <InputGroupButton size="icon-sm" className="password-input-toggle" aria-label={label} title={label} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </InputGroupButton>
    </InputGroupAddon>
  </InputGroup>
}
